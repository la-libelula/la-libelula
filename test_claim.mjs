import assert from 'assert';

// Conceptual state machine that mimics the SQL RPC
function claim_alarm_group(dbLogs, idsToClaim, workerToken, now) {
  if (!idsToClaim || idsToClaim.length === 0) return { error: 'Empty array' };
  
  const hasDuplicates = new Set(idsToClaim).size !== idsToClaim.length;
  if (hasDuplicates) return { error: 'Duplicate IDs' };

  const targetRows = dbLogs.filter(l => idsToClaim.includes(l.id));
  
  if (targetRows.length !== idsToClaim.length) return { error: 'Not all rows found' };

  for (const row of targetRows) {
    if (row.status !== 'pending' && row.status !== 'failed') {
      return { error: 'Invalid status in group' };
    }
  }

  // Atomically update
  for (const row of targetRows) {
    row.status = 'processing';
    row.claim_token = workerToken;
    row.claimed_at = now;
  }
  
  return { success: true, claimed_rows: targetRows };
}

function runClaimTests() {
  const t0 = new Date();
  
  // A. Grupo de 1 fila disponible
  let db1 = [{ id: '1', status: 'pending' }];
  let r1 = claim_alarm_group(db1, ['1'], 'token-A', t0);
  assert.ok(r1.success && db1[0].status === 'processing' && db1[0].claim_token === 'token-A', 'A failed');

  // B. Grupo 3/3 disponible
  let db2 = [{ id: '1', status: 'pending' }, { id: '2', status: 'failed' }, { id: '3', status: 'pending' }];
  let r2 = claim_alarm_group(db2, ['1', '2', '3'], 'token-B', t0);
  assert.ok(r2.success && r2.claimed_rows.length === 3, 'B failed');

  // C. Grupo 2/3 disponible
  let db3 = [{ id: '1', status: 'pending' }, { id: '2', status: 'sent' }, { id: '3', status: 'pending' }];
  let r3 = claim_alarm_group(db3, ['1', '2', '3'], 'token-C', t0);
  assert.ok(r3.error, 'C failed');
  assert.strictEqual(db3[0].status, 'pending', 'C partial claim error');

  // D. Una fila processing
  let db4 = [{ id: '1', status: 'processing' }, { id: '2', status: 'pending' }];
  let r4 = claim_alarm_group(db4, ['1', '2'], 'token-D', t0);
  assert.ok(r4.error, 'D failed');

  // E. Una fila sent
  let db5 = [{ id: '1', status: 'sent' }];
  let r5 = claim_alarm_group(db5, ['1'], 'token-E', t0);
  assert.ok(r5.error, 'E failed');

  // F. Una fila obsolete
  let db6 = [{ id: '1', status: 'obsolete' }];
  let r6 = claim_alarm_group(db6, ['1'], 'token-F', t0);
  assert.ok(r6.error, 'F failed');

  // H. Claim no incrementa retry_count
  let db7 = [{ id: '1', status: 'failed', retry_count: 1 }];
  let r7 = claim_alarm_group(db7, ['1'], 'token-H', t0);
  assert.strictEqual(db7[0].retry_count, 1, 'H failed');

  // I. Claim no toca last_attempt_at (unless we mapped it to claimed_at, but we decided claimed_at is new)
  let db8 = [{ id: '1', status: 'pending', last_attempt_at: 'old-date' }];
  claim_alarm_group(db8, ['1'], 'token-I', t0);
  assert.strictEqual(db8[0].last_attempt_at, 'old-date', 'I failed');

  // L. Segundo worker pierde
  let db9 = [{ id: '1', status: 'pending' }];
  claim_alarm_group(db9, ['1'], 'worker1', t0);
  let r9 = claim_alarm_group(db9, ['1'], 'worker2', t0);
  assert.ok(r9.error, 'L failed');

  console.log("All Claim Tests Passed Successfully!");
}

runClaimTests();
