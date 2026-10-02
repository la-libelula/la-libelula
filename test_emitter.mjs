import assert from 'assert';
import { evaluateAlarmEmission } from './lib/server/alarmEmitter.js';

const now = new Date('2026-10-15T16:00:00.000Z');

const settings = [
  { house_id: 'gredos', alarm_type: 'heating', is_enabled: true, days_before: 1, alarm_time: '18:00' },
  { house_id: 'valles', alarm_type: 'fridge', is_enabled: true, days_before: 0, alarm_time: '10:00' },
  { house_id: 'valles', alarm_type: 'hot_water', is_enabled: true, days_before: 0, alarm_time: '10:00' },
  { house_id: 'valles', alarm_type: 'outdoor_light', is_enabled: true, days_before: 0, alarm_time: '10:00' },
  { house_id: 'gredos', alarm_type: 'fridge', is_enabled: false, days_before: 0, alarm_time: '12:00' },
  { house_id: 'gredos', alarm_type: 'spaceship', is_enabled: true, days_before: 1, alarm_time: '18:00' },
  { house_id: 'gredos', alarm_type: 'hot_water', is_enabled: true, days_before: 0, alarm_time: '18:00' },
  { house_id: 'valles', alarm_type: 'heating', is_enabled: true, days_before: 0, alarm_time: '10:00' }
];

const bookings = [
  { id: 'b_due', house_id: 'gredos', check_in: '2026-10-16' }, 
  { id: 'b_future', house_id: 'gredos', check_in: '2026-10-17' },
  { id: 'b_stale', house_id: 'valles', check_in: '2026-10-14' }, 
  { id: 'b_stale24', house_id: 'gredos', check_in: '2026-10-14' },
  { id: 'b_house_change', house_id: 'gredos', check_in: '2026-10-16' }, 
  { id: 'b_disabled', house_id: 'gredos', check_in: '2026-10-16' },
  { id: 'b_equiv', house_id: 'valles', check_in: '2026-10-15' },
  { id: 'b_group', house_id: 'valles', check_in: '2026-10-15' },
  { id: 'b_group2', house_id: 'valles', check_in: '2026-10-15' },
  { id: 'b_dst_summer', house_id: 'valles', check_in: '2026-10-15' },
  { id: 'b_dst_winter', house_id: 'valles', check_in: '2026-10-15' }
];

const activeLogs = [
  { id: 'l_a', booking_id: 'b_due', house_id: 'gredos', alarm_type: 'heating', scheduled_for: '2026-10-15T16:00:00.000Z', status: 'pending' },
  { id: 'l_b', booking_id: 'b_future', house_id: 'gredos', alarm_type: 'heating', scheduled_for: '2026-10-16T16:00:00.000Z', status: 'pending' },
  { id: 'l_c', booking_id: 'b_stale', house_id: 'valles', alarm_type: 'fridge', scheduled_for: '2026-10-14T08:00:00.000Z', status: 'pending' },
  { id: 'l_c2', booking_id: 'b_stale24', house_id: 'gredos', alarm_type: 'hot_water', scheduled_for: '2026-10-14T16:00:00.000Z', status: 'pending' },
  { id: 'l_d', booking_id: 'b_deleted', house_id: 'gredos', alarm_type: 'heating', scheduled_for: '2026-10-15T16:00:00.000Z', status: 'pending' },
  { id: 'l_e', booking_id: 'b_house_change', house_id: 'valles', alarm_type: 'heating', scheduled_for: '2026-10-15T16:00:00.000Z', status: 'pending' },
  { id: 'l_f', booking_id: 'b_due', house_id: 'gredos', alarm_type: 'outdoor_light', scheduled_for: '2026-10-15T16:00:00.000Z', status: 'pending' },
  { id: 'l_g', booking_id: 'b_disabled', house_id: 'gredos', alarm_type: 'fridge', scheduled_for: '2026-10-16T10:00:00.000Z', status: 'pending' },
  { id: 'l_h', booking_id: 'b_future', house_id: 'gredos', alarm_type: 'heating', scheduled_for: '2026-10-15T16:00:00.000Z', status: 'pending' },
  { id: 'l_i', booking_id: 'b_due', house_id: 'gredos', alarm_type: 'heating', scheduled_for: '2026-10-15T15:00:00.000Z', status: 'pending' },
  { id: 'l_j', booking_id: 'b_equiv', house_id: 'valles', alarm_type: 'fridge', scheduled_for: '2026-10-15T08:00:00+00:00', status: 'pending' },
  { id: 'l_k', booking_id: 'b_equiv', house_id: 'valles', alarm_type: 'hot_water', scheduled_for: '2026-10-15T10:00:00+02:00', status: 'pending' },
  { id: 'l_l', booking_id: 'b_due', house_id: 'gredos', alarm_type: 'heating', scheduled_for: 'not-a-date', status: 'pending' },
  
  { id: 'l_m', booking_id: 'b_due', house_id: 'gredos', alarm_type: 'heating', scheduled_for: '2026-10-15T16:00:00.000Z', status: 'failed', retry_count: 1, last_attempt_at: '2026-10-15T15:44:00.000Z' }, 
  { id: 'l_n', booking_id: 'b_due', house_id: 'gredos', alarm_type: 'heating', scheduled_for: '2026-10-15T16:00:00.000Z', status: 'failed', retry_count: 2, last_attempt_at: '2026-10-15T14:00:00.000Z' }, 
  { id: 'l_o', booking_id: 'b_due', house_id: 'gredos', alarm_type: 'heating', scheduled_for: '2026-10-15T16:00:00.000Z', status: 'failed', retry_count: 3, last_attempt_at: '2026-10-15T14:00:00.000Z' }, 
  { id: 'l_p', booking_id: 'b_due', house_id: 'gredos', alarm_type: 'heating', scheduled_for: '2026-10-15T16:00:00.000Z', status: 'failed', retry_count: 1, last_attempt_at: '2026-10-15T15:50:00.000Z' }, 
  { id: 'l_q', booking_id: 'b_due', house_id: 'gredos', alarm_type: 'heating', scheduled_for: '2026-10-15T16:00:00.000Z', status: 'failed', retry_count: 1, last_attempt_at: '2026-10-15T15:45:00.000Z' }, 
  
  { id: 'l_r', booking_id: 'b_due', house_id: 'gredos', alarm_type: 'heating', scheduled_for: '2026-10-15T16:00:00.000Z', status: 'failed', retry_count: 1, last_attempt_at: 'bad-date' },
  
  { id: 'l_s1', booking_id: 'b_group', house_id: 'valles', alarm_type: 'fridge', scheduled_for: '2026-10-15T08:00:00.000Z', status: 'pending' },
  { id: 'l_s2', booking_id: 'b_group', house_id: 'valles', alarm_type: 'hot_water', scheduled_for: '2026-10-15T08:00:00.000Z', status: 'pending' },
  { id: 'l_s3', booking_id: 'b_group', house_id: 'valles', alarm_type: 'outdoor_light', scheduled_for: '2026-10-15T08:00:00.000Z', status: 'pending' },
  { id: 'l_t1', booking_id: 'b_group2', house_id: 'valles', alarm_type: 'fridge', scheduled_for: '2026-10-15T08:00:00.000Z', status: 'pending' },
  { id: 'l_v', booking_id: 'b_due', house_id: 'gredos', alarm_type: 'spaceship', scheduled_for: '2026-10-15T16:00:00.000Z', status: 'pending' }
];

