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

  const lockedRows = fakeDB.filter(r => p_ids.includes(r.id));
  if (lockedRows.length !== p_ids.length) throw new Error("missing_ids");

  const eligibleRows = lockedRows.filter(r => r.status === 'processing' && r.claim_token === p_claim_token);
  if (eligibleRows.length !== p_ids.length) throw new Error("invalid_status_or_token");

  // Update
  for (const row of lockedRows) {
    row.status = 'sent';
    row.sent_at = new Date().toISOString();
    row.last_attempt_at = new Date().toISOString();
    row.retry_count = (row.retry_count || 0) + 1;
    row.error_message = null;
    row.claim_token = null;
    row.claimed_at = null;
  }
  return p_ids.length;
}

function mock_complete_alarm_group_failure(p_ids, p_claim_token, p_error_message) {
  if (!p_claim_token) throw new Error("null_token");
  if (!p_ids || p_ids.length === 0) throw new Error("empty_array");
  const uniqueIds = new Set(p_ids);
  if (uniqueIds.size !== p_ids.length) throw new Error("duplicate_ids");

  const safe_error = sanitizeErrorMessage(p_error_message);

  const lockedRows = fakeDB.filter(r => p_ids.includes(r.id));
  if (lockedRows.length !== p_ids.length) throw new Error("missing_ids");

  const eligibleRows = lockedRows.filter(r => r.status === 'processing' && r.claim_token === p_claim_token);
  if (eligibleRows.length !== p_ids.length) throw new Error("invalid_status_or_token");

  // Update
  for (const row of lockedRows) {
    row.status = 'failed';
    row.sent_at = null;
    row.last_attempt_at = new Date().toISOString();
    row.retry_count = (row.retry_count || 0) + 1;
    row.error_message = safe_error;
    row.claim_token = null;
    row.claimed_at = null;
  }
  return p_ids.length;
}

