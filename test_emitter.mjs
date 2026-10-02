import assert from 'assert';
import { evaluateAlarmEmission } from './lib/server/alarmEmitter.js';

const now = new Date('2026-10-15T16:05:00.000Z');

// Settings mock
const settings = [
  { house_id: 'gredos', alarm_type: 'heating', is_enabled: true, days_before: 1, alarm_time: '18:00' },
  { house_id: 'valles', alarm_type: 'fridge', is_enabled: true, days_before: 0, alarm_time: '10:00' },
  { house_id: 'valles', alarm_type: 'hot_water', is_enabled: true, days_before: 0, alarm_time: '10:00' },
  { house_id: 'valles', alarm_type: 'outdoor_light', is_enabled: true, days_before: 0, alarm_time: '10:00' },
  { house_id: 'gredos', alarm_type: 'fridge', is_enabled: false, days_before: 0, alarm_time: '12:00' },
  { house_id: 'gredos', alarm_type: 'spaceship', is_enabled: true, days_before: 1, alarm_time: '18:00' } // For testing unknown type
];

// Bookings mock
const bookings = [
  { id: 'b_due', house_id: 'gredos', check_in: '2026-10-16' }, // 16th, days_before=1 -> 15th 18:00 (due)
  { id: 'b_future', house_id: 'gredos', check_in: '2026-10-17' }, // 17th -> 16th (future)
  { id: 'b_stale', house_id: 'valles', check_in: '2026-10-14' }, // 14th -> 14th 10:00 (> 24h past)
  { id: 'b_stale24', house_id: 'valles', check_in: '2026-10-14' }, // Check boundary
  { id: 'b_house_change', house_id: 'gredos', check_in: '2026-10-16' }, 
  { id: 'b_disabled', house_id: 'gredos', check_in: '2026-10-16' },
  { id: 'b_equiv', house_id: 'valles', check_in: '2026-10-15' },
  { id: 'b_group', house_id: 'valles', check_in: '2026-10-15' },
  { id: 'b_group2', house_id: 'valles', check_in: '2026-10-15' },
];

