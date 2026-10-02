import { calculateExpectedAlarm } from './alarmSchedule.js';

function getEpoch(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  const time = d.getTime();
  return isNaN(time) ? null : time;
}

const TASK_LABELS = {
  heating: 'Encender calefacción',
  fridge: 'Encender frigorífico',
  hot_water: 'Encender agua caliente',
  outdoor_light: 'Encender luz exterior'
};

const TASK_ORDER = ['heating', 'fridge', 'hot_water', 'outdoor_light'];

export function evaluateAlarmEmission({ now, activeLogs, bookings, settings }) {
  const classifications = {
    future: [],
    due: [],
    stale: [],
    obsolete: [],
    retry_wait: [],
    retry_exhausted: [],
    invalid: []
  };

  const nowEpoch = now.getTime();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const FIFTEEN_MINS_MS = 15 * 60 * 1000;

  for (const log of activeLogs) {
    const logEpoch = getEpoch(log.scheduled_for);
    if (logEpoch === null) {
      classifications.invalid.push({ log_id: log.id, reason: 'invalid_timestamp' });
      continue;
    }

    const booking = bookings.find(b => b.id === log.booking_id);
    if (!booking) {
      classifications.obsolete.push({ log_id: log.id, reason: 'booking_missing' });
      continue;
    }

    if (booking.house_id !== log.house_id) {
      classifications.obsolete.push({ log_id: log.id, reason: 'house_mismatch' });
      continue;
    }

    const setting = settings.find(s => s.house_id === log.house_id && s.alarm_type === log.alarm_type);
    if (!setting) {
      classifications.obsolete.push({ log_id: log.id, reason: 'setting_missing' });
      continue;
    }

    if (!setting.is_enabled) {
      classifications.obsolete.push({ log_id: log.id, reason: 'setting_disabled' });
      continue;
    }

    const calc = calculateExpectedAlarm(booking.check_in, setting.days_before, setting.alarm_time);
    if (calc.error) {
      classifications.invalid.push({ log_id: log.id, reason: 'invalid_schedule_calculation' });
      continue;
    }

    const expectedEpoch = getEpoch(calc.scheduled_for);
    if (expectedEpoch === null || expectedEpoch !== logEpoch) {
      classifications.obsolete.push({ log_id: log.id, reason: 'schedule_changed' });
      continue;
    }

    if (!TASK_LABELS[log.alarm_type]) {
      classifications.invalid.push({ log_id: log.id, reason: 'unknown_alarm_type' });
      continue;
    }

    // Stale check (strictly > 24h)
    if (nowEpoch - expectedEpoch > ONE_DAY_MS) {
      classifications.stale.push({ log_id: log.id, reason: 'stale_alarm' });
      continue;
    }

    if (expectedEpoch > nowEpoch) {
      classifications.future.push({ log_id: log.id, booking_id: log.booking_id, alarm_type: log.alarm_type });
      continue;
    }

    // Retries
    if (log.status === 'failed') {
      const retryCount = parseInt(log.retry_count, 10);
      if (isNaN(retryCount) || retryCount < 0) {
        classifications.invalid.push({ log_id: log.id, reason: 'invalid_retry_count' });
        continue;
      }
      if (retryCount >= 3) {
        classifications.retry_exhausted.push({ log_id: log.id });
        continue;
      }

      if (!log.last_attempt_at) {
         // Valid fallback: if it's failed but no last_attempt_at, we might treat it as wait or due, 
         // but strictly the specs say "if invalid/incoherent classify invalid"
         classifications.invalid.push({ log_id: log.id, reason: 'missing_last_attempt' });
         continue;
      }
      
      const lastAttemptEpoch = getEpoch(log.last_attempt_at);
      if (lastAttemptEpoch === null) {
        classifications.invalid.push({ log_id: log.id, reason: 'invalid_last_attempt' });
        continue;
      }

      if (nowEpoch - lastAttemptEpoch < FIFTEEN_MINS_MS) {
        classifications.retry_wait.push({ log_id: log.id });
        continue;
      }
    }

    // If passed all, it's due
    classifications.due.push({
      log_id: log.id,
      booking_id: booking.id,
      house_id: booking.house_id,
      alarm_type: log.alarm_type,
      scheduled_for: log.scheduled_for,
      expectedEpoch,
      check_in: booking.check_in,
      days_before: setting.days_before,
      alarm_time: calc.alarm_time_trimmed
    });
  }

  // Build Groups
  const groupMap = new Map();
  for (const due of classifications.due) {
    const groupKey = `${due.booking_id}_${due.house_id}_${due.expectedEpoch}`;
    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, {
        house_id: due.house_id,
        scheduled_for: due.scheduled_for,
        expectedEpoch: due.expectedEpoch,
        check_in: due.check_in,
        days_before: due.days_before,
        alarm_time: due.alarm_time,
        tasks: []
      });
    }
    groupMap.get(groupKey).tasks.push(due.alarm_type);
  }

  let groupsToSend = Array.from(groupMap.values());

  // Sort groups by scheduled_for ascending
  groupsToSend.sort((a, b) => a.expectedEpoch - b.expectedEpoch);

  // Format messages and sort tasks
  groupsToSend = groupsToSend.map(g => {
    // Sort tasks stably
    g.tasks.sort((a, b) => TASK_ORDER.indexOf(a) - TASK_ORDER.indexOf(b));

    const houseName = g.house_id === 'gredos' ? 'Gredos' : (g.house_id === 'valles' ? 'Valles' : 'Desconocida');
    const dayContext = g.days_before === 0 ? 'entrada de hoy' : 'próxima entrada';
    
    // Check-in format DD/MM/YYYY
    const ciDate = new Date(g.check_in);
    const formattedCheckIn = `${String(ciDate.getUTCDate()).padStart(2, '0')}/${String(ciDate.getUTCMonth() + 1).padStart(2, '0')}/${ciDate.getUTCFullYear()}`;

    const tasksBullet = g.tasks.map(t => `• ${TASK_LABELS[t]}`).join('\n');

    const message = `🔔 La Libélula de ${houseName}\n\nPreparación para ${dayContext}\n\n⏰ ${g.alarm_time}\n\nTareas:\n${tasksBullet}\n\nEntrada: ${formattedCheckIn}`;
    
    return {
      house_id: g.house_id,
      scheduled_for: g.scheduled_for,
      check_in: g.check_in,
      tasks: g.tasks,
      message
    };
  });

  const summary = {
    active_logs: activeLogs.length,
    due: classifications.due.length,
    future: classifications.future.length,
    stale: classifications.stale.length,
    obsolete: classifications.obsolete.length,
    retry_wait: classifications.retry_wait.length,
    retry_exhausted: classifications.retry_exhausted.length,
    invalid: classifications.invalid.length,
    groups_to_send: groupsToSend.length
  };

  const classifiedCount = summary.due + summary.future + summary.stale + summary.obsolete + summary.retry_wait + summary.retry_exhausted + summary.invalid;
  if (classifiedCount !== activeLogs.length) {
    summary.diagnostic_error = `Classified count (${classifiedCount}) does not match active logs (${activeLogs.length})`;
  }

  // Strip PII (booking_ids, log_ids) from groups and classifications for API return
  // We just return lengths for UI summary, but we might want sanitized arrays.
  const safeClassifications = {
    future: classifications.future.length,
    due: classifications.due.length,
    stale: classifications.stale.map(x => ({ reason: x.reason })),
    obsolete: classifications.obsolete.map(x => ({ reason: x.reason })),
    retry_wait: classifications.retry_wait.length,
    retry_exhausted: classifications.retry_exhausted.length,
    invalid: classifications.invalid.map(x => ({ reason: x.reason }))
  };

  return { summary, safeClassifications, groupsToSend };
}
