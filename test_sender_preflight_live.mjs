import { createClient } from '@supabase/supabase-js';
import { evaluateAlarmEmission } from './lib/server/alarmEmitter.js';
import { selectNextAlarmGroup } from './lib/server/alarmSender.js';
import assert from 'assert';

console.log("==================================================");
console.log(" READ ONLY PREFLIGHT");
console.log(" NO CLAIM");
console.log(" NO TELEGRAM");
console.log(" NO WRITES");
console.log("==================================================");

const GATE = process.env.LIVE_SENDER_PREFLIGHT;
if (GATE !== 'YES_READ_ONLY') {
  console.log("\nDRY RUN ONLY\nNo Supabase connection attempted.\n");
  runLocalMockTest().catch(err => { console.error(err); process.exit(1); });
} else {
  runLivePreflight().catch(err => { console.error(err); process.exit(1); });
}

// ------------------------------------------------------------------
// LIVE PREFLIGHT SCRIPT
// ------------------------------------------------------------------
async function loadAndEvaluate(supabase, now) {
  // STRICTLY SELECT ONLY
  const { data: activeLogs, error: logsError } = await supabase
    .from('alarm_log')
    .select('id, booking_id, house_id, alarm_type, scheduled_for, status, retry_count, last_attempt_at, claim_token, claimed_at')
    .in('status', ['pending', 'failed']);

  if (logsError) throw logsError;

  const bookingIds = [...new Set(activeLogs.map(l => l.booking_id))];
  const houseIds = [...new Set(activeLogs.map(l => l.house_id))];

  let bookings = [];
  if (bookingIds.length > 0) {
    const { data: bData, error: bError } = await supabase
      .from('bookings')
      .select('id, house_id, check_in')
      .in('id', bookingIds);
    if (bError) throw bError;
    bookings = bData;
  }

  let settings = [];
  if (houseIds.length > 0) {
    const { data: sData, error: sError } = await supabase
      .from('alarm_settings')
      .select('id, house_id, alarm_type, is_enabled, days_before, alarm_time')
      .in('house_id', houseIds);
    if (sError) throw sError;
    settings = sData;
  }

  const evalResult = evaluateAlarmEmission({ now, activeLogs, bookings, settings });
  return { activeLogs, evalResult };
}

async function runLivePreflight() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase credentials for LIVE_SENDER_PREFLIGHT.");
  }
  

  // Create Client ONLY after passing gate
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  // Also fetch full baseline purely for diagnostics
  const { data: allLogs, error: bErr } = await supabase.from('alarm_log').select('status, claim_token, claimed_at');
  if (bErr) throw bErr;
  
  const total = allLogs.length;
  const pending = allLogs.filter(r => r.status === 'pending').length;
  const processing = allLogs.filter(r => r.status === 'processing').length;
  const failed = allLogs.filter(r => r.status === 'failed').length;
  const sent = allLogs.filter(r => r.status === 'sent').length;
  const obsolete = allLogs.filter(r => r.status === 'obsolete').length;
  const tokens = allLogs.filter(r => r.claim_token !== null).length;
  const claimedAt = allLogs.filter(r => r.claimed_at !== null).length;
  
  console.log("\n[BASELINE DIAGNOSTICS]");
  console.log(`total: ${total}`);
  console.log(`pending: ${pending}`);
  console.log(`processing: ${processing}`);
  console.log(`failed: ${failed}`);
  console.log(`sent: ${sent}`);
  console.log(`obsolete: ${obsolete}`);
  console.log(`claim_token_non_null_count: ${tokens}`);
  console.log(`claimed_at_non_null_count: ${claimedAt}`);

  const now = new Date();
  console.log(`\nEvaluating emission at: ${now.toISOString()} ...`);
  const { evalResult: result1 } = await loadAndEvaluate(supabase, now);
  
  console.log("\n[CLASSIFICATION SUMMARY]");
  console.log(`future: ${result1.safeClassifications.future}`);
  console.log(`due: ${result1.safeClassifications.due}`);
  console.log(`stale: ${result1.safeClassifications.stale.length}`);
  console.log(`obsolete: ${result1.safeClassifications.obsolete.length}`);
  console.log(`retry_wait: ${result1.safeClassifications.retry_wait}`);
  console.log(`retry_exhausted: ${result1.safeClassifications.retry_exhausted}`);
  console.log(`invalid: ${result1.safeClassifications.invalid.length}`);
  console.log(`groupsToSend: ${result1.groupsToSend.length}`);

  if (result1.groupsToSend.length === 0) {
    console.log("\n[RESULT] No groups due for sending. Exiting safely.");
    process.exit(0);
  }

  const selectedGroup = selectNextAlarmGroup(result1.groupsToSend);
  
  console.log("\n[SELECTED GROUP PREFLIGHT]");
  console.log(`booking_id: ${selectedGroup.booking_id}`);
  console.log(`house_id: ${selectedGroup.house_id}`);
  console.log(`scheduled_for: ${selectedGroup.scheduled_for}`);
  console.log(`expectedEpoch: ${selectedGroup.expectedEpoch}`);
  console.log(`log IDs: ${selectedGroup.ids.join(', ')}`);
  console.log(`alarm_types/tasks: ${selectedGroup.tasks.join(', ')}`);
  console.log(`cantidad de filas: ${selectedGroup.ids.length}`);
  console.log(`\n--- MENSAJE EXACTO TELEGRAM ---\n${selectedGroup.message}\n-------------------------------`);
  
  console.log("\nSimulating second READ-ONLY revalidation...");
  const { evalResult: result2 } = await loadAndEvaluate(supabase, now);
  
  const revalidatedGroup = result2.groupsToSend.find(g => 
    g.booking_id === selectedGroup.booking_id && 
    g.house_id === selectedGroup.house_id &&
    g.expectedEpoch === selectedGroup.expectedEpoch
  );

  let passed = true;
  if (!revalidatedGroup) {
    passed = false;
  } else {
    const ids1 = [...selectedGroup.ids].sort();
    const ids2 = [...revalidatedGroup.ids].sort();
    if (ids1.length !== ids2.length || ids1.some((id, i) => id !== ids2[i])) {
      passed = false;
    }
    const tasks1 = [...selectedGroup.tasks].sort();
    const tasks2 = [...revalidatedGroup.tasks].sort();
    if (tasks1.length !== tasks2.length || tasks1.some((t, i) => t !== tasks2[i])) {
      passed = false;
    }
  }

  if (passed) {
    console.log("\nREVALIDATION: PASSED");
  } else {
    console.log("\nREVALIDATION: CHANGED");
  }

  console.log("\nPreflight complete. NO WRITES PERFORMED.");
}