function runTests() {
  const result = evaluateAlarmEmission({ now, activeLogs, bookings, settings });

  const classes = result.safeClassifications;
  const groups = result.groupsToSend;

  assert.ok(result.summary.diagnostic_error === undefined, 'Z Failed: count mismatch');
  assert.strictEqual(classes.future, 1, 'B Failed: Not classified as future');
  assert.ok(classes.stale.find(s => s.reason === 'stale_alarm'), 'C Failed: Stale alarm not identified');
  
  assert.ok(classes.obsolete.find(o => o.reason === 'booking_missing'), 'D Failed');
  assert.ok(classes.obsolete.find(o => o.reason === 'house_mismatch'), 'E Failed');
  assert.ok(classes.obsolete.find(o => o.reason === 'setting_missing'), 'F Failed');
  assert.ok(classes.obsolete.find(o => o.reason === 'setting_disabled'), 'G Failed');
  
  const scheduleChanged = classes.obsolete.filter(o => o.reason === 'schedule_changed');
  assert.ok(scheduleChanged.length >= 2, 'H/I Failed: schedule_changed count mismatch');
  
  assert.strictEqual(classes.retry_exhausted, 1, 'O Failed: Retry exhausted not found');
  assert.strictEqual(classes.retry_wait, 1, 'P Failed: Retry wait not found');
  
  const invalidTimestamps = classes.invalid.filter(i => i.reason === 'invalid_timestamp');
  assert.ok(invalidTimestamps.length >= 1, 'L Failed: invalid timestamp');
  assert.ok(classes.invalid.find(i => i.reason === 'invalid_last_attempt'), 'R Failed');
  assert.ok(classes.invalid.find(i => i.reason === 'unknown_alarm_type'), 'V Failed');

  const groupS = groups.find(g => g.house_id === 'valles' && g.tasks.length === 3);
  assert.ok(groupS, 'S Failed: 3 tasks for same booking did not group');
  assert.strictEqual(groupS.tasks[0], 'fridge', 'U Failed: Fixed order fridge not first');
  assert.strictEqual(groupS.tasks[1], 'hot_water', 'U Failed: Fixed order hot_water not second');
  assert.strictEqual(groupS.tasks[2], 'outdoor_light', 'U Failed: Fixed order outdoor_light not third');

  const messageS = groupS.message;
  assert.ok(messageS.includes('entrada de hoy'), 'Y Failed: Subtitle logic error for same day');
  
  const groupA = groups.find(g => g.house_id === 'gredos' && g.check_in === '2026-10-16');
  assert.ok(groupA.message.includes('próxima entrada'), 'Y Failed: Subtitle for days_before>0 error');
  assert.ok(groupA.message.includes('Entrada: 16/10/2026'), 'Date formatting failed');

  console.log("All Emitter Tests Passed Successfully!");
}

runTests();
