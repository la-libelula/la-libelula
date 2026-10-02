import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import assert from 'assert';

// Custom env loader to avoid dotenv dependency
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
  } catch (e) {
    // ignore missing .env
  }
}
loadEnv();

const IS_LIVE = process.env.LIVE_CLAIM_TEST === '1';

// Constants for test
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

const TEST_SCHEDULED_FOR = '2099-01-01T10:00:00Z'; // Far future to absolutely avoid collisions

async function runTest() {
  console.log("==================================================");
  console.log(" LIVE DATABASE TEST - ALARM CLAIM CONCURRENCY");
  console.log(" DO NOT RUN AUTOMATICALLY - MANUAL EXECUTION ONLY");
  console.log("==================================================");

  if (!IS_LIVE) {
    console.log("[DRY-RUN] LIVE_CLAIM_TEST is not 1. Executing plan without touching DB.");
    console.log("Plan:");
    console.log(" 1. Snapshoting baseline...");
    console.log(" 2. Inserting Group A (3 rows), B (3 rows), C (2 rows)...");
    console.log(`    Booking A: ${ARTIFICIAL_IDS.bookingA}`);
    console.log(`    Booking B: ${ARTIFICIAL_IDS.bookingB}`);
    console.log(`    Booking C: ${ARTIFICIAL_IDS.bookingC}`);
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

  console.log("[LIVE] Starting live execution.");
  let baselineSnapshot = [];

  try {
    // 1. BASELINE OBLIGATORIO
    const { data: initialData, error: initialError } = await supabase
      .from('alarm_log')
      .select('*')
      .order('id');
    
    if (initialError) throw initialError;
    baselineSnapshot = initialData;
    console.log(`[LIVE] Baseline captured: ${baselineSnapshot.length} rows.`);

    // 2. DATOS ARTIFICIALES
    const artificialRows = [
      // Group A
      { id: ARTIFICIAL_IDS.groupA[0], booking_id: ARTIFICIAL_IDS.bookingA, house_id: 'valles', alarm_type: 'fridge', scheduled_for: TEST_SCHEDULED_FOR, status: 'pending' },
      { id: ARTIFICIAL_IDS.groupA[1], booking_id: ARTIFICIAL_IDS.bookingA, house_id: 'valles', alarm_type: 'hot_water', scheduled_for: TEST_SCHEDULED_FOR, status: 'pending' },
      { id: ARTIFICIAL_IDS.groupA[2], booking_id: ARTIFICIAL_IDS.bookingA, house_id: 'valles', alarm_type: 'outdoor_light', scheduled_for: TEST_SCHEDULED_FOR, status: 'pending' },
      // Group B
      { id: ARTIFICIAL_IDS.groupB[0], booking_id: ARTIFICIAL_IDS.bookingB, house_id: 'valles', alarm_type: 'fridge', scheduled_for: TEST_SCHEDULED_FOR, status: 'pending' },
      { id: ARTIFICIAL_IDS.groupB[1], booking_id: ARTIFICIAL_IDS.bookingB, house_id: 'valles', alarm_type: 'hot_water', scheduled_for: TEST_SCHEDULED_FOR, status: 'pending' },
      { id: ARTIFICIAL_IDS.groupB[2], booking_id: ARTIFICIAL_IDS.bookingB, house_id: 'valles', alarm_type: 'outdoor_light', scheduled_for: TEST_SCHEDULED_FOR, status: 'pending' },
      // Group C
      { id: ARTIFICIAL_IDS.groupC[0], booking_id: ARTIFICIAL_IDS.bookingC, house_id: 'valles', alarm_type: 'fridge', scheduled_for: TEST_SCHEDULED_FOR, status: 'pending' },
      { id: ARTIFICIAL_IDS.groupC[1], booking_id: ARTIFICIAL_IDS.bookingC, house_id: 'valles', alarm_type: 'hot_water', scheduled_for: TEST_SCHEDULED_FOR, status: 'pending' }
    ];

    const { error: insertError } = await supabase.from('alarm_log').insert(artificialRows);
    if (insertError) throw insertError;

    // Verify insertion
    const { count: countAfterInsert } = await supabase.from('alarm_log').select('*', { count: 'exact', head: true });
    assert.strictEqual(countAfterInsert, baselineSnapshot.length + 8, "Baseline + 8 inserted rows mismatch.");
    console.log(`[LIVE] Inserted 8 artificial rows successfully.`);

    // 3. PRUEBA DE CLAIM NORMAL (GRUPO A)
    const tokenA = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
    const { data: resA, error: errA } = await supabase.rpc('claim_alarm_group', { p_ids: ARTIFICIAL_IDS.groupA, p_claim_token: tokenA });
    if (errA) throw errA;
    assert.strictEqual(resA[0].claimed_count, 3, "Group A claimed count should be 3");

    const { data: fetchA } = await supabase.from('alarm_log').select('*').in('id', ARTIFICIAL_IDS.groupA);
    assert.strictEqual(fetchA.length, 3);
    for (const row of fetchA) {
      assert.strictEqual(row.status, 'processing');
      assert.strictEqual(row.claim_token, tokenA);
      assert.ok(row.claimed_at);
      assert.strictEqual(row.retry_count, 0);
      assert.strictEqual(row.last_attempt_at, null);
      assert.strictEqual(row.sent_at, null);
      assert.strictEqual(row.error_message, null);
    }
    console.log(`[LIVE] Group A Normal Claim passed.`);

    // 4. PRUEBA DE ATOMICIDAD NEGATIVA (GRUPO C)
    const tokenC = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';
    const idsC = [...ARTIFICIAL_IDS.groupC, ARTIFICIAL_IDS.fakeMissingId];
    const { error: errC } = await supabase.rpc('claim_alarm_group', { p_ids: idsC, p_claim_token: tokenC });
    assert.ok(errC && errC.message.includes('partial_availability'), "Group C must fail with partial_availability");

    const { data: fetchC } = await supabase.from('alarm_log').select('*').in('id', ARTIFICIAL_IDS.groupC);
    assert.strictEqual(fetchC.length, 2);
    for (const row of fetchC) {
      assert.strictEqual(row.status, 'pending');
      assert.strictEqual(row.claim_token, null);
      assert.strictEqual(row.claimed_at, null);
    }
    console.log(`[LIVE] Group C Negative Atomicity passed.`);

    // 5. PRUEBA DE CONCURRENCIA REAL (GRUPO B)
    const tokenB1 = 'b1111111-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
    const tokenB2 = 'b2222222-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
    
    // Fire simultaneously
    const p1 = supabase.rpc('claim_alarm_group', { p_ids: ARTIFICIAL_IDS.groupB, p_claim_token: tokenB1 });
    const p2 = supabase.rpc('claim_alarm_group', { p_ids: ARTIFICIAL_IDS.groupB, p_claim_token: tokenB2 });
    
    const results = await Promise.allSettled([p1, p2]);
    
    const successes = results.filter(r => r.status === 'fulfilled' && !r.value.error);
    const failures = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.error));

    assert.strictEqual(successes.length, 1, "Exactly ONE request must succeed");
    assert.strictEqual(failures.length, 1, "Exactly ONE request must fail");
    
    const failureMsg = failures[0].status === 'rejected' ? failures[0].reason?.message : failures[0].value.error?.message;
    assert.ok(failureMsg.includes('invalid_status_in_group'), "Failure must be invalid_status_in_group");
    assert.strictEqual(successes[0].value.data[0].claimed_count, 3, "Success must claim 3 rows");

    // Check rows state
    const { data: fetchB } = await supabase.from('alarm_log').select('*').in('id', ARTIFICIAL_IDS.groupB);
    assert.strictEqual(fetchB.length, 3);
    const winningToken = fetchB[0].claim_token;
    assert.ok(winningToken === tokenB1 || winningToken === tokenB2, "Winning token must be B1 or B2");
    
    for (const row of fetchB) {
      assert.strictEqual(row.status, 'processing');
      assert.strictEqual(row.claim_token, winningToken, "All rows must have the exact same winning token");
      assert.ok(row.claimed_at);
    }
    console.log(`[LIVE] Group B Concurrency passed. Winner was: ${winningToken}`);

  } catch (error) {
    console.error("[LIVE] Test failed:", error);
  } finally {
    if (IS_LIVE && baselineSnapshot.length > 0) {
      console.log(`[LIVE] Cleaning up artificial data...`);
      const allArtificialIds = [...ARTIFICIAL_IDS.groupA, ...ARTIFICIAL_IDS.groupB, ...ARTIFICIAL_IDS.groupC];
      
      const { data: verifyToDelete, error: verifyError } = await supabase
        .from('alarm_log')
        .select('id, booking_id')
        .in('id', allArtificialIds);
      
      if (!verifyError && verifyToDelete) {
        const allowedBookings = [ARTIFICIAL_IDS.bookingA, ARTIFICIAL_IDS.bookingB, ARTIFICIAL_IDS.bookingC];
        // Enforce we are ONLY deleting the expected artificial IDs with correct booking
        const idsToDelete = verifyToDelete
          .filter(r => allowedBookings.includes(r.booking_id))
          .map(r => r.id);
          
        if (idsToDelete.length !== verifyToDelete.length) {
           console.error("[LIVE] FATAL: Found unexpected booking_id in cleanup set. Stopping delete.");
        } else if (idsToDelete.length > 0) {
          await supabase.from('alarm_log').delete().in('id', idsToDelete);
        }
      }

      // Verify baseline intact
      const { data: finalData, error: finalError } = await supabase
        .from('alarm_log')
        .select('*')
        .order('id');
      
      if (finalError) {
        console.error("[LIVE] Error checking final baseline:", finalError);
      } else {
        let baselineIntact = finalData.length === baselineSnapshot.length;
        if (baselineIntact) {
          for (let i = 0; i < baselineSnapshot.length; i++) {
            const original = baselineSnapshot[i];
            const current = finalData.find(f => f.id === original.id);
            if (!current || 
                original.status !== current.status || 
                original.claim_token !== current.claim_token || 
                original.claimed_at !== current.claimed_at ||
                original.retry_count !== current.retry_count ||
                original.last_attempt_at !== current.last_attempt_at ||
                original.sent_at !== current.sent_at ||
                original.error_message !== current.error_message) {
              baselineIntact = false;
              break;
            }
          }
        }
        
        if (baselineIntact) {
          console.log(`[LIVE] Baseline verification PASSED. All real logs intact.`);
        } else {
          console.error(`[LIVE] BASELINE VERIFICATION FAILED. Real logs might have been mutated!`);
        }
      }
    }
  }
}

runTest();
