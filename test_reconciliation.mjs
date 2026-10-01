import assert from 'assert';
import { calculateReconciliation } from './lib/server/alarmReconciliation.js';

// Mocks
const now = new Date('2026-10-01T12:00:00Z');

// Settings (enabled by default)
const settingsData = [
  { id: 1, house_id: 'gredos', alarm_type: 'heating', is_enabled: true, days_before: 1, alarm_time: '23:30' },
  { id: 2, house_id: 'valles', alarm_type: 'heating', is_enabled: true, days_before: 0, alarm_time: '07:00' },
  { id: 3, house_id: 'gredos', alarm_type: 'fridge', is_enabled: false, days_before: 0, alarm_time: '10:00' } // Disabled for test H
];

// Bookings
const bookingsData = [
  { id: 'b1', house_id: 'gredos', check_in: '2026-10-10' }, // Future
  { id: 'b2', house_id: 'valles', check_in: '2026-09-20' }, // Past
  { id: 'b3', house_id: 'valles', check_in: '2026-10-12' }, // For exact match (pending)
  { id: 'b3_f', house_id: 'valles', check_in: '2026-10-13' }, // For exact match (failed)
  { id: 'b4', house_id: 'valles', check_in: '2026-10-15' }, // For schedule changed
  { id: 'b5', house_id: 'gredos', check_in: '2026-10-16' }, // For sent functional
  { id: 'b6', house_id: 'valles', check_in: '2026-10-17' }, // For obsolete exact
  { id: 'b7', house_id: 'gredos', check_in: '2026-10-18' }, // For setting disabled
  { id: 'b8', house_id: 'gredos', check_in: '2026-10-19' }, // For house mismatch
];

// Calculate expected date for b3 heating (Valles, days_before: 0, alarm_time: 07:00) => 2026-10-12 07:00 Madrid -> 05:00 UTC
const b3_expected = '2026-10-12T05:00:00.000Z';
const b3_f_expected = '2026-10-13T05:00:00.000Z';
const b4_expected = '2026-10-15T05:00:00.000Z';
const b4_old = '2026-10-15T06:00:00.000Z';
const b5_expected = '2026-10-15T21:30:00.000Z';
const b6_expected = '2026-10-17T05:00:00.000Z';
const b7_expected = '2026-10-18T08:00:00.000Z';

const allValidBookingIds = new Set(['b1', 'b2', 'b3', 'b3_f', 'b4', 'b5', 'b6', 'b7', 'b8']);

const activeLogs = [
  // C) pending exact
  { id: 'log1', booking_id: 'b3', house_id: 'valles', alarm_type: 'heating', scheduled_for: b3_expected, status: 'pending' },
  // D) failed exact
  { id: 'log2', booking_id: 'b3_f', house_id: 'valles', alarm_type: 'heating', scheduled_for: b3_f_expected, status: 'failed' },
  
  // E) schedule changed
  { id: 'log3', booking_id: 'b4', house_id: 'valles', alarm_type: 'heating', scheduled_for: b4_old, status: 'pending' },
  
  // F) sent exact
  { id: 'log4', booking_id: 'b5', house_id: 'gredos', alarm_type: 'heating', scheduled_for: b5_expected, status: 'pending' },
  
  // H) setting disabled
  { id: 'log5', booking_id: 'b7', house_id: 'gredos', alarm_type: 'fridge', scheduled_for: b7_expected, status: 'pending' },
  
  // I) booking deleted
  { id: 'log6', booking_id: 'deleted_b', house_id: 'gredos', alarm_type: 'heating', scheduled_for: '2026-11-01T10:00:00.000Z', status: 'pending' },
  
  // J) house mismatch
  { id: 'log7', booking_id: 'b8', house_id: 'valles', alarm_type: 'heating', scheduled_for: '2026-10-18T21:30:00.000Z', status: 'pending' },
  
  // Old active log (Test Special)
  { id: 'log8', booking_id: 'deleted_old', house_id: 'valles', alarm_type: 'heating', scheduled_for: '2026-06-01T10:00:00.000Z', status: 'pending' }
];

