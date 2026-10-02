import { createClient } from '@supabase/supabase-js';
import assert from 'assert';

console.log("==================================================");
console.log(" PREPARED INCIDENT RECOVERY (SINGLE ROW)");
console.log("==================================================");

const EXPECTED_LOG_ID = '21a9fea2-1044-4e9a-a4dd-a50347090705';
const EXPECTED_BOOKING_ID = '1b399874-0711-4383-8e8a-d61806d67a9b';
const EXPECTED_HOUSE_ID = 'valles';
const EXPECTED_ALARM_TYPE = 'heating';
const EXPECTED_SCHEDULED_EPOCH = 1790917200000;

const GATE1 = process.env.LIVE_RECOVERY_EXECUTION;
const GATE2 = process.env.LIVE_RECOVERY_EXPECTED_LOG_ID;

if (GATE1 !== 'YES_ONE_GROUP' && GATE1 !== 'YES_ONE_INCIDENT' || GATE2 !== EXPECTED_LOG_ID) {
  console.log("\nRECOVERY DISABLED\nNo Supabase connection attempted.\n");
  runLocalMockTest().catch(err => { console.error(err); process.exit(1); });
} else {
  runControlledRecovery().catch(err => { console.error(err); process.exit(1); });
}

// ------------------------------------------------------------------
// RECOVERY WORKFLOW (INJECTABLE)
// ------------------------------------------------------------------
async function runControlledRecoveryWorkflow(supabase) {
  // FIRST PREFLIGHT (Baseline Global)
  const { data: globalLogs1, error: err1 } = await supabase.from('alarm_log').select('*');
  if (err1) throw err1;

  const processingLogs1 = globalLogs1.filter(r => r.status === 'processing');
  if (processingLogs1.length !== 1) {
    throw new Error(`ABORT: processing global = ${processingLogs1.length} (expected exactly 1)`);
  }

  const target1 = globalLogs1.find(r => r.id === EXPECTED_LOG_ID);
  if (!target1) throw new Error("ABORT: Target log not found");
  
  if (target1.status !== 'processing') throw new Error("ABORT: status not processing");
  if (target1.booking_id !== EXPECTED_BOOKING_ID) throw new Error("ABORT: booking_id mismatch");
  if (target1.house_id !== EXPECTED_HOUSE_ID) throw new Error("ABORT: house_id mismatch");
  if (target1.alarm_type !== EXPECTED_ALARM_TYPE) throw new Error("ABORT: alarm_type mismatch");
  
  const epoch = new Date(target1.scheduled_for).getTime();
  if (epoch !== EXPECTED_SCHEDULED_EPOCH) throw new Error("ABORT: scheduled_for epoch mismatch");

  if (target1.retry_count !== 0) throw new Error("ABORT: retry_count !== 0");
  if (target1.last_attempt_at !== null) throw new Error("ABORT: last_attempt_at !== null");
  if (target1.sent_at !== null) throw new Error("ABORT: sent_at !== null");
  if (target1.error_message !== null) throw new Error("ABORT: error_message !== null");
  if (target1.claim_token === null) throw new Error("ABORT: claim_token === null");
  if (target1.claimed_at === null) throw new Error("ABORT: claimed_at === null");

  const expectedToken = target1.claim_token;
  const expectedClaimedAt = target1.claimed_at;

  // SECOND PREFLIGHT (Revalidation)
  const { data: globalLogs2, error: err2 } = await supabase.from('alarm_log').select('*');
  if (err2) throw err2;
  
  const target2 = globalLogs2.find(r => r.id === EXPECTED_LOG_ID);
  if (!target2) throw new Error("ABORT: Target log lost in second read");
  if (target2.status !== 'processing') throw new Error("ABORT: status not processing in second read");
  if (target2.retry_count !== 0) throw new Error("ABORT: retry_count changed");
  if (target2.last_attempt_at !== null) throw new Error("ABORT: last_attempt_at changed");
  if (target2.sent_at !== null) throw new Error("ABORT: sent_at changed");
  if (target2.claim_token !== expectedToken) throw new Error("ABORT: claim_token mutated");
  if (target2.claimed_at !== expectedClaimedAt) throw new Error("ABORT: claimed_at mutated");

  // ATOMIC RECOVERY RPC EXECUTION
  console.log("\n[EXECUTING RECOVERY RPC]...");
  const { data: rpcData, error: rpcErr } = await supabase.rpc('recover_alarm_claim_incident', {
    p_log_id: EXPECTED_LOG_ID,
    p_expected_claim_token: expectedToken
  });
  
  if (rpcErr) throw rpcErr;
  
  const recoveredCount = rpcData && rpcData[0] ? rpcData[0].recovered_count : null;
  if (typeof recoveredCount !== 'number') {
    throw new Error(`ABORT: RPC returned non-number or unexpected structure: ${JSON.stringify(rpcData)}`);
  }
  
  if (recoveredCount === 0) {
    console.log("manual_review / recovery_failed: RPC recovered 0 rows");
    throw new Error("manual_review / recovery_failed");
  } else if (recoveredCount > 1) {
    console.log("manual_review / impossible_state: RPC recovered >1 rows");
    throw new Error("manual_review / impossible_state");
  } else if (recoveredCount !== 1) {
    throw new Error("manual_review / invalid_count");
  }

  console.log("Recovery RPC Execution Success.");

  // POSTCHECK
  const { data: globalLogs3, error: err3 } = await supabase.from('alarm_log').select('*');
  if (err3) throw err3;

  const processingLogs3 = globalLogs3.filter(r => r.status === 'processing');
  if (processingLogs3.length !== 0) {
    console.log("WARNING: processing global != 0 after recovery (manual review required for other rows)");
    // not throwing strictly to finish report, but logged
  }
  
  const target3 = globalLogs3.find(r => r.id === EXPECTED_LOG_ID);
  if (!target3) throw new Error("POSTCHECK FAILED: target log missing");
  
  console.log("\n[POSTCHECK LOG STATE]");
  console.log(`status: ${target3.status}`);
  console.log(`retry_count: ${target3.retry_count}`);
  console.log(`last_attempt_at: ${target3.last_attempt_at}`);
  console.log(`sent_at: ${target3.sent_at}`);
  console.log(`claim_token_is_null: ${target3.claim_token === null}`);
  console.log(`claimed_at_is_null: ${target3.claimed_at === null}`);
  console.log(`error_message_present: ${!!target3.error_message}`);

  if (target3.status !== 'pending' || target3.claim_token !== null || target3.claimed_at !== null) {
    throw new Error("POSTCHECK FAILED: target log not fully pending and clean");
  }
}

