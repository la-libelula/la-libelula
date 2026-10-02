import assert from 'assert';

// State machine simulating the exact logic of the PL/pgSQL function
function claim_alarm_group(dbLogs, idsToClaim, workerToken, now) {
  if (workerToken === null || workerToken === undefined) return { error: 'null_token' };
  
  if (!idsToClaim || idsToClaim.length === 0) return { error: 'empty_array' };
  
  const uniqueIds = new Set(idsToClaim);
  if (uniqueIds.size !== idsToClaim.length) return { error: 'duplicate_ids' };

  // FOR UPDATE lock simulation:
  const targetRows = dbLogs.filter(l => idsToClaim.includes(l.id));
  
  if (targetRows.length !== idsToClaim.length) return { error: 'partial_availability' };

  let eligibleCount = 0;
  for (const row of targetRows) {
    if (row.status === 'pending' || row.status === 'failed') {
      eligibleCount++;
    }
  }

  if (eligibleCount !== idsToClaim.length) return { error: 'invalid_status_in_group' };

  // Atomically update
  for (const row of targetRows) {
    row.status = 'processing';
    row.claim_token = workerToken;
    row.claimed_at = now;
  }
  
  return { success: true, claimed_count: targetRows.length };
}

function runClaimTests() {
  const t0 = new Date().toISOString();
  
  // A grupo 1 pending → success
  let dbA = [{ id: '1', status: 'pending' }];
  let rA = claim_alarm_group(dbA, ['1'], 'token-A', t0);
  assert.ok(rA.success && dbA[0].status === 'processing' && dbA[0].claim_token === 'token-A', 'A failed');

  // B grupo 3/3 → success
  let dbB = [{ id: '1', status: 'pending' }, { id: '2', status: 'failed' }, { id: '3', status: 'pending' }];
  let rB = claim_alarm_group(dbB, ['1', '2', '3'], 'token-B', t0);
  assert.ok(rB.success && rB.claimed_count === 3, 'B failed');

  // C 2/3 disponibles → rechazo, cero cambios
  let dbC = [{ id: '1', status: 'pending' }, { id: '3', status: 'pending' }];
  let rC = claim_alarm_group(dbC, ['1', '2', '3'], 'token-C', t0);
  assert.strictEqual(rC.error, 'partial_availability', 'C failed error');
  assert.strictEqual(dbC[0].status, 'pending', 'C partial mutation');

  // D una processing → rechazo, cero cambios
  let dbD = [{ id: '1', status: 'processing' }, { id: '2', status: 'pending' }];
  let rD = claim_alarm_group(dbD, ['1', '2'], 'token-D', t0);
  assert.strictEqual(rD.error, 'invalid_status_in_group', 'D failed error');
  assert.strictEqual(dbD[1].status, 'pending', 'D partial mutation');

  // E una sent → rechazo
  let dbE = [{ id: '1', status: 'sent' }];
  let rE = claim_alarm_group(dbE, ['1'], 'token-E', t0);
  assert.strictEqual(rE.error, 'invalid_status_in_group', 'E failed error');
  assert.strictEqual(dbE[0].status, 'sent', 'E partial mutation');

  // F una obsolete → rechazo
  let dbF = [{ id: '1', status: 'obsolete' }];
  let rF = claim_alarm_group(dbF, ['1'], 'token-F', t0);
  assert.strictEqual(rF.error, 'invalid_status_in_group', 'F failed error');
  assert.strictEqual(dbF[0].status, 'obsolete', 'F partial mutation');

  // G pending + failed juntos → success
  let dbG = [{ id: '1', status: 'pending' }, { id: '2', status: 'failed' }];
  let rG = claim_alarm_group(dbG, ['1', '2'], 'token-G', t0);
  assert.ok(rG.success && rG.claimed_count === 2, 'G failed');

  // H retry_count no cambia
  let dbH = [{ id: '1', status: 'failed', retry_count: 1 }];
  let rH = claim_alarm_group(dbH, ['1'], 'token-H', t0);
  assert.strictEqual(dbH[0].retry_count, 1, 'H failed');

  // I last_attempt_at no cambia
  let dbI = [{ id: '1', status: 'pending', last_attempt_at: 'old-date' }];
  claim_alarm_group(dbI, ['1'], 'token-I', t0);
  assert.strictEqual(dbI[0].last_attempt_at, 'old-date', 'I failed');

  // J todas las filas reciben mismo claim_token
  // K todas reciben mismo claimed_at
  let dbJ = [{ id: '1', status: 'pending' }, { id: '2', status: 'pending' }];
  claim_alarm_group(dbJ, ['1', '2'], 'token-J', t0);
  assert.strictEqual(dbJ[0].claim_token, 'token-J', 'J failed');
  assert.strictEqual(dbJ[1].claim_token, 'token-J', 'J failed');
  assert.strictEqual(dbJ[0].claimed_at, t0, 'K failed');
  assert.strictEqual(dbJ[1].claimed_at, t0, 'K failed');

  // L segundo worker pierde
  let dbL = [{ id: '1', status: 'pending' }];
  claim_alarm_group(dbL, ['1'], 'worker1', t0);
  let rL = claim_alarm_group(dbL, ['1'], 'worker2', t0);
  assert.strictEqual(rL.error, 'invalid_status_in_group', 'L failed error');
  assert.strictEqual(dbL[0].claim_token, 'worker1', 'L partial mutation');

  // M processing antiguo NO se recupera automáticamente
  // In this RPC simulation, ANY processing row rejects the claim.
  let dbM = [{ id: '1', status: 'processing', claimed_at: 'very-old-date' }];
  let rM = claim_alarm_group(dbM, ['1'], 'worker-new', t0);
  assert.strictEqual(rM.error, 'invalid_status_in_group', 'M failed error');
  assert.strictEqual(dbM[0].claim_token, undefined, 'M partial mutation'); // Was undefined, should stay undefined in mock

  // N array vacío → rechazo
  let dbN = [{ id: '1', status: 'pending' }];
  let rN = claim_alarm_group(dbN, [], 'token-N', t0);
  assert.strictEqual(rN.error, 'empty_array', 'N failed error');

  // O IDs duplicados → rechazo
  let dbO = [{ id: '1', status: 'pending' }];
  let rO = claim_alarm_group(dbO, ['1', '1'], 'token-O', t0);
  assert.strictEqual(rO.error, 'duplicate_ids', 'O failed error');
  assert.strictEqual(dbO[0].status, 'pending', 'O partial mutation');

  // P claim token null → rechazo
  let dbP = [{ id: '1', status: 'pending' }];
  let rP = claim_alarm_group(dbP, ['1'], null, t0);
  assert.strictEqual(rP.error, 'null_token', 'P failed error');
  assert.strictEqual(dbP[0].status, 'pending', 'P partial mutation');

  console.log("All Claim Tests (A-P) Passed Successfully!");
}

runClaimTests();