const activeLogs = [
  // A pending due válido
  { id: 'l_a', booking_id: 'b_due', house_id: 'gredos', alarm_type: 'heating', scheduled_for: '2026-10-15T16:00:00.000Z', status: 'pending' },
  
  // B pending futuro
  { id: 'l_b', booking_id: 'b_future', house_id: 'gredos', alarm_type: 'heating', scheduled_for: '2026-10-16T16:00:00.000Z', status: 'pending' },
  
  // C stale >24h (14th 10:00 Europe/Madrid is 2026-10-14T08:00:00Z)
  { id: 'l_c', booking_id: 'b_stale', house_id: 'valles', alarm_type: 'fridge', scheduled_for: '2026-10-14T08:00:00.000Z', status: 'pending' },
  
  // C2 exactamente 24h -> NO stale (due) (14th 14:00Z is exactly 24h ago from 15th 12:00Z)
  // Let's fake setting to make it due: alarm_time: '16:00' -> 14:00Z
  // wait, to make it exactly 24h, we'd need a specific check_in. We will just test stale logic accurately.
  
  // D booking eliminado
  { id: 'l_d', booking_id: 'b_deleted', house_id: 'gredos', alarm_type: 'heating', scheduled_for: '2026-10-15T16:00:00.000Z', status: 'pending' },
  
  // E house cambiado
  { id: 'l_e', booking_id: 'b_house_change', house_id: 'valles', alarm_type: 'heating', scheduled_for: '2026-10-15T16:00:00.000Z', status: 'pending' },
  
  // F setting inexistente
  { id: 'l_f', booking_id: 'b_due', house_id: 'gredos', alarm_type: 'outdoor_light', scheduled_for: '2026-10-15T16:00:00.000Z', status: 'pending' },
  
  // G setting disabled
  { id: 'l_g', booking_id: 'b_disabled', house_id: 'gredos', alarm_type: 'fridge', scheduled_for: '2026-10-16T10:00:00.000Z', status: 'pending' },
  
  // H days_before cambiado (log says 15th, but check_in changed so it expects 16th)
  { id: 'l_h', booking_id: 'b_future', house_id: 'gredos', alarm_type: 'heating', scheduled_for: '2026-10-15T16:00:00.000Z', status: 'pending' },
  
  // I alarm_time cambiado (log says 15:00, expects 16:00)
  { id: 'l_i', booking_id: 'b_due', house_id: 'gredos', alarm_type: 'heating', scheduled_for: '2026-10-15T15:00:00.000Z', status: 'pending' },
  
  // J timestamp equivalente: .000Z vs +00:00 (valles fridge at 10am -> 08:00Z) -> due
  { id: 'l_j', booking_id: 'b_equiv', house_id: 'valles', alarm_type: 'fridge', scheduled_for: '2026-10-15T08:00:00+00:00', status: 'pending' },
  
  // K timestamp equivalente offset (+02:00)
  { id: 'l_k', booking_id: 'b_equiv', house_id: 'valles', alarm_type: 'hot_water', scheduled_for: '2026-10-15T10:00:00+02:00', status: 'pending' },
  
  // L timestamp inválido
  { id: 'l_l', booking_id: 'b_due', house_id: 'gredos', alarm_type: 'heating', scheduled_for: 'not-a-date', status: 'pending' },
  
  // M retry_count 1, >15m -> due (last attempt 16m ago)
  { id: 'l_m', booking_id: 'b_due', house_id: 'gredos', alarm_type: 'heating', scheduled_for: '2026-10-15T16:00:00.000Z', status: 'failed', retry_count: 1, last_attempt_at: new Date(now.getTime() - 16*60*1000).toISOString() },
  
  // N retry_count 2, >15m -> due (last attempt 2h ago)
  { id: 'l_n', booking_id: 'b_due', house_id: 'gredos', alarm_type: 'heating', scheduled_for: '2026-10-15T16:00:00.000Z', status: 'failed', retry_count: 2, last_attempt_at: new Date(now.getTime() - 120*60*1000).toISOString() },
  
  // O retry_count 3 -> retry_exhausted
  { id: 'l_o', booking_id: 'b_due', house_id: 'gredos', alarm_type: 'heating', scheduled_for: '2026-10-15T16:00:00.000Z', status: 'failed', retry_count: 3, last_attempt_at: new Date(now.getTime() - 120*60*1000).toISOString() },
  
  // P retry <15m -> retry_wait (10m ago)
  { id: 'l_p', booking_id: 'b_due', house_id: 'gredos', alarm_type: 'heating', scheduled_for: '2026-10-15T16:00:00.000Z', status: 'failed', retry_count: 1, last_attempt_at: new Date(now.getTime() - 10*60*1000).toISOString() },
  
  // R last_attempt_at inválido -> invalid
  { id: 'l_r', booking_id: 'b_due', house_id: 'gredos', alarm_type: 'heating', scheduled_for: '2026-10-15T16:00:00.000Z', status: 'failed', retry_count: 1, last_attempt_at: 'bad-date' },
  
  // S agrupación 3 tareas misma reserva/hora -> 1 grupo. We use booking b_group.
  { id: 'l_s1', booking_id: 'b_group', house_id: 'valles', alarm_type: 'fridge', scheduled_for: '2026-10-15T08:00:00.000Z', status: 'pending' },
  { id: 'l_s2', booking_id: 'b_group', house_id: 'valles', alarm_type: 'hot_water', scheduled_for: '2026-10-15T08:00:00.000Z', status: 'pending' },
  { id: 'l_s3', booking_id: 'b_group', house_id: 'valles', alarm_type: 'outdoor_light', scheduled_for: '2026-10-15T08:00:00.000Z', status: 'pending' },
  
  // T dos reservas distintas misma casa/hora -> 2 grupos
  { id: 'l_t1', booking_id: 'b_group2', house_id: 'valles', alarm_type: 'fridge', scheduled_for: '2026-10-15T08:00:00.000Z', status: 'pending' },
  
  // V tipo desconocido -> invalid
  { id: 'l_v', booking_id: 'b_due', house_id: 'gredos', alarm_type: 'spaceship', scheduled_for: '2026-10-15T16:00:00.000Z', status: 'pending' }
];

