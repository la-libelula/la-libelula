import assert from 'assert';
import { calculateReconciliation } from './lib/server/alarmReconciliation.js';

const now = new Date('2026-10-01T12:00:00Z');

const settingsData = [
  { id: 1, house_id: 'gredos', alarm_type: 'heating', is_enabled: true, days_before: 1, alarm_time: '23:30' },
  { id: 2, house_id: 'valles', alarm_type: 'heating', is_enabled: true, days_before: 0, alarm_time: '07:00' },
  { id: 3, house_id: 'gredos', alarm_type: 'fridge', is_enabled: false, days_before: 0, alarm_time: '10:00' }
];

const bookingsData = [
  { id: 'b1', house_id: 'gredos', check_in: '2026-10-10' },
  { id: 'b2', house_id: 'valles', check_in: '2026-09-20' },
  { id: 'b3', house_id: 'valles', check_in: '2026-10-12' },
  { id: 'b3_f', house_id: 'valles', check_in: '2026-10-13' },
  { id: 'b4', house_id: 'valles', check_in: '2026-10-15' },
  { id: 'b5', house_id: 'gredos', check_in: '2026-10-16' },
  { id: 'b6', house_id: 'valles', check_in: '2026-10-17' },
  { id: 'b7', house_id: 'gredos', check_in: '2026-10-18' },
  { id: 'b8', house_id: 'gredos', check_in: '2026-10-19' },
  { id: 'b_eq1', house_id: 'valles', check_in: '2026-10-20' },
  { id: 'b_eq2', house_id: 'valles', check_in: '2026-10-21' },
  { id: 'b_diff', house_id: 'valles', check_in: '2026-10-22' },
  { id: 'b_inv_db', house_id: 'valles', check_in: '2026-10-23' },
];

const b3_expected = '2026-10-12T05:00:00.000Z';
const b3_f_expected = '2026-10-13T05:00:00.000Z';
const b4_old = '2026-10-15T06:00:00.000Z';
const b5_expected = '2026-10-15T21:30:00.000Z';
const b6_expected = '2026-10-17T05:00:00.000Z';
const b7_expected = '2026-10-18T08:00:00.000Z';

const allValidBookingIds = new Set(['b1', 'b2', 'b3', 'b3_f', 'b4', 'b5', 'b6', 'b7', 'b8', 'b_eq1', 'b_eq2', 'b_diff', 'b_inv_db']);

const activeLogs = [
  { id: 'log1', booking_id: 'b3', house_id: 'valles', alarm_type: 'heating', scheduled_for: b3_expected, status: 'pending' },
  { id: 'log2', booking_id: 'b3_f', house_id: 'valles', alarm_type: 'heating', scheduled_for: b3_f_expected, status: 'failed' },
  { id: 'log3', booking_id: 'b4', house_id: 'valles', alarm_type: 'heating', scheduled_for: b4_old, status: 'pending' },
  { id: 'log4', booking_id: 'b5', house_id: 'gredos', alarm_type: 'heating', scheduled_for: b5_expected, status: 'pending' },
  { id: 'log5', booking_id: 'b7', house_id: 'gredos', alarm_type: 'fridge', scheduled_for: b7_expected, status: 'pending' },
  { id: 'log6', booking_id: 'deleted_b', house_id: 'gredos', alarm_type: 'heating', scheduled_for: '2026-11-01T10:00:00.000Z', status: 'pending' },
  { id: 'log7', booking_id: 'b8', house_id: 'valles', alarm_type: 'heating', scheduled_for: '2026-10-18T21:30:00.000Z', status: 'pending' },
  { id: 'log8', booking_id: 'deleted_old', house_id: 'valles', alarm_type: 'heating', scheduled_for: '2026-06-01T10:00:00.000Z', status: 'pending' },
  { id: 'log_eq1', booking_id: 'b_eq1', house_id: 'valles', alarm_type: 'heating', scheduled_for: '2026-10-20T05:00:00+00:00', status: 'pending' },
  { id: 'log_eq2', booking_id: 'b_eq2', house_id: 'valles', alarm_type: 'heating', scheduled_for: '2026-10-21T07:00:00+02:00', status: 'pending' },
  { id: 'log_diff', booking_id: 'b_diff', house_id: 'valles', alarm_type: 'heating', scheduled_for: '2026-10-22T06:00:00.000Z', status: 'pending' },
  { id: 'log_inv', booking_id: 'b_inv_db', house_id: 'valles', alarm_type: 'heating', scheduled_for: 'not-a-date', status: 'pending' },
];

const historicalLogs = [
  { id: 'hist1', booking_id: 'b5', house_id: 'gredos', alarm_type: 'heating', scheduled_for: b5_expected, status: 'sent' },
  { id: 'hist2', booking_id: 'b6', house_id: 'valles', alarm_type: 'heating', scheduled_for: b6_expected, status: 'obsolete' },
];

