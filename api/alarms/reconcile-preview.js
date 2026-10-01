import { verifyGlobalAuth } from '../../lib/server/globalAuth.js';
import { getSupabaseBackendClient } from '../../lib/server/supabaseAdmin.js';
import { getMadridDateString, calculateExpectedAlarm } from '../../lib/server/alarmSchedule.js';

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

    // 1. Fetch Bookings (Horizon)
    const { data: bookingsData, error: bookingsError } = await supabase
      .from('bookings')
      .select('id, check_in, check_out, house_id')
      .gte('check_in', pastStr)
      .lte('check_in', futureStr);
    if (bookingsError) throw bookingsError;

    // 2. Fetch Settings
    const { data: settingsData, error: settingsError } = await supabase
      .from('alarm_settings')
      .select('id, house_id, alarm_type, is_enabled, days_before, alarm_time');
    if (settingsError) throw settingsError;

    // 3. Fetch Logs
    // Necesitamos logs pendientes/fallidos para ver si quedan huérfanos u obsoletos, y sent para ver si están cumplidos.
    // Para simplificar sin hacer una query gigante, pedimos:
    // - Todos los pending/failed
    // - Todos los sent y obsolete pero SOLO de los booking_id del horizonte.
    const horizonBookingIds = bookingsData.map(b => b.id);
    
    // Obtenemos los pending y failed (sin límite, necesitamos TODOS para cazar huérfanos de fuera de horizonte)
    const { data: activeLogs, error: activeLogsError } = await supabase
      .from('alarm_log')
      .select('id, booking_id, house_id, alarm_type, scheduled_for, status, sent_at, retry_count, last_attempt_at')
      .in('status', ['pending', 'failed']);
    if (activeLogsError) throw activeLogsError;

    // Obtenemos los sent/obsolete del horizonte
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

    const allLogs = [...activeLogs, ...historicalLogs];

    // Verificar huérfanos reales
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

    const toCreate = [];
    const toObsolete = [];
    const unchanged = [];
    const skippedPast = [];
    const conflicts = [];
    const diagnostics = [];

    const getLogKey = (l) => `${l.booking_id}_${l.alarm_type}_${l.scheduled_for}`;
    const getFuncKey = (bId, aType) => `${bId}_${aType}`;

    // Process Desired State
    for (const booking of bookingsData) {
      if (booking.house_id !== 'gredos' && booking.house_id !== 'valles') {
        diagnostics.push({ booking_id: booking.id, house_id: booking.house_id, alarm_type: 'ALL', reason: 'unsupported_house' });
        continue;
      }

      const houseSettings = settingsData.filter(s => s.house_id === booking.house_id);

      for (const setting of houseSettings) {
        const funcKey = getFuncKey(booking.id, setting.alarm_type);
        const relatedLogs = allLogs.filter(l => l.booking_id === booking.id && l.alarm_type === setting.alarm_type);
        const hasSent = relatedLogs.some(l => l.status === 'sent');

        if (!setting.is_enabled) {
          // Setting disabled, if any pending/failed, obsolete them
          relatedLogs.filter(l => l.status === 'pending' || l.status === 'failed').forEach(l => {
            toObsolete.push({ log_id: l.id, booking_id: l.booking_id, house_id: l.house_id, alarm_type: l.alarm_type, scheduled_for: l.scheduled_for, status: l.status, reason: 'setting_disabled' });
          });
          continue;
        }

        const calc = calculateExpectedAlarm(booking.check_in, setting.days_before, setting.alarm_time);
        if (calc.error) {
          diagnostics.push({ booking_id: booking.id, house_id: booking.house_id, alarm_type: setting.alarm_type, reason: calc.error });
          continue;
        }

        const expectedScheduledFor = calc.scheduled_for;
        const expectedScheduledKey = `${booking.id}_${setting.alarm_type}_${expectedScheduledFor}`;

        // Handle old pending/failed logs
        relatedLogs.filter(l => l.status === 'pending' || l.status === 'failed').forEach(l => {
          if (l.house_id !== booking.house_id) {
            toObsolete.push({ log_id: l.id, booking_id: l.booking_id, house_id: l.house_id, alarm_type: l.alarm_type, scheduled_for: l.scheduled_for, status: l.status, reason: 'house_mismatch' });
          } else if (l.scheduled_for !== expectedScheduledFor || hasSent) {
            const reason = hasSent ? 'already_sent_functional_task' : 'schedule_changed';
            toObsolete.push({ log_id: l.id, booking_id: l.booking_id, house_id: l.house_id, alarm_type: l.alarm_type, scheduled_for: l.scheduled_for, status: l.status, reason });
          }
        });

        // Determine creation
        if (hasSent) {
          // Task already sent, do nothing for creation
        } else {
          const exactMatchLog = relatedLogs.find(l => getLogKey(l) === expectedScheduledKey);

          if (exactMatchLog) {
            if (exactMatchLog.status === 'pending' || exactMatchLog.status === 'failed') {
              unchanged.push({ booking_id: exactMatchLog.booking_id, house_id: exactMatchLog.house_id, alarm_type: exactMatchLog.alarm_type, scheduled_for: exactMatchLog.scheduled_for, status: exactMatchLog.status, reason: 'expected_match' });
            } else if (exactMatchLog.status === 'obsolete') {
              conflicts.push({ booking_id: exactMatchLog.booking_id, house_id: exactMatchLog.house_id, alarm_type: exactMatchLog.alarm_type, scheduled_for: exactMatchLog.scheduled_for, reason: 'obsolete_exact_match' });
            }
          } else {
            // Check if it's in the past (bootstrap check)
            if (new Date(expectedScheduledFor) <= now) {
              skippedPast.push({
                booking_id: booking.id, house_id: booking.house_id, alarm_type: setting.alarm_type, check_in: booking.check_in, days_before: setting.days_before, alarm_time: calc.alarm_time_trimmed, scheduled_local: calc.scheduled_local, scheduled_for: expectedScheduledFor, reason: 'past_event_not_created'
              });
            } else {
              toCreate.push({
                booking_id: booking.id, house_id: booking.house_id, alarm_type: setting.alarm_type, check_in: booking.check_in, days_before: setting.days_before, alarm_time: calc.alarm_time_trimmed, scheduled_local: calc.scheduled_local, scheduled_for: expectedScheduledFor, reason: 'missing_future_alarm'
              });
            }
          }
        }
      }
    }

    // Process active logs out of horizon (to detect deleted bookings)
    for (const log of activeLogs) {
      if (!allValidBookingIds.has(log.booking_id)) {
        // booking deleted physically
        toObsolete.push({ log_id: log.id, booking_id: log.booking_id, house_id: log.house_id, alarm_type: log.alarm_type, scheduled_for: log.scheduled_for, status: log.status, reason: 'booking_deleted' });
      }
    }

    const sortFn = (a, b) => new Date(a.scheduled_for) - new Date(b.scheduled_for);
    toCreate.sort(sortFn);
    toObsolete.sort(sortFn);
    unchanged.sort(sortFn);
    skippedPast.sort(sortFn);
    conflicts.sort(sortFn);

    return res.status(200).json({
      ok: true,
      dry_run: true,
      timezone: 'Europe/Madrid',
      generated_at: now.toISOString(),
      summary: {
        bookings_analyzed: bookingsData.length,
        settings_analyzed: settingsData.length,
        logs_analyzed: allLogs.length,
        to_create: toCreate.length,
        to_obsolete: toObsolete.length,
        unchanged: unchanged.length,
        skipped_past: skippedPast.length,
        conflicts: conflicts.length
      },
      to_create: toCreate,
      to_obsolete: toObsolete,
      unchanged: unchanged,
      skipped_past: skippedPast,
      conflicts: conflicts,
      diagnostics: diagnostics
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
}