const historicalLogs = [
  // F) sent exact
  { id: 'hist1', booking_id: 'b5', house_id: 'gredos', alarm_type: 'heating', scheduled_for: b5_expected, status: 'sent' },
  // G) obsolete exact
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

  // A) future missing -> toCreate
  const b1Create = result.toCreate.find(c => c.booking_id === 'b1');
  assert.ok(b1Create, 'Test A Failed: Missing future alarm not in toCreate');

  // B) past missing -> skippedPast
  const b2Skipped = result.skippedPast.find(c => c.booking_id === 'b2');
  assert.ok(b2Skipped, 'Test B Failed: Missing past alarm not in skippedPast');

  // C) pending exact
  const b3Unchanged = result.unchanged.find(c => c.booking_id === 'b3');
  assert.ok(b3Unchanged, 'Test C Failed: Pending exact match not in unchanged');

  // D) failed exact
  const b3fUnchanged = result.unchanged.find(c => c.booking_id === 'b3_f');
  assert.ok(b3fUnchanged, 'Test D Failed: Failed exact match not in unchanged');

  // E) schedule changed -> old obsolete, new toCreate
  const b4Obsolete = result.toObsolete.find(o => o.log_id === 'log3');
  assert.strictEqual(b4Obsolete.reason, 'schedule_changed', 'Test E Failed: Old log not obsoleted due to schedule_changed');
  const b4Create = result.toCreate.find(c => c.booking_id === 'b4');
  assert.ok(b4Create, 'Test E Failed: New alarm not created for changed schedule');

  // F) sent exact/functional -> no toCreate, pending becomes obsolete
  const b5Create = result.toCreate.find(c => c.booking_id === 'b5');
  assert.strictEqual(b5Create, undefined, 'Test F Failed: Should not create alarm if sent exists');
  const b5Obsolete = result.toObsolete.find(o => o.log_id === 'log4');
  assert.strictEqual(b5Obsolete.reason, 'already_sent_functional_task', 'Test F Failed: Pending log not obsoleted when sent exists');

  // G) obsolete exact -> conflict
  const b6Conflict = result.conflicts.find(c => c.booking_id === 'b6');
  assert.strictEqual(b6Conflict.reason, 'obsolete_exact_match', 'Test G Failed: Obsolete exact match should yield conflict');

  // H) setting disabled + pending -> toObsolete
  const b7Obsolete = result.toObsolete.find(o => o.log_id === 'log5');
  assert.strictEqual(b7Obsolete.reason, 'setting_disabled', 'Test H Failed: Disabled setting did not obsolete pending log');

  // I) booking deleted -> toObsolete
  const deletedBObsolete = result.toObsolete.find(o => o.log_id === 'log6');
  assert.strictEqual(deletedBObsolete.reason, 'booking_deleted', 'Test I Failed: Deleted booking did not obsolete pending log');

  // J) house mismatch -> old obsolete, expected toCreate
  const b8Obsolete = result.toObsolete.find(o => o.log_id === 'log7');
  assert.strictEqual(b8Obsolete.reason, 'house_mismatch', 'Test J Failed: House mismatch did not obsolete pending log');
  const b8Create = result.toCreate.find(c => c.booking_id === 'b8');
  assert.ok(b8Create, 'Test J Failed: Correct alarm not created after house mismatch obsolete');
  
  // Test Special: Old active log (90 days ago) -> toObsolete (booking_deleted)
  const oldActiveObsolete = result.toObsolete.find(o => o.log_id === 'log8');
  assert.strictEqual(oldActiveObsolete.reason, 'booking_deleted', 'Test Special Failed: Old active log not obsoleted properly');

  // K) Second execution simulation (simulate b1 created)
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
  
  assert.strictEqual(result2.toCreate.length, 0, 'Test K Failed: Should not create anything on second run');
  assert.strictEqual(result2.unchanged.length, 1, 'Test K Failed: Should have exactly 1 unchanged log');

  // L) Diagnostic invalid data
  const invalidBookings = [ { id: 'b_inv', house_id: 'gredos', check_in: 'invalid-date' } ];
  const result3 = calculateReconciliation({
    bookingsData: invalidBookings,
    settingsData,
    activeLogs: [],
    historicalLogs: [],
    allValidBookingIds: new Set(['b_inv']),
    now
  });
  assert.ok(result3.diagnostics.length > 0, 'Test L Failed: Invalid check_in did not produce diagnostic');

  console.log("All tests passed successfully.");
}

runTests();
