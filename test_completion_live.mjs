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

const SYNTHETIC_GROUPS = {
  SUCCESS: {
    booking_id: 'bbbbbbbb-0000-4bbb-000a-000000000000',
    token: 'a0000000-0000-4000-a000-000000000001',
    rows: [
      { id: '11111111-1111-4111-a111-111111111111', alarm_type: 'heating' },
      { id: '11111111-1111-4111-a111-111111111112', alarm_type: 'fridge' }
    ]
  },
  FAILURE: {
    booking_id: 'bbbbbbbb-0000-4bbb-000b-000000000000',
    token: 'a0000000-0000-4000-a000-000000000002',
    rows: [
      { id: '22222222-2222-4222-a222-222222222221', alarm_type: 'heating' },
      { id: '22222222-2222-4222-a222-222222222222', alarm_type: 'fridge' }
    ]
  },
  OWNERSHIP: {
    booking_id: 'bbbbbbbb-0000-4bbb-000c-000000000000',
    token: 'a0000000-0000-4000-a000-000000000003',
    wrong_token: 'a0000000-0000-4000-a000-000000000004',
    rows: [
      { id: '33333333-3333-4333-a333-333333333331', alarm_type: 'heating' },
      { id: '33333333-3333-4333-a333-333333333332', alarm_type: 'fridge' }
    ]
  },
  CONCURRENCY: {
    booking_id: 'bbbbbbbb-0000-4bbb-000e-000000000000',
    token: 'a0000000-0000-4000-a000-000000000005',
    rows: [
      { id: '55555555-5555-4555-a555-555555555551', alarm_type: 'heating' },
      { id: '55555555-5555-4555-a555-555555555552', alarm_type: 'fridge' }
    ]
  },
  ATOMICITY: {
    booking_id: 'bbbbbbbb-0000-4bbb-000f-000000000000',
    token: 'a0000000-0000-4000-a000-000000000006',
    rows: [
      { id: '66666666-6666-4666-a666-666666666661', alarm_type: 'heating' },
      { id: '66666666-6666-4666-a666-666666666662', alarm_type: 'fridge' },
      { id: '66666666-6666-4666-a666-666666666663', alarm_type: 'hot_water' }
    ]
  }
};

const ALL_SYNTHETIC_ROWS = [];
for (const group of Object.values(SYNTHETIC_GROUPS)) {
  for (const row of group.rows) {
    ALL_SYNTHETIC_ROWS.push({
      id: row.id,
      booking_id: group.booking_id,
      house_id: 'gredos',
      alarm_type: row.alarm_type,
      scheduled_for: '2099-01-01T12:00:00Z',
      status: 'pending',
      retry_count: 0
    });
  }
}
const ALL_SYNTHETIC_IDS = ALL_SYNTHETIC_ROWS.map(r => r.id);

let baselineSnapshot = [];
let artificialRowsInserted = false;

