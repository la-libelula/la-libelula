import { verifyGlobalAuth } from '../../lib/server/globalAuth.js';
import { getSupabaseBackendClient } from '../../lib/server/supabaseAdmin.js';
import { getMadridDateString } from '../../lib/server/alarmSchedule.js';
import { calculateReconciliation } from '../../lib/server/alarmReconciliation.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Utilizar POST.' });
  }

  const authResult = await verifyGlobalAuth(req);
  if (authResult.status !== 200) {
    return res.status(authResult.status).json({ ok: false, error: authResult.error });
  }

  const supabase = getSupabaseBackendClient();

  try {
    const now = new Date();
    const pastDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const futureDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const pastStr = getMadridDateString(pastDate);
    const futureStr = getMadridDateString(futureDate);

    
    const { data: bookingsData, error: bookingsError } = await supabase
      .from('bookings')
      .select('id, check_in, check_out, house_id')
      .gte('check_in', pastStr)
      .lte('check_in', futureStr);
    if (bookingsError) throw bookingsError;

    const { data: settingsData, error: settingsError } = await supabase
      .from('alarm_settings')
      .select('id, house_id, alarm_type, is_enabled, days_before, alarm_time');
    if (settingsError) throw settingsError;

    const horizonBookingIds = bookingsData.map(b => b.id);
    
    const { data: activeLogs, error: activeLogsError } = await supabase
      .from('alarm_log')
      .select('id, booking_id, house_id, alarm_type, scheduled_for, status, sent_at, retry_count, last_attempt_at')
      .in('status', ['pending', 'failed'])
      ;
    if (activeLogsError) throw activeLogsError;

    let historicalLogs = [];
    if (horizonBookingIds.length > 0) {
      const { data: histData, error: histError } = await supabase
        .from('alarm_log')
        .select('id, booking_id, house_id, alarm_type, scheduled_for, status, sent_at, retry_count, last_attempt_at')
        .in('status', ['sent', 'obsolete'])
        .in('booking_id', horizonBookingIds);
      if (histError) throw histError;
      historicalLogs = histData;
    }

    const activeBookingIds = new Set(activeLogs.map(l => l.booking_id));
    const bookingIdsToCheck = [];
    for (const bId of activeBookingIds) {
      if (!horizonBookingIds.includes(bId)) {
        bookingIdsToCheck.push(bId);
      }
    }

    let extraBookings = [];
    if (bookingIdsToCheck.length > 0) {
      const { data: exData, error: exError } = await supabase
        .from('bookings')
        .select('id')
        .in('id', bookingIdsToCheck);
      if (exError) throw exError;
      extraBookings = exData;
    }
    const allValidBookingIds = new Set([...horizonBookingIds, ...extraBookings.map(b => b.id)]);

    const result = calculateReconciliation({
      bookingsData,
      settingsData,
      activeLogs,
      historicalLogs,
      allValidBookingIds,
      now
    });

    if (result.conflicts.length > 0 || result.diagnostics.length > 0) {
      return res.status(409).json({
        ok: false,
        error: 'Conflictos o diagnósticos detectados. No se puede escribir.',
        conflicts: result.conflicts.length,
        diagnostics: result.diagnostics.length
      });
    }

    // Escritura conservadora. 1. TO_OBSOLETE
    if (result.toObsolete.length > 0) {
      const obsoleteIds = result.toObsolete.map(o => o.log_id);
      const { data: obsData, error: obsError } = await supabase
        .from('alarm_log')
        .update({ status: 'obsolete' })
        .in('id', obsoleteIds)
        .in('status', ['pending', 'failed'])
        .select('id');
        
      if (obsError) {
        console.error('Error in TO_OBSOLETE:', obsError);
        return res.status(500).json({ ok: false, error: 'Failed to apply obsolete status' });
      }
      
      if (!obsData || obsData.length !== obsoleteIds.length) {
        console.warn('Race condition in TO_OBSOLETE:', { requested: obsoleteIds.length, actual: obsData?.length });
        return res.status(409).json({ ok: false, error: 'Conflicto de concurrencia: el estado de los avisos cambió antes de la escritura.' });
      }
    }

    // 2. TO_CREATE
    if (result.toCreate.length > 0) {
      const insertRows = result.toCreate.map(c => ({
        booking_id: c.booking_id,
        house_id: c.house_id,
        alarm_type: c.alarm_type,
        scheduled_for: c.scheduled_for,
        status: 'pending'
      }));

      const { error: insError } = await supabase
        .from('alarm_log')
        .upsert(insertRows, { onConflict: 'booking_id,alarm_type,scheduled_for', ignoreDuplicates: true });
        
      if (insError) {
        console.error('Error in TO_CREATE:', insError);
        return res.status(500).json({ ok: false, error: 'Failed to create new alarms' });
      }
    }

    return res.status(200).json({
      ok: true,
      reconciled: true,
      generated_at: now.toISOString(),
      summary: {
        created_requested: result.toCreate.length,
        obsoleted_requested: result.toObsolete.length,
        unchanged: result.unchanged.length,
        skipped_past: result.skippedPast.length,
        conflicts: result.conflicts.length
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
}
