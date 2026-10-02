import assert from 'assert';
import { sanitizeErrorMessage } from './lib/server/errorSanitizer.js';

let fakeDB = [];

function resetDB() {
  fakeDB = [
    { id: '1', status: 'processing', claim_token: 'TOKEN_A', retry_count: 0 },
    { id: '2', status: 'processing', claim_token: 'TOKEN_A', retry_count: 0 },
    { id: '3', status: 'pending', claim_token: null, retry_count: 0 },
    { id: '4', status: 'sent', claim_token: null, retry_count: 0 }
  ];
}

function mock_complete_alarm_group_success(p_ids, p_claim_token) {
  if (!p_claim_token) throw new Error("null_token");
  if (!p_ids || p_ids.length === 0) throw new Error("empty_array");
  const uniqueIds = new Set(p_ids);
  if (uniqueIds.size !== p_ids.length) throw new Error("duplicate_ids");

  const lockedRows = fakeDB.filter(r => p_ids.includes(r.id) || (r.status === 'processing' && r.claim_token === p_claim_token));
  
  const tokenRows = lockedRows.filter(r => r.status === 'processing' && r.claim_token === p_claim_token);
  if (tokenRows.length > p_ids.length) throw new Error("incomplete_claim_group");

  const requestedRows = lockedRows.filter(r => p_ids.includes(r.id));
  if (requestedRows.length !== p_ids.length) throw new Error("missing_ids");

  const eligibleRows = lockedRows.filter(r => r.status === 'processing' && r.claim_token === p_claim_token && p_ids.includes(r.id));
  if (eligibleRows.length !== p_ids.length) throw new Error("invalid_status_or_token");

  for (const row of lockedRows) {
    if (p_ids.includes(row.id)) {
      row.status = 'sent';
      row.sent_at = new Date().toISOString();
      row.last_attempt_at = new Date().toISOString();
      row.retry_count = (row.retry_count || 0) + 1;
      row.error_message = null;
      row.claim_token = null;
      row.claimed_at = null;
    }
  }
  return p_ids.length;
}

function mock_complete_alarm_group_failure(p_ids, p_claim_token, p_error_message) {
  if (!p_claim_token) throw new Error("null_token");
  if (!p_ids || p_ids.length === 0) throw new Error("empty_array");
  const uniqueIds = new Set(p_ids);
  if (uniqueIds.size !== p_ids.length) throw new Error("duplicate_ids");

  const safe_error = sanitizeErrorMessage(p_error_message);

  const lockedRows = fakeDB.filter(r => p_ids.includes(r.id) || (r.status === 'processing' && r.claim_token === p_claim_token));

  const tokenRows = lockedRows.filter(r => r.status === 'processing' && r.claim_token === p_claim_token);
  if (tokenRows.length > p_ids.length) throw new Error("incomplete_claim_group");

  const requestedRows = lockedRows.filter(r => p_ids.includes(r.id));
  if (requestedRows.length !== p_ids.length) throw new Error("missing_ids");

  const eligibleRows = lockedRows.filter(r => r.status === 'processing' && r.claim_token === p_claim_token && p_ids.includes(r.id));
  if (eligibleRows.length !== p_ids.length) throw new Error("invalid_status_or_token");

  for (const row of lockedRows) {
    if (p_ids.includes(row.id)) {
      row.status = 'failed';
      row.sent_at = null;
      row.last_attempt_at = new Date().toISOString();
      row.retry_count = (row.retry_count || 0) + 1;
      row.error_message = safe_error;
      row.claim_token = null;
      row.claimed_at = null;
    }
  }
  return p_ids.length;
}