// ------------------------------------------------------------------
// LIVE RECOVERY SCRIPT MAIN (WHEN GATED)
// ------------------------------------------------------------------
async function runControlledRecovery() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase credentials.");
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  await runControlledRecoveryWorkflow(supabase);
}

// ------------------------------------------------------------------
// LOCAL MOCK TEST
// ------------------------------------------------------------------
async function runLocalMockTest() {
  let rpcCalls = 0;
  
  function getMockValidState() {
    return {
      id: EXPECTED_LOG_ID,
      booking_id: EXPECTED_BOOKING_ID,
      house_id: EXPECTED_HOUSE_ID,
      alarm_type: EXPECTED_ALARM_TYPE,
      scheduled_for: new Date(EXPECTED_SCHEDULED_EPOCH).toISOString(),
      status: 'processing',
      retry_count: 0,
      last_attempt_at: null,
      sent_at: null,
      error_message: null,
      claim_token: 'fake-token-123',
      claimed_at: '2026-10-02T10:00:00Z'
    };
  }

  function createMockSupabase(getStateFn, mockRpcRetFn) {
    return {
      from: (table) => ({
        select: (cols) => ({
          then: (resolve) => {
             resolve({ data: getStateFn(), error: null });
          }
        })
      }),
      rpc: async (fnName, params) => {
        if (fnName === 'recover_alarm_claim_incident') {
          rpcCalls++;
          return { data: [mockRpcRetFn(params)], error: null };
        }
        throw new Error("Unexpected RPC");
      }
    };
  }

  async function testFail(stateOverrides, expectedErrorStr, mockRpcRet = { recovered_count: 1 }, dynamicStateFn = null) {
    let reads = 0;
    let st = [getMockValidState()];
    if (stateOverrides) {
        Object.assign(st[0], stateOverrides);
    }
    
    let stateFn = () => {
      reads++;
      if (dynamicStateFn) return dynamicStateFn(reads, st);
      return st;
    };

    const sb = createMockSupabase(stateFn, () => mockRpcRet);
    rpcCalls = 0;
    try {
      await runControlledRecoveryWorkflow(sb);
      assert.fail(`Expected abort: ${expectedErrorStr}`);
    } catch (e) {
      if (e.message.includes('Expected abort')) throw e;
      assert.ok(e.message.includes(expectedErrorStr), `Wrong error: ${e.message} (expected: ${expectedErrorStr})`);
    }
  }

  console.log("Running A, B (Implicitly tested by gate check).");

  console.log("Running C (Target nonexistent)");
  await testFail({}, "processing global = 0", { recovered_count: 1 }, () => []);

  console.log("Running D (Booking distinct)");
  await testFail({ booking_id: 'other' }, "booking_id mismatch");

  console.log("Running E (House distinct)");
  await testFail({ house_id: 'other' }, "house_id mismatch");

  console.log("Running F (Alarm_type distinct)");
  await testFail({ alarm_type: 'other' }, "alarm_type mismatch");

  console.log("Running G (Epoch distinct)");
  await testFail({ scheduled_for: new Date(EXPECTED_SCHEDULED_EPOCH + 1000).toISOString() }, "scheduled_for epoch mismatch");

  console.log("Running H (Status not processing)");
  await testFail({ status: 'pending' }, "global = 0");

  console.log("Running I (Retry != 0)");
  await testFail({ retry_count: 1 }, "retry_count !==");

  console.log("Running J (last_attempt_at != null)");
  await testFail({ last_attempt_at: '2026' }, "last_attempt_at !==");

  console.log("Running K (sent_at != null)");
  await testFail({ sent_at: '2026' }, "sent_at !==");

  console.log("Running L (claim_token null)");
  await testFail({ claim_token: null }, "claim_token ===");

  console.log("Running M (claimed_at null)");
  await testFail({ claimed_at: null }, "claimed_at ===");

  console.log("Running N (Another processing global)");
  let nSt = [getMockValidState(), { ...getMockValidState(), id: 'other' }];
  await testFail({}, "global = 2", { recovered_count: 1 }, () => nSt);

  console.log("Running O (Second read changes token)");
  let oSt = [getMockValidState()];
  await testFail({}, "claim_token mutated", { recovered_count: 1 }, (reads, baseSt) => {
    let copy = JSON.parse(JSON.stringify(baseSt));
    if (reads > 1) copy[0].claim_token = 'different';
    return copy;
  });

  console.log("Running P (Second read changes claimed_at)");
  await testFail({}, "claimed_at mutated", { recovered_count: 1 }, (reads, baseSt) => {
    let copy = JSON.parse(JSON.stringify(baseSt));
    if (reads > 1) copy[0].claimed_at = 'different';
    return copy;
  });

  console.log("Running Q (RPC recovered_count 0 -> manual review)");
  await testFail(null, "recovery_failed", { recovered_count: 0 });

  console.log("Running R (RPC recovered_count >1 -> manual review)");
  await testFail(null, "impossible_state", { recovered_count: 2 });

  console.log("Running S (RPC string '1' -> rejected)");
  await testFail(null, "RPC returned non-number", { recovered_count: "1" });

  console.log("Running T, U, V (Success, postcheck, max calls)");
  rpcCalls = 0;
  let tReads = 0;
  let tSt = [getMockValidState()];
  let sbSuccess = createMockSupabase(() => {
    tReads++;
    let copy = JSON.parse(JSON.stringify(tSt));
    if (tReads === 3) {
      // 3rd read is POSTCHECK
      copy[0].status = 'pending';
      copy[0].claim_token = null;
      copy[0].claimed_at = null;
    }
    return copy;
  }, () => ({ recovered_count: 1 }));
  
  const _log = console.log; console.log = () => {};
  await runControlledRecoveryWorkflow(sbSuccess);
  console.log = _log;
  assert.strictEqual(rpcCalls, 1, "RPC called exactly once");

  console.log("Running W (Postcheck incorrect)");
  rpcCalls = 0;
  tReads = 0;
  tSt = [getMockValidState()];
  let sbFailPost = createMockSupabase(() => {
    tReads++;
    let copy = JSON.parse(JSON.stringify(tSt));
    if (tReads === 3) {
      // Postcheck: didn't actually mutate correctly
      copy[0].status = 'pending';
      copy[0].claim_token = 'stuck';
    }
    return copy;
  }, () => ({ recovered_count: 1 }));
  
  console.log = () => {};
  try {
    await runControlledRecoveryWorkflow(sbFailPost);
    assert.fail("Expected POSTCHECK FAILED");
  } catch(e) {
    if (!e.message.includes('POSTCHECK FAILED')) throw e;
  }
  console.log = _log;
  assert.strictEqual(rpcCalls, 1);

  console.log("\nAll Local Recovery Validation Tests Passed.");
}

