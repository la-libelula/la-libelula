import { createClient } from '@supabase/supabase-js';
import { evaluateAlarmEmission } from './lib/server/alarmEmitter.js';
import { selectNextAlarmGroup, processNextAlarmGroup } from './lib/server/alarmSender.js';
import assert from 'assert';

console.log("==================================================");
console.log(" PREPARED CONTROLLED LIVE SENDER (SINGLE GROUP)");
console.log("==================================================");

const EXPECTED_LOG_ID = '21a9fea2-1044-4e9a-a4dd-a50347090705';
const EXPECTED_BOOKING_ID = '1b399874-0711-4383-8e8a-d61806d67a9b';
const EXPECTED_HOUSE_ID = 'valles';
const EXPECTED_SCHEDULED_EPOCH = 1790917200000;
const EXPECTED_LOG_IDS = [EXPECTED_LOG_ID];
const EXPECTED_TASKS = ['heating'];

const GATE1 = process.env.LIVE_SENDER_EXECUTION;
const GATE2 = process.env.LIVE_SENDER_EXPECTED_LOG_ID;

if (GATE1 !== 'YES_ONE_GROUP' || GATE2 !== EXPECTED_LOG_ID) {
  console.log("\nLIVE SENDER DISABLED\nNo claim or Telegram attempted.\n");
  runLocalMockTest().catch(err => { console.error(err); process.exit(1); });
} else {
  runControlledLive().catch(err => { console.error(err); process.exit(1); });
}

async function loadAndEvaluate(supabase, now) {
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

function verifyTargetMatch(group) {
  if (!group) return false;
  if (group.booking_id !== EXPECTED_BOOKING_ID) return false;
  if (group.house_id !== EXPECTED_HOUSE_ID) return false;
  if (group.expectedEpoch !== EXPECTED_SCHEDULED_EPOCH) return false;
  
  const ids1 = [...group.ids].sort();
  const ids2 = [...EXPECTED_LOG_IDS].sort();
  if (ids1.length !== ids2.length || ids1.some((id, i) => id !== ids2[i])) return false;
  
  const tasks1 = [...group.tasks].sort();
  const tasks2 = [...EXPECTED_TASKS].sort();
  if (tasks1.length !== tasks2.length || tasks1.some((t, i) => t !== tasks2[i])) return false;

  return true;
}

// ------------------------------------------------------------------
// CONTROLLED LIVE WORKFLOW (INJECTABLE FOR TESTS)
// ------------------------------------------------------------------
async function runControlledLiveWorkflow(supabase, senderImpl, isDryRunTest = false) {
  const { data: allLogs, error: bErr } = await supabase.from('alarm_log').select('id, status, claim_token, claimed_at');
  if (bErr) throw bErr;
  
  const processing = allLogs.filter(r => r.status === 'processing').length;
  const failed = allLogs.filter(r => r.status === 'failed').length;
  const sent = allLogs.filter(r => r.status === 'sent').length;
  const obsolete = allLogs.filter(r => r.status === 'obsolete').length;
  const tokens = allLogs.filter(r => r.claim_token !== null).length;
  const claimedAt = allLogs.filter(r => r.claimed_at !== null).length;

  if (processing > 0 || failed > 0 || sent > 0 || obsolete > 0 || tokens > 0 || claimedAt > 0) {
    throw new Error("ABORT: Baseline strictly fails (non-zero invalid states detected)");
  }

  const targetLog = allLogs.find(r => r.id === EXPECTED_LOG_ID);
  if (!targetLog) throw new Error("ABORT: Target log not found");
  if (targetLog.status !== 'pending' || targetLog.claim_token !== null || targetLog.claimed_at !== null) {
    throw new Error("ABORT: Target log state invalid");
  }

  const now = new Date('2026-10-02T12:00:00Z'); // Fixed test date so it matches the due epoch

  // PREFLIGHT 1
  const { evalResult: result1 } = await loadAndEvaluate(supabase, now);
  const selected1 = selectNextAlarmGroup(result1.groupsToSend);
  if (!verifyTargetMatch(selected1)) {
    throw new Error("ABORT: First preflight selected group does not match exact pre-approved target");
  }

  // PREFLIGHT 2 (Revalidation)
  const { evalResult: result2 } = await loadAndEvaluate(supabase, now);
  const selected2 = selectNextAlarmGroup(result2.groupsToSend);
  if (!verifyTargetMatch(selected2)) {
    throw new Error("ABORT: Second preflight (revalidation) changed or mismatched");
  }

  console.log("\n[LIVE TARGET VERIFIED]");
  console.log(`house_id: ${selected2.house_id}`);
  console.log(`scheduled_for: ${selected2.scheduled_for}`);
  console.log(`tasks: ${selected2.tasks.join(', ')}`);
  console.log(`log IDs: ${selected2.ids.join(', ')}`);
  console.log(`--- MESSAGE ---\n${selected2.message}\n-------------`);

  // EXACTLY ONE SENDER EXECUTION
  console.log("\n[EXECUTING SENDER ONCE]...");
  const execResult = await senderImpl({ supabase, now });
  console.log("Execution result:", execResult);

  // POSTCHECK
  const { data: postcheckLogs, error: postErr } = await supabase.from('alarm_log').select('id, status, retry_count, last_attempt_at, sent_at, claim_token, claimed_at, error_message');
  if (postErr) throw postErr;

  const targetPost = postcheckLogs.find(r => r.id === EXPECTED_LOG_ID);
  console.log("\n[POSTCHECK LOG STATE]");
  console.log(`status: ${targetPost.status}`);
  console.log(`retry_count: ${targetPost.retry_count}`);
  console.log(`last_attempt_at: ${targetPost.last_attempt_at}`);
  console.log(`sent_at: ${targetPost.sent_at}`);
  console.log(`claim_token_is_null: ${targetPost.claim_token === null}`);
  console.log(`claimed_at_is_null: ${targetPost.claimed_at === null}`);
  console.log(`error_message_present: ${!!targetPost.error_message}`);

  if (targetPost.status === 'processing') {
    console.log("\n==================================================");
    console.log(" MANUAL REVIEW REQUIRED");
    console.log(" DO NOT RETRY TELEGRAM");
    console.log("==================================================");
  }
}

// ------------------------------------------------------------------
// LIVE PREFLIGHT SCRIPT MAIN (WHEN GATED)
// ------------------------------------------------------------------
async function runControlledLive() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase credentials.");
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  await runControlledLiveWorkflow(supabase, processNextAlarmGroup);
}

