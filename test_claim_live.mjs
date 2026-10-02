import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import assert from 'assert';

function loadEnv() {
  try {
    if (fs.existsSync('.env.local')) {
      const envConfig = fs.readFileSync('.env.local', 'utf8');
      envConfig.split('\n').forEach(line => {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
          const key = match[1];
          let value = match[2] || '';
          if (value.startsWith('"') && value.endsWith('"')) {
            value = value.slice(1, -1);
          } else if (value.startsWith("'") && value.endsWith("'")) {
            value = value.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      });
    }
  } catch (e) {}
}
loadEnv();

const IS_LIVE = process.env.LIVE_CLAIM_TEST === '1';

const ARTIFICIAL_IDS = {
  bookingA: '11111111-1111-4111-a111-111111111111',
  bookingB: '22222222-2222-4222-a222-222222222222',
  bookingC: '33333333-3333-4333-a333-333333333333',
  groupA: [
    'a1111111-aaaa-4aaa-aaaa-aaaaaaaaaaa1',
    'a1111111-aaaa-4aaa-aaaa-aaaaaaaaaaa2',
    'a1111111-aaaa-4aaa-aaaa-aaaaaaaaaaa3'
  ],
  groupB: [
    'b2222222-bbbb-4bbb-bbbb-bbbbbbbbbbb1',
    'b2222222-bbbb-4bbb-bbbb-bbbbbbbbbbb2',
    'b2222222-bbbb-4bbb-bbbb-bbbbbbbbbbb3'
  ],
  groupC: [
    'c3333333-cccc-4ccc-cccc-ccccccccccc1',
    'c3333333-cccc-4ccc-cccc-ccccccccccc2'
  ],
  fakeMissingId: 'ffffffff-ffff-4fff-ffff-ffffffffffff'
};

const allArtificialBookingIds = [ARTIFICIAL_IDS.bookingA, ARTIFICIAL_IDS.bookingB, ARTIFICIAL_IDS.bookingC];
const allArtificialIds = [...ARTIFICIAL_IDS.groupA, ...ARTIFICIAL_IDS.groupB, ...ARTIFICIAL_IDS.groupC];

const expectedBookingById = {};
const expectedAlarmTypeById = {};

const taskOrder = ['fridge', 'hot_water', 'outdoor_light'];
ARTIFICIAL_IDS.groupA.forEach((id, i) => { expectedBookingById[id] = ARTIFICIAL_IDS.bookingA; expectedAlarmTypeById[id] = taskOrder[i]; });
ARTIFICIAL_IDS.groupB.forEach((id, i) => { expectedBookingById[id] = ARTIFICIAL_IDS.bookingB; expectedAlarmTypeById[id] = taskOrder[i]; });
ARTIFICIAL_IDS.groupC.forEach((id, i) => { expectedBookingById[id] = ARTIFICIAL_IDS.bookingC; expectedAlarmTypeById[id] = taskOrder[i]; });

const TEST_SCHEDULED_FOR = '2099-01-01T10:00:00Z';

async function runTest() {
  console.log("==================================================");
  console.log(" LIVE DATABASE TEST - ALARM CLAIM CONCURRENCY");
  console.log(" DO NOT RUN AUTOMATICALLY - MANUAL EXECUTION ONLY");
  console.log("==================================================");

  if (!IS_LIVE) {
    console.log("[DRY-RUN] LIVE_CLAIM_TEST is not 1. Executing plan without touching DB.");
    console.log("Plan:");
    console.log(" 1. Snapshoting baseline & checking collisions...");
    console.log(" 2. Inserting Group A (3 rows), B (3 rows), C (2 rows)...");
    console.log(" 3. Testing Normal Claim on Group A...");
    console.log(" 4. Testing Negative Atomicity on Group C...");
    console.log(" 5. Testing True Concurrency on Group B...");
    console.log(" 6. Cleaning up exactly the artificial UUIDs...");
    console.log(" 7. Verifying baseline remains identical.");
    console.log("\n[DRY-RUN] Completed. To run live, use: LIVE_CLAIM_TEST=1 node test_claim_live.mjs");
    return;
  }

  if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[LIVE] Missing Supabase credentials. Ensure .env.local has VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  let baselineSnapshot = [];
  let artificialRowsInserted = false;
  let testError = null;
  let cleanupError = null;

  try {
    const { data: initialData, error: initialError } = await supabase.from('alarm_log').select('*').order('id');
    if (initialError) throw new Error(`Failed to fetch baseline: ${initialError.message}`);
    baselineSnapshot = initialData;
    console.log(`[LIVE] Baseline captured: ${baselineSnapshot.length} rows.`);

    const idCollision = baselineSnapshot.some(r => allArtificialIds.includes(r.id));
    const bookingCollision = baselineSnapshot.some(r => allArtificialBookingIds.includes(r.booking_id));
    if (idCollision || bookingCollision) {
      throw new Error("CRITICAL: Artificial IDs collision detected in baseline. Aborting BEFORE insert.");
    }

    const artificialRows = [];
    for (const id of allArtificialIds) {
      artificialRows.push({
        id,
        booking_id: expectedBookingById[id],
        house_id: 'valles',
        alarm_type: expectedAlarmTypeById[id],
        scheduled_for: TEST_SCHEDULED_FOR,
        status: 'pending'
      });
    }

    const { error: insertError } = await supabase.from('alarm_log').insert(artificialRows);
    if (insertError) throw new Error(`Failed to insert artificial rows: ${insertError.message}`);
    artificialRowsInserted = true;
    console.log(`[LIVE] Inserted ${artificialRows.length} artificial rows successfully.`);

    const { count: countAfterInsert, error: countError } = await supabase.from('alarm_log').select('*', { count: 'exact', head: true });
    if (countError) throw new Error(`Failed to verify count after insert: ${countError.message}`);
    assert.strictEqual(countAfterInsert, baselineSnapshot.length + artificialRows.length, "Baseline + inserted rows mismatch.");

    // GROUP A - NORMAL CLAIM
    const tokenA = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
    const { data: resA, error: errA } = await supabase.rpc('claim_alarm_group', { p_ids: ARTIFICIAL_IDS.groupA, p_claim_token: tokenA });
    if (errA) throw new Error(`Group A RPC failed: ${errA.message}`);
    assert.strictEqual(resA[0].claimed_count, 3, "Group A claimed count should be 3");

    const { data: fetchA, error: fetchErrA } = await supabase.from('alarm_log').select('*').in('id', ARTIFICIAL_IDS.groupA);
    if (fetchErrA) throw new Error(`Group A fetch failed: ${fetchErrA.message}`);
    assert.strictEqual(fetchA.length, 3);
    for (const row of fetchA) {
      assert.strictEqual(row.booking_id, ARTIFICIAL_IDS.bookingA);
      assert.strictEqual(row.house_id, 'valles');
      assert.strictEqual(new Date(row.scheduled_for).toISOString(), new Date(TEST_SCHEDULED_FOR).toISOString());
      assert.strictEqual(row.alarm_type, expectedAlarmTypeById[row.id]);
      assert.strictEqual(row.status, 'processing');
      assert.strictEqual(row.claim_token, tokenA);
      assert.ok(row.claimed_at);
      assert.strictEqual(row.retry_count, 0);
      assert.strictEqual(row.last_attempt_at, null);
      assert.strictEqual(row.sent_at, null);
      assert.strictEqual(row.error_message, null);
    }
    console.log(`[LIVE] Group A Normal Claim passed.`);

    // GROUP C - NEGATIVE ATOMICITY
    const tokenC = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';
    const idsC = [...ARTIFICIAL_IDS.groupC, ARTIFICIAL_IDS.fakeMissingId];
    const { error: errC } = await supabase.rpc('claim_alarm_group', { p_ids: idsC, p_claim_token: tokenC });
    assert.ok(errC && errC.message.includes('partial_availability'), "Group C must fail with partial_availability");

    const { data: fetchC, error: fetchErrC } = await supabase.from('alarm_log').select('*').in('id', ARTIFICIAL_IDS.groupC);
    if (fetchErrC) throw new Error(`Group C fetch failed: ${fetchErrC.message}`);
    assert.strictEqual(fetchC.length, 2);
    for (const row of fetchC) {
      assert.strictEqual(row.booking_id, ARTIFICIAL_IDS.bookingC);
      assert.strictEqual(row.house_id, 'valles');
      assert.strictEqual(new Date(row.scheduled_for).toISOString(), new Date(TEST_SCHEDULED_FOR).toISOString());
      assert.strictEqual(row.alarm_type, expectedAlarmTypeById[row.id]);
      assert.strictEqual(row.status, 'pending');
      assert.strictEqual(row.claim_token, null);
      assert.strictEqual(row.claimed_at, null);
      assert.strictEqual(row.retry_count, 0);
      assert.strictEqual(row.last_attempt_at, null);
      assert.strictEqual(row.sent_at, null);
      assert.strictEqual(row.error_message, null);
    }
    console.log(`[LIVE] Group C Negative Atomicity passed.`);

    // GROUP B - TRUE CONCURRENCY
    const tokenB1 = 'b1111111-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
    const tokenB2 = 'b2222222-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
    
    const p1 = supabase.rpc('claim_alarm_group', { p_ids: ARTIFICIAL_IDS.groupB, p_claim_token: tokenB1 }).then(res => ({ res, token: tokenB1 }));
    const p2 = supabase.rpc('claim_alarm_group', { p_ids: ARTIFICIAL_IDS.groupB, p_claim_token: tokenB2 }).then(res => ({ res, token: tokenB2 }));
    
    const results = await Promise.allSettled([p1, p2]);
    
    const successes = results.filter(r => r.status === 'fulfilled' && !r.value.res.error);
    const failures = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.res.error));

    assert.strictEqual(successes.length, 1, "Exactly ONE request must succeed");
    assert.strictEqual(failures.length, 1, "Exactly ONE request must fail");
    
    const failureMsg = failures[0].status === 'rejected' ? failures[0].reason?.message : failures[0].value.res.error?.message;
    assert.ok(failureMsg && failureMsg.includes('invalid_status_in_group'), "Failure must be invalid_status_in_group");
    
    const winningRequestToken = successes[0].value.token;
    assert.strictEqual(successes[0].value.res.data[0].claimed_count, 3, "Success must claim 3 rows");

    const { data: fetchB, error: fetchErrB } = await supabase.from('alarm_log').select('*').in('id', ARTIFICIAL_IDS.groupB);
    if (fetchErrB) throw new Error(`Group B fetch failed: ${fetchErrB.message}`);
    assert.strictEqual(fetchB.length, 3);
    
    for (const row of fetchB) {
      assert.strictEqual(row.booking_id, ARTIFICIAL_IDS.bookingB);
      assert.strictEqual(row.house_id, 'valles');
      assert.strictEqual(new Date(row.scheduled_for).toISOString(), new Date(TEST_SCHEDULED_FOR).toISOString());
      assert.strictEqual(row.alarm_type, expectedAlarmTypeById[row.id]);
      assert.strictEqual(row.status, 'processing');
      assert.strictEqual(row.claim_token, winningRequestToken, "All rows must have the exact token of the winning request");
      assert.ok(row.claimed_at);
      assert.strictEqual(row.retry_count, 0);
      assert.strictEqual(row.last_attempt_at, null);
      assert.strictEqual(row.sent_at, null);
      assert.strictEqual(row.error_message, null);
    }
    console.log(`[LIVE] Group B Concurrency passed. Winner was: ${winningRequestToken}`);
    console.log(`[LIVE] LIVE CLAIM TEST PASSED.`);

  } catch (error) {
    testError = error;
    console.error("[LIVE] Test error:", error);
  } finally {
    if (IS_LIVE && artificialRowsInserted) {
      try {
        console.log(`[LIVE] Cleaning up artificial data...`);
        
        const { data: verifyToDelete, error: verifyError } = await supabase.from('alarm_log').select('id, booking_id').in('id', allArtificialIds);
        if (verifyError) throw new Error(`Cleanup fetch failed: ${verifyError.message}`);
        
        const idsToDelete = [];
        for (const row of verifyToDelete) {
          if (expectedBookingById[row.id] !== row.booking_id) {
            throw new Error(`CRITICAL CLEANUP ERROR: ID ${row.id} mapped to wrong booking_id ${row.booking_id}. Expected ${expectedBookingById[row.id]}`);
          }
          idsToDelete.push(row.id);
        }

        if (idsToDelete.length > 0) {
          const { error: delError } = await supabase.from('alarm_log').delete().in('id', idsToDelete);
          if (delError) throw new Error(`Delete failed: ${delError.message}`);
        }
        
        const { data: checkEmpty, error: emptyError } = await supabase.from('alarm_log').select('id').in('id', allArtificialIds);
        if (emptyError) throw new Error(`Post-delete check failed: ${emptyError.message}`);
        assert.strictEqual(checkEmpty.length, 0, "Artificial rows were not completely deleted.");

        // Baseline verification
        const { data: finalData, error: finalError } = await supabase.from('alarm_log').select('*').order('id');
        if (finalError) throw new Error(`Final baseline fetch failed: ${finalError.message}`);
        
        assert.strictEqual(finalData.length, baselineSnapshot.length, "Final count mismatch vs baseline.");
        
        for (const original of baselineSnapshot) {
          const current = finalData.find(f => f.id === original.id);
          assert.ok(current, `Baseline ID ${original.id} missing in final data.`);
          assert.strictEqual(current.booking_id, original.booking_id);
          assert.strictEqual(current.house_id, original.house_id);
          assert.strictEqual(current.alarm_type, original.alarm_type);
          assert.strictEqual(new Date(current.scheduled_for).toISOString(), new Date(original.scheduled_for).toISOString());
          assert.strictEqual(current.status, original.status);
          assert.strictEqual(current.retry_count, original.retry_count);
          assert.strictEqual(current.last_attempt_at ? new Date(current.last_attempt_at).toISOString() : null, original.last_attempt_at ? new Date(original.last_attempt_at).toISOString() : null);
          assert.strictEqual(current.sent_at ? new Date(current.sent_at).toISOString() : null, original.sent_at ? new Date(original.sent_at).toISOString() : null);
          assert.strictEqual(current.error_message, original.error_message);
          assert.strictEqual(current.claim_token, original.claim_token);
          assert.strictEqual(current.claimed_at ? new Date(current.claimed_at).toISOString() : null, original.claimed_at ? new Date(original.claimed_at).toISOString() : null);
          assert.strictEqual(new Date(current.created_at).toISOString(), new Date(original.created_at).toISOString());
        }

        console.log(`[LIVE] CLEANUP PASSED.`);
        console.log(`[LIVE] BASELINE PASSED.`);
      } catch (ce) {
        cleanupError = ce;
        console.error("[LIVE] Cleanup error:", ce);
      }
    } else if (IS_LIVE && !artificialRowsInserted) {
       console.log("[LIVE] artificialRowsInserted is false, skipping cleanup.");
    }
  }

  if (testError || cleanupError) {
    process.exitCode = 1;
  }
}

runTest();