function verifyState(rows, expectedStatus, expectedToken = null) {
  for (const r of rows) {
    assert.strictEqual(r.status, expectedStatus, `Row ${r.id} status mismatch`);
    if (expectedToken !== undefined) {
      assert.strictEqual(r.claim_token, expectedToken, `Row ${r.id} claim_token mismatch`);
    }
  }
}

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
    const failed = baselineSnapshot.filter(r => r.status === 'failed').length;
    const sent = baselineSnapshot.filter(r => r.status === 'sent').length;
    const obsolete = baselineSnapshot.filter(r => r.status === 'obsolete').length;
    const tokens = baselineSnapshot.filter(r => r.claim_token !== null).length;
    const claimedAt = baselineSnapshot.filter(r => r.claimed_at !== null).length;
    
    console.log(`[LIVE] Baseline stats: total=${total}, pending=${pending}, processing=${processing}, failed=${failed}, sent=${sent}, obsolete=${obsolete}, tokens=${tokens}`);

    // EXACT BASELINE CHECK
    if (total !== 36 || pending !== 36 || processing !== 0 || failed !== 0 || sent !== 0 || obsolete !== 0 || tokens !== 0 || claimedAt !== 0) {
      throw new Error(`CRITICAL: Baseline is not exactly 36 pending rows. Found total=${total}, processing=${processing}, etc.`);
    }

    const existingSynthetic = baselineSnapshot.filter(r => ALL_SYNTHETIC_IDS.includes(r.id));
    if (existingSynthetic.length > 0) {
      throw new Error(`CRITICAL: Found ${existingSynthetic.length} synthetic IDs already in DB! Aborting.`);
    }

    console.log("\n[LIVE] Inserting synthetic rows...");
    const { data: insertData, error: insertErr } = await supabase.from('alarm_log').insert(ALL_SYNTHETIC_ROWS).select();
    if (insertErr) {
      throw new Error(`Insert failed: ${insertErr.message} (Code: ${insertErr.code})`);
    }
    if (!insertData || insertData.length !== ALL_SYNTHETIC_ROWS.length) {
      throw new Error(`Insert mismatch: expected ${ALL_SYNTHETIC_ROWS.length} rows, got ${insertData ? insertData.length : 0}`);
    }
    artificialRowsInserted = true;
    console.log(`[LIVE] Inserted ${insertData.length} synthetic rows safely.`);

    // =========================================================================
    // TEST A: GROUP SUCCESS
    // =========================================================================
    console.log("\n[LIVE] Test A: Group Success...");
    const grpSuccIds = SYNTHETIC_GROUPS.SUCCESS.rows.map(r => r.id);
    const { error: claimA_err } = await supabase.rpc('claim_alarm_group', { p_ids: grpSuccIds, p_claim_token: SYNTHETIC_GROUPS.SUCCESS.token });
    assert.strictEqual(claimA_err, null, "Claim A failed");
    
    const { data: succClaimed } = await supabase.from('alarm_log').select('*').in('id', grpSuccIds);
    verifyState(succClaimed, 'processing', SYNTHETIC_GROUPS.SUCCESS.token);
    
    const { data: succRes, error: succErr } = await supabase.rpc('complete_alarm_group_success', {
      p_ids: grpSuccIds,
      p_claim_token: SYNTHETIC_GROUPS.SUCCESS.token
    });
    assert.strictEqual(succErr, null, "Completion A failed");
    assert.strictEqual(succRes && succRes[0] && succRes[0].updated_count, grpSuccIds.length, "updated_count mismatch for Success");
    
    const { data: succFinal } = await supabase.from('alarm_log').select('*').in('id', grpSuccIds);
    verifyState(succFinal, 'sent', null);
    for (const r of succFinal) {
      assert.ok(r.sent_at, "sent_at must not be null");
      assert.ok(r.last_attempt_at, "last_attempt_at must not be null");
      assert.strictEqual(r.retry_count, 1);
      assert.strictEqual(r.error_message, null);
      assert.strictEqual(r.claimed_at, null);
    }
    console.log("[LIVE] Test A Passed.");

    // =========================================================================
    // TEST B: GROUP FAILURE
    // =========================================================================
    console.log("\n[LIVE] Test B: Group Failure...");
    const grpFailIds = SYNTHETIC_GROUPS.FAILURE.rows.map(r => r.id);
    const { error: claimB_err } = await supabase.rpc('claim_alarm_group', { p_ids: grpFailIds, p_claim_token: SYNTHETIC_GROUPS.FAILURE.token });
    assert.strictEqual(claimB_err, null);
    
    const { data: failRes, error: failErr } = await supabase.rpc('complete_alarm_group_failure', {
      p_ids: grpFailIds,
      p_claim_token: SYNTHETIC_GROUPS.FAILURE.token,
      p_error_message: 'synthetic completion failure'
    });
    assert.strictEqual(failErr, null);
    assert.strictEqual(failRes && failRes[0] && failRes[0].updated_count, grpFailIds.length);

    const { data: failFinal } = await supabase.from('alarm_log').select('*').in('id', grpFailIds);
    verifyState(failFinal, 'failed', null);
    for (const r of failFinal) {
      assert.strictEqual(r.sent_at, null);
      assert.ok(r.last_attempt_at);
      assert.strictEqual(r.retry_count, 1);
      assert.strictEqual(r.error_message, 'synthetic completion failure');
      assert.strictEqual(r.claimed_at, null);
    }
    console.log("[LIVE] Test B Passed.");

    // =========================================================================
    // TEST C: OWNERSHIP
    // =========================================================================
    console.log("\n[LIVE] Test C: Ownership...");
    const grpOwnIds = SYNTHETIC_GROUPS.OWNERSHIP.rows.map(r => r.id);
    const { error: claimC_err } = await supabase.rpc('claim_alarm_group', { p_ids: grpOwnIds, p_claim_token: SYNTHETIC_GROUPS.OWNERSHIP.token });
    assert.strictEqual(claimC_err, null);
    
    const { data: ownSnap } = await supabase.from('alarm_log').select('*').in('id', grpOwnIds).order('id');
    
    const { error: ownErr } = await supabase.rpc('complete_alarm_group_success', {
      p_ids: grpOwnIds,
      p_claim_token: SYNTHETIC_GROUPS.OWNERSHIP.wrong_token
    });
    assert.ok(ownErr && ownErr.message.includes('invalid_status_or_token'), "Expected invalid_status_or_token error");
    
    const { data: ownPostSnap } = await supabase.from('alarm_log').select('*').in('id', grpOwnIds).order('id');
    assert.deepStrictEqual(ownPostSnap, ownSnap, "Snapshot must remain strictly identical");

    const { error: ownFix_err } = await supabase.rpc('complete_alarm_group_success', { p_ids: grpOwnIds, p_claim_token: SYNTHETIC_GROUPS.OWNERSHIP.token });
    assert.strictEqual(ownFix_err, null);
    console.log("[LIVE] Test C Passed.");

    // =========================================================================
    // TEST D: DOUBLE FINALIZATION
    // =========================================================================
    console.log("\n[LIVE] Test D: Double Finalization...");
    // GROUP_SUCCESS_IDS is already sent
    const { error: doubleErr } = await supabase.rpc('complete_alarm_group_success', {
      p_ids: grpSuccIds,
      p_claim_token: SYNTHETIC_GROUPS.SUCCESS.token
    });
    assert.ok(doubleErr && doubleErr.message.includes('invalid_status_or_token'), "Double finalization must be rejected");
    
    // Check that state wasn't mutated (retry count still 1)
    const { data: doubleFinal } = await supabase.from('alarm_log').select('retry_count').in('id', grpSuccIds);
    assert.ok(doubleFinal.every(r => r.retry_count === 1));
    console.log("[LIVE] Test D Passed.");

    // =========================================================================
    // TEST E: CONCURRENCY REAL
    // =========================================================================
    console.log("\n[LIVE] Test E: Concurrency Real...");
    const grpConcIds = SYNTHETIC_GROUPS.CONCURRENCY.rows.map(r => r.id);
    const { error: claimE_err } = await supabase.rpc('claim_alarm_group', { p_ids: grpConcIds, p_claim_token: SYNTHETIC_GROUPS.CONCURRENCY.token });
    assert.strictEqual(claimE_err, null);
    
    const results = await Promise.allSettled([
      supabase.rpc('complete_alarm_group_success', { p_ids: grpConcIds, p_claim_token: SYNTHETIC_GROUPS.CONCURRENCY.token }),
      supabase.rpc('complete_alarm_group_failure', { p_ids: grpConcIds, p_claim_token: SYNTHETIC_GROUPS.CONCURRENCY.token, p_error_message: 'concurrent fail' })
    ]);

    const successes = results.filter(r => r.status === 'fulfilled' && !r.value.error);
    const failures = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.error));
    
    assert.strictEqual(successes.length, 1, "Exactly one RPC must win");
    assert.strictEqual(failures.length, 1, "Exactly one RPC must fail");
    
    const { data: concFinal } = await supabase.from('alarm_log').select('*').in('id', grpConcIds);
    const allSent = concFinal.every(r => r.status === 'sent');
    const allFailed = concFinal.every(r => r.status === 'failed');
    assert.ok(allSent || allFailed, "Group must be uniformly sent or uniformly failed");
    for (const r of concFinal) {
       assert.strictEqual(r.claim_token, null);
       assert.strictEqual(r.retry_count, 1, "Retry count must not double increment");
    }
    console.log(`[LIVE] Test E Passed (Winner: ${allSent ? 'Success' : 'Failure'}).`);

    // =========================================================================
    // TEST F: ATOMICITY / PARCIAL COMPLETION
    // =========================================================================
    console.log("\n[LIVE] Test F: Atomicity / Partial Completion...");
    const grpAtomIds = SYNTHETIC_GROUPS.ATOMICITY.rows.map(r => r.id);
    const { error: claimF_err } = await supabase.rpc('claim_alarm_group', { p_ids: grpAtomIds, p_claim_token: SYNTHETIC_GROUPS.ATOMICITY.token });
    assert.strictEqual(claimF_err, null);
    
    const { data: atomSnap } = await supabase.from('alarm_log').select('*').in('id', grpAtomIds).order('id');
    
    const subsetIds = [grpAtomIds[0], grpAtomIds[1]]; // missing 3rd row
    const { error: atomErr } = await supabase.rpc('complete_alarm_group_success', {
      p_ids: subsetIds,
      p_claim_token: SYNTHETIC_GROUPS.ATOMICITY.token
    });
    
    assert.ok(atomErr && atomErr.message.includes('incomplete_claim_group'), 'Expected incomplete_claim_group error for subset completion');
    
    const { data: atomPostSnap } = await supabase.from('alarm_log').select('*').in('id', grpAtomIds).order('id');
    assert.deepStrictEqual(atomPostSnap, atomSnap, 'Snapshot must be identical after rejected subset completion');
    
    // Resolve correctly
    const { data: atomRes, error: atomResErr } = await supabase.rpc('complete_alarm_group_success', {
      p_ids: grpAtomIds,
      p_claim_token: SYNTHETIC_GROUPS.ATOMICITY.token
    });
    assert.strictEqual(atomResErr, null);
    assert.strictEqual(atomRes && atomRes[0] && atomRes[0].updated_count, 3);
    
    const { data: atomFinalSnap } = await supabase.from('alarm_log').select('*').in('id', grpAtomIds);
    verifyState(atomFinalSnap, 'sent', null);
    console.log("[LIVE] Test F Passed.");

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
          process.exitCode = 1;
        } else {
          // Verify
          const { data: leftovers } = await supabase.from('alarm_log').select('id').in('id', ALL_SYNTHETIC_IDS);
          if (leftovers && leftovers.length > 0) {
            console.error(`CRITICAL: ${leftovers.length} synthetic rows still remain!`);
            process.exitCode = 1;
          } else {
            console.log("[LIVE] Synthetic rows deleted successfully.");
          }
        }
      } catch (cleanErr) {
        console.error("CRITICAL: Cleanup threw an exception!", cleanErr);
        process.exitCode = 1;
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

      const total = finalSnap.length;
      const pending = finalSnap.filter(r => r.status === 'pending').length;
      const processing = finalSnap.filter(r => r.status === 'processing').length;
      const failed = finalSnap.filter(r => r.status === 'failed').length;
      const sent = finalSnap.filter(r => r.status === 'sent').length;
      const obsolete = finalSnap.filter(r => r.status === 'obsolete').length;
      const tokens = finalSnap.filter(r => r.claim_token !== null).length;
      const claimedAt = finalSnap.filter(r => r.claimed_at !== null).length;

      if (total !== 36 || pending !== 36 || processing !== 0 || failed !== 0 || sent !== 0 || obsolete !== 0 || tokens !== 0 || claimedAt !== 0) {
        console.error(`CRITICAL BASELINE MISMATCH: total=${total}, pending=${pending}, processing=${processing}, failed=${failed}, sent=${sent}, obsolete=${obsolete}, tokens=${tokens}`);
        process.exitCode = 1;
      }

      let deepMismatches = 0;
      if (finalSnap.length !== baselineSnapshot.length) {
        console.error(`CRITICAL: Expected ${baselineSnapshot.length} rows, found ${finalSnap.length}`);
        deepMismatches++;
        process.exitCode = 1;
      } else {
        for (let i = 0; i < baselineSnapshot.length; i++) {
          if (JSON.stringify(baselineSnapshot[i]) !== JSON.stringify(finalSnap[i])) {
            console.error(`CRITICAL: Row mismatch at index ${i}`);
            deepMismatches++;
            process.exitCode = 1;
          }
        }
      }
      
      if (deepMismatches === 0) {
        console.log("[LIVE] BASELINE PASSED. Database state exactly matches original.");
      }
    } catch (baseErr) {
      console.error("CRITICAL: Failed to verify baseline!", baseErr);
      process.exitCode = 1;
    }
  }
}

runLiveTest();
