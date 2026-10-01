import { verifyGlobalAuth } from '../../lib/server/globalAuth.js';
import { getSupabaseBackendClient } from '../../lib/server/supabaseAdmin.js';
import { getMadridDateString } from '../../lib/server/alarmSchedule.js';
import { calculateReconciliation } from '../../lib/server/alarmReconciliation.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Mtodo no permitido. Utilizar GET.' });
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

    // Bounded active logs dates
    
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
    
    // Lectura acotada de logs activos
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

    return res.status(200).json({
      ok: true,
      dry_run: true,
      timezone: 'Europe/Madrid',
      generated_at: now.toISOString(),
      summary: {
        bookings_analyzed: bookingsData.length,
        settings_analyzed: settingsData.length,
        logs_analyzed: activeLogs.length + historicalLogs.length,
        to_create: result.toCreate.length,
        to_obsolete: result.toObsolete.length,
        unchanged: result.unchanged.length,
        skipped_past: result.skippedPast.length,
        conflicts: result.conflicts.length
      },
      ...result
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
}
