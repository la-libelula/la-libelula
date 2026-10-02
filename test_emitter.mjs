import assert from 'assert';
import { evaluateAlarmEmission } from './lib/server/alarmEmitter.js';

const now = new Date('2026-10-15T16:00:00.000Z');

function testRetries() {
  const settings = [{ house_id: 'gredos', alarm_type: 'heating', is_enabled: true, days_before: 1, alarm_time: '18:00' }];
  const bookings = [{ id: 'b1', house_id: 'gredos', check_in: '2026-10-16' }];
  
  // scheduled_for is 10-15T16:00:00Z. `now` is exactly this. 
  
  // <15m
  const logWait = { id: 'l1', booking_id: 'b1', house_id: 'gredos', alarm_type: 'heating', scheduled_for: '2026-10-15T16:00:00.000Z', status: 'failed', retry_count: 1, last_attempt_at: '2026-10-15T15:50:00.000Z' };
  const resWait = evaluateAlarmEmission({ now, activeLogs: [logWait], bookings, settings });
  assert.strictEqual(resWait.safeClassifications.retry_wait, 1, '<15m should be retry_wait');
  assert.strictEqual(resWait.safeClassifications.due, 0, '<15m should NOT be due');

  // =15m
  const logExact = { id: 'l2', booking_id: 'b1', house_id: 'gredos', alarm_type: 'heating', scheduled_for: '2026-10-15T16:00:00.000Z', status: 'failed', retry_count: 1, last_attempt_at: '2026-10-15T15:45:00.000Z' };
  const resExact = evaluateAlarmEmission({ now, activeLogs: [logExact], bookings, settings });
  assert.strictEqual(resExact.safeClassifications.due, 1, '=15m should be due');
  assert.strictEqual(resExact.safeClassifications.retry_wait, 0, '=15m should NOT be retry_wait');

  // >15m
  const logMore = { id: 'l3', booking_id: 'b1', house_id: 'gredos', alarm_type: 'heating', scheduled_for: '2026-10-15T16:00:00.000Z', status: 'failed', retry_count: 1, last_attempt_at: '2026-10-15T15:40:00.000Z' };
  const resMore = evaluateAlarmEmission({ now, activeLogs: [logMore], bookings, settings });
  assert.strictEqual(resMore.safeClassifications.due, 1, '>15m should be due');
}

function testStaleBoundary() {
  const settings = [{ house_id: 'gredos', alarm_type: 'heating', is_enabled: true, days_before: 1, alarm_time: '18:00' }];
  const bookings = [{ id: 'b1', house_id: 'gredos', check_in: '2026-10-15' }]; 
  // check_in 10-15, days_before 1 => 10-14 18:00 local (Madrid). In Oct, 18:00 local = 16:00Z.
  // expectedEpoch = 2026-10-14T16:00:00.000Z.
  
  // =24h
  const logExact = { id: 'l1', booking_id: 'b1', house_id: 'gredos', alarm_type: 'heating', scheduled_for: '2026-10-14T16:00:00.000Z', status: 'pending' };
  const resExact = evaluateAlarmEmission({ now, activeLogs: [logExact], bookings, settings });
  assert.strictEqual(resExact.safeClassifications.due, 1, '=24h should be due');
  assert.strictEqual(resExact.safeClassifications.stale.length, 0, '=24h should NOT be stale');
  
  // >24h (e.g. expected was 10-14 15:59:59.999Z -> wait, we must use whole minutes/hours usually, let's just make expectedEpoch earlier)
  const bookings2 = [{ id: 'b1', house_id: 'gredos', check_in: '2026-10-14' }]; 
  // expected 10-13 18:00 local = 10-13 16:00Z. now is 10-15 16:00Z -> 48h!
  const logMore = { id: 'l2', booking_id: 'b1', house_id: 'gredos', alarm_type: 'heating', scheduled_for: '2026-10-13T16:00:00.000Z', status: 'pending' };
  const resMore = evaluateAlarmEmission({ now, activeLogs: [logMore], bookings: bookings2, settings });
  assert.strictEqual(resMore.safeClassifications.stale.length, 1, '>24h should be stale');
  assert.strictEqual(resMore.safeClassifications.due, 0, '>24h should NOT be due');
}

function testDST() {
  const settings = [{ house_id: 'valles', alarm_type: 'heating', is_enabled: true, days_before: 0, alarm_time: '10:00' }];
  
  // Summer: 2026-06-15. 10:00 local = 08:00Z.
  const bSummer = [{ id: 'b1', house_id: 'valles', check_in: '2026-06-15' }];
  const logSummer = { id: 'l1', booking_id: 'b1', house_id: 'valles', alarm_type: 'heating', scheduled_for: '2026-06-15T08:00:00.000Z', status: 'pending' };
  const resSummer = evaluateAlarmEmission({ now, activeLogs: [logSummer], bookings: bSummer, settings });
  // Should be stale since June is way before Oct
  assert.strictEqual(resSummer.safeClassifications.stale.length, 1, 'Summer should be stale, not schedule_changed');

  // Winter: 2026-12-15. 10:00 local = 09:00Z.
  const bWinter = [{ id: 'b1', house_id: 'valles', check_in: '2026-12-15' }];
  const logWinter = { id: 'l1', booking_id: 'b1', house_id: 'valles', alarm_type: 'heating', scheduled_for: '2026-12-15T09:00:00.000Z', status: 'pending' };
  const resWinter = evaluateAlarmEmission({ now, activeLogs: [logWinter], bookings: bWinter, settings });
  // Should be future since Dec is after Oct
  assert.strictEqual(resWinter.safeClassifications.future, 1, 'Winter should be future, not schedule_changed');
}

function testSameHourBookings() {
  const settings = [{ house_id: 'valles', alarm_type: 'fridge', is_enabled: true, days_before: 0, alarm_time: '10:00' }];
  const bookings = [
    { id: 'bA', house_id: 'valles', check_in: '2026-10-15' },
    { id: 'bB', house_id: 'valles', check_in: '2026-10-15' }
  ];
  const activeLogs = [
    { id: 'l1', booking_id: 'bA', house_id: 'valles', alarm_type: 'fridge', scheduled_for: '2026-10-15T08:00:00.000Z', status: 'pending' },
    { id: 'l2', booking_id: 'bB', house_id: 'valles', alarm_type: 'fridge', scheduled_for: '2026-10-15T08:00:00.000Z', status: 'pending' }
  ];
  const res = evaluateAlarmEmission({ now, activeLogs, bookings, settings });
  
  assert.strictEqual(res.safeClassifications.due, 2, 'Both should be due');
  assert.strictEqual(res.groupsToSend.length, 2, 'Two bookings same hour MUST be separated in two groups');
}

function runAllTests() {
  testRetries();
  testStaleBoundary();
  testDST();
  testSameHourBookings();
  console.log("All Isolated Boundary Emitter Tests Passed Successfully!");
}

runAllTests();