// ------------------------------------------------------------------
// LOCAL MOCK TEST
// ------------------------------------------------------------------
async function runLocalMockTest() {
  function createMockSupabase(mockState) {
    return {
      from: (table) => ({
        select: (cols) => {
          let reqCols = cols ? cols.split(',').map(c=>c.trim()) : [];
          return {
            in: async (col, arr) => {
              if (table === 'alarm_log') return { data: mockState.logs.filter(l => arr.includes(l[col])), error: null };
              if (table === 'bookings') return { data: mockState.bookings.filter(b => arr.includes(b[col])), error: null };
              if (table === 'alarm_settings') return { data: mockState.settings.filter(s => arr.includes(s[col])), error: null };
              return { data: [], error: null };
            },
            then: (resolve) => {
               // Mocking .select().then() directly for the baseline fetch
               if (table === 'alarm_log') {
                 resolve({ data: mockState.allLogs || mockState.logs, error: null });
               } else {
                 resolve({ data: [], error: null });
               }
            }
          }
        }
      }),
      rpc: () => { throw new Error("RPC CALLED IN PREFLIGHT!"); },
      insert: () => { throw new Error("INSERT CALLED IN PREFLIGHT!"); },
      update: () => { throw new Error("UPDATE CALLED IN PREFLIGHT!"); }
    };
  }

  const pastD = '2026-10-02T08:00:00.000Z';
  let state = {
    logs: [
      { id: '1', booking_id: 'b1', house_id: 'valles', alarm_type: 'fridge', scheduled_for: pastD, status: 'pending', retry_count: 0 },
      { id: '2', booking_id: 'b1', house_id: 'valles', alarm_type: 'heating', scheduled_for: pastD, status: 'pending', retry_count: 0 },
      { id: '3', booking_id: 'b1', house_id: 'valles', alarm_type: 'hot_water', scheduled_for: pastD, status: 'pending', retry_count: 0 },
    ],
    bookings: [{ id: 'b1', house_id: 'valles', check_in: '2026-10-02' }],
    settings: [
      { id: 's1', house_id: 'valles', alarm_type: 'fridge', is_enabled: true, days_before: 0, alarm_time: '10:00' },
      { id: 's2', house_id: 'valles', alarm_type: 'heating', is_enabled: true, days_before: 0, alarm_time: '10:00' },
      { id: 's3', house_id: 'valles', alarm_type: 'hot_water', is_enabled: true, days_before: 0, alarm_time: '10:00' }
    ],
    allLogs: [
      { status: 'pending', claim_token: null, claimed_at: null },
      { status: 'pending', claim_token: null, claimed_at: null },
      { status: 'pending', claim_token: null, claimed_at: null },
      { status: 'processing', claim_token: 'uuid', claimed_at: '2026-01-01' }
    ]
  };

  const n = new Date('2026-10-02T12:00:00Z');
  
  let sb = createMockSupabase(state);
  
  // Test shared selectNextAlarmGroup behavior
  const { evalResult: res1 } = await loadAndEvaluate(sb, n);
  const selected = selectNextAlarmGroup(res1.groupsToSend);
  assert.strictEqual(selected.tasks.length, 3, "Debe agrupar las 3 tareas");
  assert.strictEqual(selected.house_id, 'valles');
  
  // Simulate revalidation PASSED
  const { evalResult: res2 } = await loadAndEvaluate(sb, n);
  const revalidated = res2.groupsToSend.find(g => g.booking_id === selected.booking_id);
  assert.ok(revalidated);
  assert.deepStrictEqual([...selected.ids].sort(), [...revalidated.ids].sort());
  assert.deepStrictEqual([...selected.tasks].sort(), [...revalidated.tasks].sort());
  
  // Simulate revalidation CHANGED
  state.logs.pop(); // Drop one task
  const { evalResult: res3 } = await loadAndEvaluate(sb, n);
  const revalChanged = res3.groupsToSend.find(g => g.booking_id === selected.booking_id);
  assert.notDeepStrictEqual([...selected.ids].sort(), [...revalChanged.ids].sort());
  
  console.log("Mock Dry-Run Tests Passed Successfully.");
}