function runTests() {
  console.log("Running Completion Tests...");

  // SUCCESS TESTS
  // A. grupo processing + token correcto -> sent
  resetDB();
  mock_complete_alarm_group_success(['1', '2'], 'TOKEN_A');
  fakeDB.filter(r => ['1', '2'].includes(r.id)).forEach(row => {
    assert.strictEqual(row.status, 'sent');
    assert.ok(row.sent_at);
    assert.ok(row.last_attempt_at);
    assert.strictEqual(row.retry_count, 1);
    assert.strictEqual(row.claim_token, null);
    assert.strictEqual(row.claimed_at, null);
    assert.strictEqual(row.error_message, null);
  });
  
  // B. token incorrecto -> rechazo total
  resetDB();
  let snapshot = JSON.stringify(fakeDB);
  assert.throws(() => mock_complete_alarm_group_success(['1', '2'], 'WRONG'), /invalid_status_or_token/);
  assert.strictEqual(JSON.stringify(fakeDB), snapshot);
  
  // C. un ID inexistente -> rechazo total
  assert.throws(() => mock_complete_alarm_group_success(['1', '99'], 'TOKEN_A'), /missing_ids/);
  
  // D. una fila no-processing -> rechazo total
  assert.throws(() => mock_complete_alarm_group_success(['1', '3'], 'TOKEN_A'), /invalid_status_or_token/);
  
  // E. IDs duplicados -> rechazo
  assert.throws(() => mock_complete_alarm_group_success(['1', '1'], 'TOKEN_A'), /duplicate_ids/);
  
  // F. token NULL -> rechazo
  assert.throws(() => mock_complete_alarm_group_success(['1', '2'], null), /null_token/);
  
  // G. grupo vacío -> rechazo
  assert.throws(() => mock_complete_alarm_group_success([], 'TOKEN_A'), /empty_array/);

  // FAILURE TESTS
  // H. grupo processing + token correcto -> failed
  resetDB();
  mock_complete_alarm_group_failure(['1', '2'], 'TOKEN_A', 'Connection timeout');
  fakeDB.filter(r => ['1', '2'].includes(r.id)).forEach(row => {
    assert.strictEqual(row.status, 'failed');
    assert.strictEqual(row.sent_at, null);
    assert.ok(row.last_attempt_at);
    assert.strictEqual(row.retry_count, 1);
    assert.strictEqual(row.error_message, 'Connection timeout');
    assert.strictEqual(row.claim_token, null);
    assert.strictEqual(row.claimed_at, null);
  });

  // I. token incorrecto -> rechazo
  resetDB();
  snapshot = JSON.stringify(fakeDB);
  assert.throws(() => mock_complete_alarm_group_failure(['1', '2'], 'WRONG', 'Err'), /invalid_status_or_token/);
  assert.strictEqual(JSON.stringify(fakeDB), snapshot);
  
  // J. un ID inexistente -> rechazo total
  assert.throws(() => mock_complete_alarm_group_failure(['1', '99'], 'TOKEN_A', 'Err'), /missing_ids/);
  
  // K. una fila no-processing -> rechazo total
  assert.throws(() => mock_complete_alarm_group_failure(['1', '3'], 'TOKEN_A', 'Err'), /invalid_status_or_token/);

  // ATOMICITY / MIXED
  // L. grupo mixto token correcto/incorrecto -> 0 cambios
  resetDB();
  fakeDB.push({ id: '5', status: 'processing', claim_token: 'TOKEN_B' });
  snapshot = JSON.stringify(fakeDB);
  assert.throws(() => mock_complete_alarm_group_success(['1', '5'], 'TOKEN_A'), /invalid_status_or_token/);
  assert.strictEqual(JSON.stringify(fakeDB), snapshot);
  
  // M. grupo mixto processing/sent -> 0 cambios
  assert.throws(() => mock_complete_alarm_group_success(['1', '4'], 'TOKEN_A'), /invalid_status_or_token/);
  
  // N. double-finalization/ownership simulation
  resetDB();
  // 1. Finalizador A completa correctamente
  mock_complete_alarm_group_success(['1', '2'], 'TOKEN_A');
  snapshot = JSON.stringify(fakeDB);
  
  // 2. Finalizador B intenta completar el MISMO grupo con TOKEN_A de nuevo
  assert.throws(() => mock_complete_alarm_group_success(['1', '2'], 'TOKEN_A'), /invalid_status_or_token/);
  // Verificar que B no altera sent_at/retry_count/etc.
  assert.strictEqual(JSON.stringify(fakeDB), snapshot);

  // Variante: finalizador B con TOKEN_B sobre grupo TOKEN_A
  resetDB();
  snapshot = JSON.stringify(fakeDB);
  assert.throws(() => mock_complete_alarm_group_success(['1', '2'], 'TOKEN_B'), /invalid_status_or_token/);
  assert.strictEqual(JSON.stringify(fakeDB), snapshot);
  // Después TOKEN_A todavía puede finalizar correctamente
  mock_complete_alarm_group_success(['1', '2'], 'TOKEN_A');
  assert.strictEqual(fakeDB[0].status, 'sent');

  // BOUNDARIES
  // O. error_message >500 -> resultado seguro <=500 (we check 450)
  resetDB();
  const longMsg = 'X'.repeat(600);
  mock_complete_alarm_group_failure(['1'], 'TOKEN_A', longMsg);
  assert.strictEqual(fakeDB.find(r => r.id === '1').error_message.length, 450);

  // P. error vacío/null -> mensaje genérico seguro
  resetDB();
  mock_complete_alarm_group_failure(['1'], 'TOKEN_A', null);
  assert.strictEqual(fakeDB.find(r => r.id === '1').error_message, 'Unknown error during completion');
  
  resetDB();
  mock_complete_alarm_group_failure(['1'], 'TOKEN_A', '   ');
  assert.strictEqual(fakeDB.find(r => r.id === '1').error_message, 'Unknown error during completion');

  console.log("All Completion Tests Passed Successfully!");
}
runTests();
