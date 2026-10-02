import { createClient } from '@supabase/supabase-js';
import assert from 'assert';

console.log("==================================================");
console.log(" LIVE DATABASE TEST - ALARM COMPLETION (PREPARED)");
console.log(" DO NOT RUN AUTOMATICALLY - MANUAL EXECUTION ONLY");
console.log("==================================================");

if (process.env.LIVE_COMPLETION_TEST !== 'YES_I_UNDERSTAND') {
  console.log("\nDRY RUN / LIVE TEST DISABLED.");
  console.log("To execute, you must set LIVE_COMPLETION_TEST=YES_I_UNDERSTAND along with Supabase environment variables.");
  console.log("Exiting safely without connecting to database.");
  process.exit(0);
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const GROUP_SUCCESS_IDS = [
  '11111111-1111-4111-a111-111111111111',
  '11111111-1111-4111-a111-111111111112'
];
const GROUP_FAILURE_IDS = [
  '22222222-2222-4222-a222-222222222221',
  '22222222-2222-4222-a222-222222222222'
];
const GROUP_OWNERSHIP_IDS = [
  '33333333-3333-4333-a333-333333333331',
  '33333333-3333-4333-a333-333333333332'
];
const GROUP_CONCURRENCY_IDS = [
  '55555555-5555-4555-a555-555555555551',
  '55555555-5555-4555-a555-555555555552'
];

const ALL_SYNTHETIC_IDS = [
  ...GROUP_SUCCESS_IDS,
  ...GROUP_FAILURE_IDS,
  ...GROUP_OWNERSHIP_IDS,
  ...GROUP_CONCURRENCY_IDS
];

const SYNTHETIC_BOOKING_ID = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const TOKEN_SUCCESS = 'a0000000-0000-4000-a000-000000000001';
const TOKEN_FAILURE = 'a0000000-0000-4000-a000-000000000002';
const TOKEN_OWNER = 'a0000000-0000-4000-a000-000000000003';
const TOKEN_WRONG = 'a0000000-0000-4000-a000-000000000004';
const TOKEN_CONCURRENCY = 'a0000000-0000-4000-a000-000000000005';

let baselineSnapshot = [];
let artificialRowsInserted = false;

async function runLiveTest() {
  try {
    console.log("\n[LIVE] Capturing Baseline...");
    const { data: baseline, error: bErr } = await supabase
      .from('alarm_log')
      .select('*')
      .order('id', { ascending: true });
    
    if (bErr) throw bErr;
    baselineSnapshot = baseline;

    const total = baselineSnapshot.length;
    const pending = baselineSnapshot.filter(r => r.status === 'pending').length;
    const processing = baselineSnapshot.filter(r => r.status === 'processing').length;
    const tokens = baselineSnapshot.filter(r => r.claim_token !== null).length;
    
    console.log(`[LIVE] Baseline stats: total=${total}, pending=${pending}, processing=${processing}, tokens=${tokens}`);

    const existingSynthetic = baselineSnapshot.filter(r => ALL_SYNTHETIC_IDS.includes(r.id));
    if (existingSynthetic.length > 0) {
      throw new Error(`CRITICAL: Found ${existingSynthetic.length} synthetic IDs already in DB! Aborting.`);
    }

    // 1. Insert synthetic rows
    const rowsToInsert = ALL_SYNTHETIC_IDS.map(id => ({
      id,
      booking_id: SYNTHETIC_BOOKING_ID,
      house_id: 'gredos',
      alarm_type: 'checkout',
      scheduled_for: '2099-01-01T12:00:00Z',
      status: 'pending',
      retry_count: 0
    }));

    console.log("\n[LIVE] Inserting synthetic rows...");
    const { error: insertErr } = await supabase.from('alarm_log').insert(rowsToInsert);
    if (insertErr) throw insertErr;
    artificialRowsInserted = true;
    console.log(`[LIVE] Inserted ${rowsToInsert.length} synthetic rows.`);

    // =========================================================================
    // TEST A: GROUP SUCCESS
    // =========================================================================
    console.log("\n[LIVE] Test A: Group Success...");
    await supabase.rpc('claim_alarm_group', { p_ids: GROUP_SUCCESS_IDS, p_claim_token: TOKEN_SUCCESS });
    const { data: succClaimed } = await supabase.from('alarm_log').select('*').in('id', GROUP_SUCCESS_IDS);
    assert.strictEqual(succClaimed.filter(r => r.status === 'processing').length, 2);
    
    const { data: succRes, error: succErr } = await supabase.rpc('complete_alarm_group_success', {
      p_ids: GROUP_SUCCESS_IDS,
      p_claim_token: TOKEN_SUCCESS
    });
    if (succErr) throw succErr;
    
    const { data: succFinal } = await supabase.from('alarm_log').select('*').in('id', GROUP_SUCCESS_IDS);
    for (const r of succFinal) {
      assert.strictEqual(r.status, 'sent');
      assert.ok(r.sent_at);
      assert.ok(r.last_attempt_at);
      assert.strictEqual(r.retry_count, 1);
      assert.strictEqual(r.error_message, null);
      assert.strictEqual(r.claim_token, null);
      assert.strictEqual(r.claimed_at, null);
    }
    console.log("[LIVE] Test A Passed.");

    // =========================================================================
    // TEST B: GROUP FAILURE
    // =========================================================================
    console.log("\n[LIVE] Test B: Group Failure...");
    await supabase.rpc('claim_alarm_group', { p_ids: GROUP_FAILURE_IDS, p_claim_token: TOKEN_FAILURE });
    const { error: failErr } = await supabase.rpc('complete_alarm_group_failure', {
      p_ids: GROUP_FAILURE_IDS,
      p_claim_token: TOKEN_FAILURE,
      p_error_message: 'synthetic completion failure'
    });
    if (failErr) throw failErr;

    const { data: failFinal } = await supabase.from('alarm_log').select('*').in('id', GROUP_FAILURE_IDS);
    for (const r of failFinal) {
      assert.strictEqual(r.status, 'failed');
      assert.strictEqual(r.sent_at, null);
      assert.ok(r.last_attempt_at);
      assert.strictEqual(r.retry_count, 1);
      assert.strictEqual(r.error_message, 'synthetic completion failure');
      assert.strictEqual(r.claim_token, null);
    }
    console.log("[LIVE] Test B Passed.");

    // =========================================================================
    // TEST C: OWNERSHIP
    // =========================================================================
    console.log("\n[LIVE] Test C: Ownership...");
    await supabase.rpc('claim_alarm_group', { p_ids: GROUP_OWNERSHIP_IDS, p_claim_token: TOKEN_OWNER });
    const { data: ownSnap } = await supabase.from('alarm_log').select('*').in('id', GROUP_OWNERSHIP_IDS);
    
    // Try to complete with WRONG token
    const { error: ownErr } = await supabase.rpc('complete_alarm_group_success', {
      p_ids: GROUP_OWNERSHIP_IDS,
      p_claim_token: TOKEN_WRONG
    });
    assert.ok(ownErr && ownErr.message.includes('invalid_status_or_token'));
    
    // Check snapshot
    const { data: ownPostSnap } = await supabase.from('alarm_log').select('*').in('id', GROUP_OWNERSHIP_IDS);
    assert.deepStrictEqual(ownPostSnap, ownSnap);

    // Complete successfully with correct token
    await supabase.rpc('complete_alarm_group_success', { p_ids: GROUP_OWNERSHIP_IDS, p_claim_token: TOKEN_OWNER });
    console.log("[LIVE] Test C Passed.");

    // =========================================================================
    // TEST D: DOUBLE FINALIZATION
    // =========================================================================
    console.log("\n[LIVE] Test D: Double Finalization...");
    // GROUP_SUCCESS_IDS is already finished
    const { error: doubleErr } = await supabase.rpc('complete_alarm_group_success', {
      p_ids: GROUP_SUCCESS_IDS,
      p_claim_token: TOKEN_SUCCESS
    });
    assert.ok(doubleErr && doubleErr.message.includes('invalid_status_or_token'));
    console.log("[LIVE] Test D Passed.");

    // =========================================================================
    // TEST E: CONCURRENCY REAL
    // =========================================================================
    console.log("\n[LIVE] Test E: Concurrency Real...");
    await supabase.rpc('claim_alarm_group', { p_ids: GROUP_CONCURRENCY_IDS, p_claim_token: TOKEN_CONCURRENCY });
    
    const results = await Promise.allSettled([
      supabase.rpc('complete_alarm_group_success', { p_ids: GROUP_CONCURRENCY_IDS, p_claim_token: TOKEN_CONCURRENCY }),
      supabase.rpc('complete_alarm_group_failure', { p_ids: GROUP_CONCURRENCY_IDS, p_claim_token: TOKEN_CONCURRENCY, p_error_message: 'concurrent fail' })
    ]);

    const successes = results.filter(r => r.status === 'fulfilled' && !r.value.error);
    const failures = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.error));
    
    assert.strictEqual(successes.length, 1, "Exactly one RPC must win");
    assert.strictEqual(failures.length, 1, "Exactly one RPC must fail");
    
    const { data: concFinal } = await supabase.from('alarm_log').select('*').in('id', GROUP_CONCURRENCY_IDS);
    const allSent = concFinal.every(r => r.status === 'sent');
    const allFailed = concFinal.every(r => r.status === 'failed');
    assert.ok(allSent || allFailed, "Group must be uniformly sent or uniformly failed");
    for (const r of concFinal) {
       assert.strictEqual(r.claim_token, null);
       assert.strictEqual(r.retry_count, 1);
    }
    console.log("[LIVE] Test E Passed (Winner: " + (allSent ? 'Success' : 'Failure') + ").");

    // =========================================================================
    // TEST F: ATOMICITY / PARCIAL (REPORT ONLY)
    // =========================================================================
    console.log("\n[LIVE] Test F: Atomicity / Partial Completion (Analysis)");
    console.log("-> Analysis: The RPC relies on `v_locked_count = array_length(p_ids)`.");
    console.log("-> It does NOT enforce that `p_ids` contains ALL rows originally claimed by `p_claim_token`.");
    console.log("-> Therefore, PostgreSQL ALLOWS partial group completion by design if only a subset is requested.");
    console.log("-> Test skipped as requested (we do not simulate destructive splits).");

    console.log("\n>>> LIVE CLAIM COMPLETION TESTS PASSED <<<");

  } catch (err) {
    console.error("\n[LIVE] Test Error:", err);
    process.exitCode = 1;
  } finally {
    console.log("\n[LIVE] Running cleanup...");
    if (artificialRowsInserted) {
      try {
        const { error: delErr } = await supabase
          .from('alarm_log')
          .delete()
          .in('id', ALL_SYNTHETIC_IDS);
        if (delErr) {
          console.error("CRITICAL: Failed to delete synthetic rows!", delErr);
        } else {
          console.log("[LIVE] Synthetic rows deleted successfully.");
        }
      } catch (cleanErr) {
        console.error("CRITICAL: Cleanup threw an exception!", cleanErr);
      }
    } else {
      console.log("[LIVE] No rows inserted, skipping cleanup.");
    }

    console.log("[LIVE] Verifying baseline...");
    try {
      const { data: finalSnap, error: finalErr } = await supabase
        .from('alarm_log')
        .select('*')
        .order('id', { ascending: true });
      
      if (finalErr) throw finalErr;

      let baselineMismatches = 0;
      if (finalSnap.length !== baselineSnapshot.length) {
        console.error(`BASELINE FAILED: Expected ${baselineSnapshot.length} rows, found ${finalSnap.length}`);
        baselineMismatches++;
      } else {
        for (let i = 0; i < baselineSnapshot.length; i++) {
          if (JSON.stringify(baselineSnapshot[i]) !== JSON.stringify(finalSnap[i])) {
            console.error(`BASELINE FAILED: Row mismatch at index ${i}`, { expected: baselineSnapshot[i], actual: finalSnap[i] });
            baselineMismatches++;
          }
        }
      }
      
      if (baselineMismatches === 0) {
        console.log("[LIVE] BASELINE PASSED. Database state exactly matches original.");
      }
    } catch (baseErr) {
      console.error("CRITICAL: Failed to verify baseline!", baseErr);
    }
  }
}

runLiveTest();