// ------------------------------------------------------------------
// LOCAL MOCK TEST
// ------------------------------------------------------------------
async function runLocalMockTest() {
  let senderCalls = 0;
  
  function getBaselineValid() {
    return [
      { id: EXPECTED_LOG_ID, status: 'pending', claim_token: null, claimed_at: null },
      { id: 'another', status: 'pending', claim_token: null, claimed_at: null }
    ];
  }
  
  function getMockValidState() {
    return {
      allLogs: getBaselineValid(),
      logs: [
        { id: EXPECTED_LOG_ID, booking_id: EXPECTED_BOOKING_ID, house_id: EXPECTED_HOUSE_ID, alarm_type: 'heating', scheduled_for: '2026-10-02T05:00:00+00:00', status: 'pending', retry_count: 0 }
      ],
      bookings: [{ id: EXPECTED_BOOKING_ID, house_id: EXPECTED_HOUSE_ID, check_in: '2026-10-02' }],
      settings: [{ id: 's1', house_id: EXPECTED_HOUSE_ID, alarm_type: 'heating', is_enabled: true, days_before: 0, alarm_time: '07:00' }]
    };
  }

  function createMockSupabase(getStateFn) {
    return {
      from: (table) => ({
        select: (cols) => ({
          in: async (col, arr) => {
            const s = getStateFn(table);
            if (table === 'alarm_log') return { data: s.logs.filter(l => arr.includes(l[col])), error: null };
            if (table === 'bookings') return { data: s.bookings.filter(b => arr.includes(b[col])), error: null };
            if (table === 'alarm_settings') return { data: s.settings.filter(s => arr.includes(s[col])), error: null };
            return { data: [], error: null };
          },
          then: (resolve) => {
             const s = getStateFn(table);
             if (table === 'alarm_log') resolve({ data: s.allLogs, error: null });
             else resolve({ data: [], error: null });
          }
        })
      })
    };
  }

  async function testFail(stateOverride, expectedErrorStr) {
    let state = getMockValidState();
    Object.assign(state, stateOverride);
    const sb = createMockSupabase(() => state);
    senderCalls = 0;
    try {
      await runControlledLiveWorkflow(sb, async () => { senderCalls++; }, true);
      assert.fail(`Expected abort: ${expectedErrorStr}`);
    } catch (e) {
      if (e.message.includes('Expected abort')) throw e;
      assert.ok(e.message.includes(expectedErrorStr), `Wrong error: ${e.message}`);
    }
    assert.strictEqual(senderCalls, 0, "Sender should not be called");
  }

  console.log("Running A, B (Implicitly tested by gate check at start).");

  console.log("Running C (booking diff)");
  await testFail({ bookings: [{ id: 'other', house_id: EXPECTED_HOUSE_ID, check_in: '2026-10-02' }], logs: [{...getMockValidState().logs[0], booking_id: 'other'}] }, "does not match");

  console.log("Running D (house diff)");
  await testFail({ bookings: [{ id: EXPECTED_BOOKING_ID, house_id: 'gredos', check_in: '2026-10-02' }], logs: [{...getMockValidState().logs[0], house_id: 'gredos'}], settings: [{...getMockValidState().settings[0], house_id: 'gredos'}] }, "does not match");

  console.log("Running E (epoch diff)");
  await testFail({ settings: [{...getMockValidState().settings[0], alarm_time: '10:00'}] }, "does not match");

  console.log("Running F (IDs diff)");
  let fLogs = [...getMockValidState().logs];
  fLogs[0].id = 'wrong-id';
  let fAllLogs = [...getBaselineValid()];
  fAllLogs[0].id = 'wrong-id';
  await testFail({ logs: fLogs, allLogs: fAllLogs }, "not found");

  console.log("Running G (Tasks diff)");
  let gLogs = [...getMockValidState().logs];
  gLogs[0].alarm_type = 'fridge';
  let gSettings = [...getMockValidState().settings];
  gSettings[0].alarm_type = 'fridge';
  await testFail({ logs: gLogs, settings: gSettings }, "does not match");

  console.log("Running H (Target not pending)");
  let hAllLogs = [...getBaselineValid()];
  hAllLogs[0].status = 'sent';
  await testFail({ allLogs: hAllLogs }, "Baseline strictly fails");

  console.log("Running I (Claim token present)");
  let iAllLogs = [...getBaselineValid()];
  iAllLogs[0].claim_token = '123';
  await testFail({ allLogs: iAllLogs }, "Baseline strictly fails");

  console.log("Running J (Baseline has processing)");
  let jAllLogs = [...getBaselineValid()];
  jAllLogs.push({ id: 'bad', status: 'processing', claim_token: null, claimed_at: null });
  await testFail({ allLogs: jAllLogs }, "Baseline strictly fails");

  console.log("Running K (Revalidation changes)");
  let reads = 0;
  let dynamicState = (table) => {
    const st = getMockValidState();
    if (table === 'alarm_log') reads++;
    if (reads > 2) {
      st.logs[0].alarm_type = 'outdoor_light';
      st.settings[0].alarm_type = 'outdoor_light';
    }
    return st;
  };
  const sbK = createMockSupabase(dynamicState);
  senderCalls = 0;
  try {
    await runControlledLiveWorkflow(sbK, async () => { senderCalls++; }, true);
    assert.fail("Expected abort");
  } catch(e) {
    assert.ok(e.message.includes('Second preflight'));
  }
  assert.strictEqual(senderCalls, 0);

  console.log("Running L, M, N, O, P (Everything correct => 1 call)");
  const successResults = ['sent', 'failed_and_recorded', 'manual_review', 'skipped'];
  for (const r of successResults) {
    let finalState = getMockValidState();
    const sb = createMockSupabase(() => finalState);
    senderCalls = 0;
    
    const _log = console.log; console.log = () => {};
    await runControlledLiveWorkflow(sb, async () => { senderCalls++; return { result: r }; }, true);
    console.log = _log;
    
    assert.strictEqual(senderCalls, 1, `Sender calls must be exactly 1 for result ${r}`);
  }

  console.log("Running Q (Postcheck processing => warning)");
  let qState = getMockValidState();
  const sbQ = createMockSupabase((table) => qState);
  let warningCount = 0;
  const _logQ = console.log;
  console.log = (msg) => { if (typeof msg === 'string' && msg.includes('MANUAL REVIEW REQUIRED')) warningCount++; };
  await runControlledLiveWorkflow(sbQ, async () => {
    qState.allLogs[0].status = 'processing';
    return { result: 'manual_review' };
  }, true);
  console.log = _logQ;
  assert.strictEqual(warningCount, 1, "Must print manual review warning");

  console.log("\nAll Local Preflight Validation Tests Passed.");
}