function runTests() {
  console.log("Running Completion Tests...");

  resetDB();
  mock_complete_alarm_group_success(['1', '2'], 'TOKEN_A');
  fakeDB.filter(r => ['1', '2'].includes(r.id)).forEach(row => {
    assert.strictEqual(row.status, 'sent');
  });
  
  resetDB();
  let snapshot = JSON.stringify(fakeDB);
  assert.throws(() => mock_complete_alarm_group_success(['1', '2'], 'WRONG'), /invalid_status_or_token/);
  assert.strictEqual(JSON.stringify(fakeDB), snapshot);
  
  assert.throws(() => mock_complete_alarm_group_success(['1', '99'], 'TOKEN_A'), /missing_ids/);
  assert.throws(() => mock_complete_alarm_group_success(['1', '3'], 'TOKEN_A'), /invalid_status_or_token/);
  assert.throws(() => mock_complete_alarm_group_success(['1', '1'], 'TOKEN_A'), /duplicate_ids/);
  assert.throws(() => mock_complete_alarm_group_success(['1', '2'], null), /null_token/);
  assert.throws(() => mock_complete_alarm_group_success([], 'TOKEN_A'), /empty_array/);

  resetDB();
  mock_complete_alarm_group_failure(['1', '2'], 'TOKEN_A', 'Connection timeout');
  fakeDB.filter(r => ['1', '2'].includes(r.id)).forEach(row => {
    assert.strictEqual(row.status, 'failed');
  });

  resetDB();
  snapshot = JSON.stringify(fakeDB);
  assert.throws(() => mock_complete_alarm_group_failure(['1', '2'], 'WRONG', 'Err'), /invalid_status_or_token/);
  assert.strictEqual(JSON.stringify(fakeDB), snapshot);
  
  assert.throws(() => mock_complete_alarm_group_failure(['1', '99'], 'TOKEN_A', 'Err'), /missing_ids/);
  assert.throws(() => mock_complete_alarm_group_failure(['1', '3'], 'TOKEN_A', 'Err'), /invalid_status_or_token/);

  resetDB();
  fakeDB = [
    { id: '1', status: 'processing', claim_token: 'TOKEN_A', retry_count: 0 },
    { id: '2', status: 'processing', claim_token: 'TOKEN_A', retry_count: 0 },
    { id: '3', status: 'processing', claim_token: 'TOKEN_A', retry_count: 0 }
  ];
  snapshot = JSON.stringify(fakeDB);
  assert.throws(() => mock_complete_alarm_group_success(['1', '2'], 'TOKEN_A'), /incomplete_claim_group/);
  assert.strictEqual(JSON.stringify(fakeDB), snapshot);
  mock_complete_alarm_group_success(['1', '2', '3'], 'TOKEN_A');
  assert.strictEqual(fakeDB[0].status, 'sent');
  assert.strictEqual(fakeDB[1].status, 'sent');
  assert.strictEqual(fakeDB[2].status, 'sent');

  resetDB();
  fakeDB.push({ id: '5', status: 'processing', claim_token: 'TOKEN_B' });
  snapshot = JSON.stringify(fakeDB);
  assert.throws(() => mock_complete_alarm_group_success(['1', '5'], 'TOKEN_A'), /invalid_status_or_token/);
  assert.strictEqual(JSON.stringify(fakeDB), snapshot);
  
  assert.throws(() => mock_complete_alarm_group_success(['1', '4'], 'TOKEN_A'), /invalid_status_or_token/);
  
  resetDB();
  mock_complete_alarm_group_success(['1', '2'], 'TOKEN_A');
  snapshot = JSON.stringify(fakeDB);
  assert.throws(() => mock_complete_alarm_group_success(['1', '2'], 'TOKEN_A'), /invalid_status_or_token/);
  assert.strictEqual(JSON.stringify(fakeDB), snapshot);

  resetDB();
  const longMsg = 'X'.repeat(600);
  mock_complete_alarm_group_failure(['1', '2'], 'TOKEN_A', longMsg);
  assert.strictEqual(fakeDB.find(r => r.id === '1').error_message.length, 450);

  resetDB();
  mock_complete_alarm_group_failure(['1', '2'], 'TOKEN_A', null);
  assert.strictEqual(fakeDB.find(r => r.id === '1').error_message, 'Unknown error during completion');

  console.log("All Completion Tests Passed Successfully!");
}
runTests();