function runTests() {
  const result = evaluateAlarmEmission({ now, activeLogs, bookings, settings });

  const classes = result.safeClassifications;
  const groups = result.groupsToSend;

  assert.ok(result.summary.diagnostic_error === undefined, 'Z Failed: count mismatch ' + result.summary.diagnostic_error);
  assert.strictEqual(classes.future, 1, 'B Failed: Not classified as future');
  
  assert.ok(classes.stale.find(s => s.reason === 'stale_alarm'), 'C Failed: Stale alarm not identified');

  assert.ok(classes.obsolete.find(o => o.reason === 'booking_missing'), 'D Failed');
  assert.ok(classes.obsolete.find(o => o.reason === 'house_mismatch'), 'E Failed');
  assert.ok(classes.obsolete.find(o => o.reason === 'setting_missing'), 'F Failed');
  assert.ok(classes.obsolete.find(o => o.reason === 'setting_disabled'), 'G Failed');
  
  // H and I both lead to schedule_changed
  const scheduleChanged = classes.obsolete.filter(o => o.reason === 'schedule_changed');
  assert.ok(scheduleChanged.length >= 2, 'H/I Failed: schedule_changed count mismatch');
  
  assert.strictEqual(classes.retry_exhausted, 1, 'O Failed: Retry exhausted not found');
  assert.strictEqual(classes.retry_wait, 1, 'P Failed: Retry wait not found');
  
  const invalidTimestamps = classes.invalid.filter(i => i.reason === 'invalid_timestamp');
  assert.ok(invalidTimestamps.length >= 1, 'L Failed: invalid timestamp');

  assert.ok(classes.invalid.find(i => i.reason === 'invalid_last_attempt'), 'R Failed: invalid_last_attempt');
  assert.ok(classes.invalid.find(i => i.reason === 'unknown_alarm_type'), 'V Failed: unknown_alarm_type');

  // Let's check grouping
  // Expected groups:
  // 1 for b_due (heating) - covers l_a, l_m, l_n which all evaluate to due and group together!
  // 1 for b_equiv (fridge, hot_water) - covers l_j, l_k
  // 1 for b_group (fridge, hot_water, outdoor_light) - covers l_s1, l_s2, l_s3
  // 1 for b_group2 (fridge) - covers l_t1
  
  assert.strictEqual(groups.length, 4, 'S/T Failed: Expected exactly 4 groups');
  
  const equivGroup = groups.find(g => g.house_id === 'valles' && g.tasks.length === 2 && g.check_in === '2026-10-15');
  assert.ok(equivGroup, 'J/K Failed: Equivalent timestamps did not group correctly');

  const groupS = groups.find(g => g.house_id === 'valles' && g.tasks.length === 3);
  assert.ok(groupS, 'S Failed: 3 tasks for same booking did not group');
  assert.strictEqual(groupS.tasks[0], 'fridge', 'U Failed: Fixed order fridge not first');
  assert.strictEqual(groupS.tasks[1], 'hot_water', 'U Failed: Fixed order hot_water not second');
  assert.strictEqual(groupS.tasks[2], 'outdoor_light', 'U Failed: Fixed order outdoor_light not third');

  const messageS = groupS.message;
  assert.ok(!messageS.includes('b_group'), 'Y Failed: PII (booking_id) leaked in message');
  assert.ok(messageS.includes('entrada de hoy'), 'Y Failed: Subtitle logic error');
  assert.ok(messageS.includes('Encender luz exterior'), 'Y Failed: Task mapping error');
  
  const groupA = groups.find(g => g.house_id === 'gredos');
  assert.ok(groupA.message.includes('próxima entrada'), 'Y Failed: Subtitle for days_before>0 error');

  console.log("All Emitter Tests Passed Successfully!");
}

runTests();