function runTests() {
  const result = calculateReconciliation({
    bookingsData,
    settingsData,
    activeLogs,
    historicalLogs,
    allValidBookingIds,
    now
  });

  const b1Create = result.toCreate.find(c => c.booking_id === 'b1');
  assert.ok(b1Create, 'Test A Failed');

  const b2Skipped = result.skippedPast.find(c => c.booking_id === 'b2');
  assert.ok(b2Skipped, 'Test B Failed');

  const b3Unchanged = result.unchanged.find(c => c.booking_id === 'b3');
  assert.ok(b3Unchanged, 'Test C Failed');

  const b3fUnchanged = result.unchanged.find(c => c.booking_id === 'b3_f');
  assert.ok(b3fUnchanged, 'Test D Failed');

  const b4Obsolete = result.toObsolete.find(o => o.log_id === 'log3');
  assert.strictEqual(b4Obsolete.reason, 'schedule_changed', 'Test E Failed');
  const b4Create = result.toCreate.find(c => c.booking_id === 'b4');
  assert.ok(b4Create, 'Test E Failed');

  const b5Create = result.toCreate.find(c => c.booking_id === 'b5');
  assert.strictEqual(b5Create, undefined, 'Test F Failed');
  const b5Obsolete = result.toObsolete.find(o => o.log_id === 'log4');
  assert.strictEqual(b5Obsolete.reason, 'already_sent_functional_task', 'Test F Failed');

  const b6Conflict = result.conflicts.find(c => c.booking_id === 'b6');
  assert.strictEqual(b6Conflict.reason, 'obsolete_exact_match', 'Test G Failed');

  const b7Obsolete = result.toObsolete.find(o => o.log_id === 'log5');
  assert.strictEqual(b7Obsolete.reason, 'setting_disabled', 'Test H Failed');

  const deletedBObsolete = result.toObsolete.find(o => o.log_id === 'log6');
  assert.strictEqual(deletedBObsolete.reason, 'booking_deleted', 'Test I Failed');

  const b8Obsolete = result.toObsolete.find(o => o.log_id === 'log7');
  assert.strictEqual(b8Obsolete.reason, 'house_mismatch', 'Test J Failed');
  const b8Create = result.toCreate.find(c => c.booking_id === 'b8');
  assert.ok(b8Create, 'Test J Failed');
  
  const oldActiveObsolete = result.toObsolete.find(o => o.log_id === 'log8');
  assert.strictEqual(oldActiveObsolete.reason, 'booking_deleted', 'Test Special Failed');

  const simulatedActiveLogs = [
    { id: 'newLog1', booking_id: 'b1', house_id: 'gredos', alarm_type: 'heating', scheduled_for: b1Create.scheduled_for, status: 'pending' }
  ];
  const simBookings = [ { id: 'b1', house_id: 'gredos', check_in: '2026-10-10' } ];
  const result2 = calculateReconciliation({
    bookingsData: simBookings,
    settingsData,
    activeLogs: simulatedActiveLogs,
    historicalLogs: [],
    allValidBookingIds: new Set(['b1']),
    now
  });
  
  assert.strictEqual(result2.toCreate.length, 0, 'Test K Failed');
  assert.strictEqual(result2.unchanged.length, 1, 'Test K Failed');

  const invalidBookings = [ { id: 'b_inv', house_id: 'gredos', check_in: 'invalid-date' } ];
  const result3 = calculateReconciliation({
    bookingsData: invalidBookings,
    settingsData,
    activeLogs: [],
    historicalLogs: [],
    allValidBookingIds: new Set(['b_inv']),
    now
  });
  assert.ok(result3.diagnostics.length > 0, 'Test L Failed');

  // M) Equivalent String
  const bEq1Unchanged = result.unchanged.find(c => c.booking_id === 'b_eq1');
  assert.ok(bEq1Unchanged, 'Test M Failed: Equivalent +00:00 string did not match expected .000Z');

  // N) Equivalent Offset
  const bEq2Unchanged = result.unchanged.find(c => c.booking_id === 'b_eq2');
  assert.ok(bEq2Unchanged, 'Test N Failed: Equivalent +02:00 string did not match expected .000Z');

  // O) Real Difference
  const bDiffObsolete = result.toObsolete.find(o => o.booking_id === 'b_diff');
  assert.ok(bDiffObsolete, 'Test O Failed: Real difference did not obsolete old log');
  const bDiffCreate = result.toCreate.find(c => c.booking_id === 'b_diff');
  assert.ok(bDiffCreate, 'Test O Failed: Real difference did not create new log');

  // P) Invalid DB Timestamp
  const bInvDiag = result.diagnostics.find(d => d.booking_id === 'b_inv_db');
  assert.ok(bInvDiag, 'Test P Failed: Invalid DB timestamp did not produce diagnostic');

  console.log("All tests passed successfully.");
}

runTests();
