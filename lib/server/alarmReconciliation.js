import { calculateExpectedAlarm } from './alarmSchedule.js';

function getEpoch(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  const time = d.getTime();
  return isNaN(time) ? null : time;
}

export function calculateReconciliation({
  bookingsData,
  settingsData,
  activeLogs,
  historicalLogs,
  allValidBookingIds,
  now
}) {
  const allLogs = [...activeLogs, ...historicalLogs];
  const toCreate = [];
  const toObsolete = [];
  const unchanged = [];
  const skippedPast = [];
  const conflicts = [];
  const diagnostics = [];

  const getLogKey = (l) => {
    const ep = getEpoch(l.scheduled_for);
    return `${l.booking_id}_${l.alarm_type}_${ep}`;
  };
  const getFuncKey = (bId, aType) => `${bId}_${aType}`;

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

      const expectedEpoch = getEpoch(calc.scheduled_for);
      if (expectedEpoch === null) {
        diagnostics.push({ booking_id: booking.id, house_id: booking.house_id, alarm_type: setting.alarm_type, reason: 'invalid_expected_timestamp' });
        continue;
      }

      const expectedScheduledKey = `${booking.id}_${setting.alarm_type}_${expectedEpoch}`;

      relatedLogs.filter(l => l.status === 'pending' || l.status === 'failed').forEach(l => {
        if (l.house_id !== booking.house_id) {
          toObsolete.push({ log_id: l.id, booking_id: l.booking_id, house_id: l.house_id, alarm_type: l.alarm_type, scheduled_for: l.scheduled_for, status: l.status, reason: 'house_mismatch' });
        } else {
          const logEpoch = getEpoch(l.scheduled_for);
          if (logEpoch === null) {
            diagnostics.push({ booking_id: l.booking_id, house_id: l.house_id, alarm_type: l.alarm_type, reason: 'invalid_db_timestamp' });
          } else if (logEpoch !== expectedEpoch || hasSent) {
            const reason = hasSent ? 'already_sent_functional_task' : 'schedule_changed';
            toObsolete.push({ log_id: l.id, booking_id: l.booking_id, house_id: l.house_id, alarm_type: l.alarm_type, scheduled_for: l.scheduled_for, status: l.status, reason });
          }
        }
      });

      if (!hasSent) {
        const exactMatchLog = relatedLogs.find(l => getLogKey(l) === expectedScheduledKey && l.house_id === booking.house_id);

        if (exactMatchLog) {
          if (exactMatchLog.status === 'pending' || exactMatchLog.status === 'failed') {
            unchanged.push({ booking_id: exactMatchLog.booking_id, house_id: exactMatchLog.house_id, alarm_type: exactMatchLog.alarm_type, scheduled_for: exactMatchLog.scheduled_for, status: exactMatchLog.status, reason: 'expected_match' });
          } else if (exactMatchLog.status === 'obsolete') {
            conflicts.push({ booking_id: exactMatchLog.booking_id, house_id: exactMatchLog.house_id, alarm_type: exactMatchLog.alarm_type, scheduled_for: exactMatchLog.scheduled_for, reason: 'obsolete_exact_match' });
          }
        } else {
          // No need to getEpoch again, expectedEpoch is fine. For skips, compare with now.
          if (expectedEpoch <= now.getTime()) {
            skippedPast.push({
              booking_id: booking.id, house_id: booking.house_id, alarm_type: setting.alarm_type, check_in: booking.check_in, days_before: setting.days_before, alarm_time: calc.alarm_time_trimmed, scheduled_local: calc.scheduled_local, scheduled_for: calc.scheduled_for, reason: 'past_event_not_created'
            });
          } else {
            toCreate.push({
              booking_id: booking.id, house_id: booking.house_id, alarm_type: setting.alarm_type, check_in: booking.check_in, days_before: setting.days_before, alarm_time: calc.alarm_time_trimmed, scheduled_local: calc.scheduled_local, scheduled_for: calc.scheduled_for, reason: 'missing_future_alarm'
            });
          }
        }
      }
    }
  }

  for (const log of activeLogs) {
    if (!allValidBookingIds.has(log.booking_id)) {
      toObsolete.push({ log_id: log.id, booking_id: log.booking_id, house_id: log.house_id, alarm_type: log.alarm_type, scheduled_for: log.scheduled_for, status: log.status, reason: 'booking_deleted' });
    }
  }

  const sortFn = (a, b) => new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime();
  toCreate.sort(sortFn);
  toObsolete.sort(sortFn);
  unchanged.sort(sortFn);
  skippedPast.sort(sortFn);
  conflicts.sort(sortFn);

  // Filter unique obsolete elements just in case multiple reasons matched
  const uniqueToObsoleteMap = new Map();
  for (const obs of toObsolete) {
    if (!uniqueToObsoleteMap.has(obs.log_id)) {
      uniqueToObsoleteMap.set(obs.log_id, obs);
    }
  }
  const uniqueToObsolete = Array.from(uniqueToObsoleteMap.values());
  uniqueToObsolete.sort(sortFn);

  return { toCreate, toObsolete: uniqueToObsolete, unchanged, skippedPast, conflicts, diagnostics };
}
