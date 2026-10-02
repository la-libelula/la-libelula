import { createClient } from '@supabase/supabase-js';
import { evaluateAlarmEmission } from './lib/server/alarmEmitter.js';
import { selectNextAlarmGroup, processNextAlarmGroup } from './lib/server/alarmSender.js';
import assert from 'assert';

console.log("==================================================");
console.log(" PREPARED CONTROLLED SENDER RETRY (SINGLE GROUP)");
console.log("==================================================");

const EXPECTED_LOG_ID = '21a9fea2-1044-4e9a-a4dd-a50347090705';
const EXPECTED_BOOKING_ID = '1b399874-0711-4383-8e8a-d61806d67a9b';
const EXPECTED_HOUSE_ID = 'valles';
const EXPECTED_ALARM_TYPE = 'heating';
const EXPECTED_SCHEDULED_EPOCH = 1790917200000;

export function checkGates(gate1, gate2) {
  return gate1 === 'YES_ONE_RETRY' && gate2 === EXPECTED_LOG_ID;
}

const GATE1 = process.env.LIVE_SENDER_RETRY_EXECUTION;
const GATE2 = process.env.LIVE_SENDER_RETRY_EXPECTED_LOG_ID;

if (!checkGates(GATE1, GATE2)) {
  console.log("\nLIVE RETRY DISABLED\nNo Supabase connection attempted.\n");
  runLocalMockTest().catch(err => { console.error(err); process.exit(1); });
} else {
  runControlledRetry().catch(err => { console.error(err); process.exit(1); });
}

async function loadAndEvaluate(supabase, now) {
  const { data: activeLogs, error: logsError } = await supabase
    .from('alarm_log')
    .select('*')
    .in('status', ['pending', 'failed']);
  if (logsError) throw logsError;

  const bookingIds = [...new Set(activeLogs.map(l => l.booking_id))];
  const houseIds = [...new Set(activeLogs.map(l => l.house_id))];

  let bookings = [];
  if (bookingIds.length > 0) {
    const { data: bData, error: bError } = await supabase.from('bookings').select('*').in('id', bookingIds);
    if (bError) throw bError;
    bookings = bData;
  }

  let settings = [];
  if (houseIds.length > 0) {
    const { data: sData, error: sError } = await supabase.from('alarm_settings').select('*').in('house_id', houseIds);
    if (sError) throw sError;
    settings = sData;
  }

  const evalResult = evaluateAlarmEmission({ now, activeLogs, bookings, settings });
  return { evalResult };
}

async function getGlobalState(supabase) {
  const { data: allLogs, error } = await supabase.from('alarm_log').select('*');
  if (error) throw error;
  return allLogs;
}

function verifyRawTarget(targetLog, allLogs) {
  if (!targetLog) throw new Error("ABORT: Target log not found");
  if (targetLog.status !== 'pending') throw new Error("ABORT: Target log not pending");
  if (targetLog.retry_count !== 0) throw new Error("ABORT: retry_count !== 0");
  if (targetLog.last_attempt_at !== null) throw new Error("ABORT: last_attempt_at !== null");
  if (targetLog.sent_at !== null) throw new Error("ABORT: sent_at !== null");
  if (targetLog.error_message !== null) throw new Error("ABORT: error_message !== null");
  if (targetLog.claim_token !== null) throw new Error("ABORT: claim_token !== null");
  if (targetLog.claimed_at !== null) throw new Error("ABORT: claimed_at !== null");
  if (targetLog.booking_id !== EXPECTED_BOOKING_ID) throw new Error("ABORT: booking_id mismatch");
  if (targetLog.house_id !== EXPECTED_HOUSE_ID) throw new Error("ABORT: house_id mismatch");
  if (targetLog.alarm_type !== EXPECTED_ALARM_TYPE) throw new Error("ABORT: alarm_type mismatch");
  
  const epoch = new Date(targetLog.scheduled_for).getTime();
  if (epoch !== EXPECTED_SCHEDULED_EPOCH) throw new Error("ABORT: epoch mismatch");

  const processing = allLogs.filter(l => l.status === 'processing').length;
  if (processing !== 0) throw new Error("ABORT: processing global !== 0");

  const failed = allLogs.filter(l => l.status === 'failed').length;
  if (failed !== 0) throw new Error("ABORT: failed global !== 0");
  
  const targetSent = allLogs.filter(l => l.status === 'sent' && l.id === EXPECTED_LOG_ID).length;
  if (targetSent !== 0) throw new Error("ABORT: Target sent count !== 0");
}

function verifySelectedGroup(selected) {
  if (!selected) throw new Error("ABORT: No group selected by emitter");
  if (selected.booking_id !== EXPECTED_BOOKING_ID) throw new Error("ABORT: Selected booking_id mismatch");
  if (selected.house_id !== EXPECTED_HOUSE_ID) throw new Error("ABORT: Selected house_id mismatch");
  if (selected.expectedEpoch !== EXPECTED_SCHEDULED_EPOCH) throw new Error("ABORT: Selected epoch mismatch");
  if (selected.ids.length !== 1 || selected.ids[0] !== EXPECTED_LOG_ID) throw new Error("ABORT: Selected log IDs mismatch");
  if (selected.tasks.length !== 1 || selected.tasks[0] !== EXPECTED_ALARM_TYPE) throw new Error("ABORT: Selected tasks mismatch");
}

// ------------------------------------------------------------------
// CONTROLLED RETRY WORKFLOW (INJECTABLE)
// ------------------------------------------------------------------
async function runControlledRetryWorkflow(supabase, senderImpl, nowStr = null) {
  const now = nowStr ? new Date(nowStr) : new Date();
  if (Number.isNaN(now.getTime())) {
    throw new Error('Invalid now');
  }

  // FIRST PREFLIGHT
  const allLogs1 = await getGlobalState(supabase);
  const target1 = allLogs1.find(l => l.id === EXPECTED_LOG_ID);
  verifyRawTarget(target1, allLogs1);

  const { evalResult: res1 } = await loadAndEvaluate(supabase, now);
  const inGroups = res1.groupsToSend.find(g => g.ids.includes(EXPECTED_LOG_ID));
  if (!inGroups) throw new Error("ABORT: Target not in groupsToSend");

  const selected1 = selectNextAlarmGroup(res1.groupsToSend);
  if (!selected1 || selected1.ids[0] !== EXPECTED_LOG_ID) throw new Error("ABORT: Another group selected first");
  verifySelectedGroup(selected1);

  // SECOND PREFLIGHT (Revalidation)
  const allLogs2 = await getGlobalState(supabase);
  const target2 = allLogs2.find(l => l.id === EXPECTED_LOG_ID);
  verifyRawTarget(target2, allLogs2);

  const { evalResult: res2 } = await loadAndEvaluate(supabase, now);
  const selected2 = selectNextAlarmGroup(res2.groupsToSend);
  if (!selected2 || selected2.ids[0] !== EXPECTED_LOG_ID) throw new Error("ABORT: Second evaluation selected another group");
  verifySelectedGroup(selected2);

  console.log("\n[LIVE TARGET REVALIDATED]");
  console.log(`house_id: ${selected2.house_id}`);
  console.log(`tasks: ${selected2.tasks.join(', ')}`);
  console.log(`--- MESSAGE ---\n${selected2.message}\n-------------`);

  // EXACTLY ONE SENDER EXECUTION
  console.log("\n[EXECUTING SENDER ONCE]...");
  const execResult = await senderImpl({ supabase, now });
  console.log("Execution result:", execResult);

  // STOP CONDITION
  if (execResult.result !== 'sent') {
    console.log(`Stopped. Result was ${execResult.result}. No automatic retry will be performed.`);
    return; // Graceful stop, handled correctly without throw.
  }

  // POSTCHECK IF SENT
  const allLogs3 = await getGlobalState(supabase);
  const target3 = allLogs3.find(l => l.id === EXPECTED_LOG_ID);
  
  let postcheckFailed = false;
  if (!target3) { console.log("Target missing"); postcheckFailed = true; }
  else if (target3.status !== 'sent') { console.log("status !== sent"); postcheckFailed = true; }
  else if (target3.retry_count !== 1) { console.log("retry_count !== 1"); postcheckFailed = true; }
  else if (target3.last_attempt_at === null) { console.log("last_attempt_at === null"); postcheckFailed = true; }
  else if (target3.sent_at === null) { console.log("sent_at === null"); postcheckFailed = true; }
  else if (target3.error_message !== null) { console.log("error_message !== null"); postcheckFailed = true; }
  else if (target3.claim_token !== null) { console.log("claim_token !== null"); postcheckFailed = true; }
  else if (target3.claimed_at !== null) { console.log("claimed_at !== null"); postcheckFailed = true; }

  const processing3 = allLogs3.filter(l => l.status === 'processing').length;
  if (processing3 !== 0) { console.log("processing global !== 0"); postcheckFailed = true; }

  if (postcheckFailed) {
    console.log("\n==================================================");
    console.log(" MANUAL REVIEW REQUIRED");
    console.log(" POSTCHECK FAILED");
    console.log("==================================================");
    throw new Error("MANUAL REVIEW REQUIRED");
  } else {
    console.log("Postcheck passed successfully.");
  }
}

async function runControlledRetry() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) throw new Error("Missing credentials.");
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  await runControlledRetryWorkflow(supabase, processNextAlarmGroup);
}

// ------------------------------------------------------------------
// LOCAL MOCK TEST
// ------------------------------------------------------------------
async function runLocalMockTest() {
  let senderCalls = 0;
  
  assert.strictEqual(checkGates('YES_ONE_GROUP', EXPECTED_LOG_ID), false, "B: YES_ONE_GROUP rejected");
  assert.strictEqual(checkGates('YES_ONE_INCIDENT', EXPECTED_LOG_ID), false, "C: YES_ONE_INCIDENT rejected");
  assert.strictEqual(checkGates('YES_ONE_RETRY', 'wrong-id'), false, "D: ID incorrect rejected");
  assert.strictEqual(checkGates('YES_ONE_RETRY', EXPECTED_LOG_ID), true, "Correct gates");

  function getMockValidState() {
    return {
      allLogs: [
        { id: EXPECTED_LOG_ID, booking_id: EXPECTED_BOOKING_ID, house_id: EXPECTED_HOUSE_ID, alarm_type: EXPECTED_ALARM_TYPE, scheduled_for: new Date(EXPECTED_SCHEDULED_EPOCH).toISOString(), status: 'pending', retry_count: 0, last_attempt_at: null, sent_at: null, error_message: null, claim_token: null, claimed_at: null }
      ],
      bookings: [{ id: EXPECTED_BOOKING_ID, house_id: EXPECTED_HOUSE_ID, check_in: '2026-10-02' }],
      settings: [{ id: 's1', house_id: EXPECTED_HOUSE_ID, alarm_type: EXPECTED_ALARM_TYPE, is_enabled: true, days_before: 0, alarm_time: '07:00' }]
    };
  }

  function createMockSupabase(getStateFn) {
    return {
      from: (table) => ({
        select: () => ({
          in: async (col, arr) => {
            const s = getStateFn(table);
            if (table === 'alarm_log') return { data: s.allLogs.filter(l => arr.includes(l[col]) && ['pending','failed'].includes(l.status)), error: null };
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

  async function testFail(stateOverride, expectedErrorStr, dynamicStateFn = null) {
    let reads = 0;
    let base = getMockValidState();
    if (stateOverride) {
      if (stateOverride.logs) base.allLogs = stateOverride.logs;
      if (stateOverride.bookings) base.bookings = stateOverride.bookings;
      if (stateOverride.settings) base.settings = stateOverride.settings;
    }
    
    let stateFn = () => {
      reads++;
      if (dynamicStateFn) return dynamicStateFn(reads, base);
      return base;
    };

    const sb = createMockSupabase(stateFn);
    senderCalls = 0;
    try {
      await runControlledRetryWorkflow(sb, async () => { senderCalls++; }, "2026-10-02T12:00:00Z");
      assert.fail(`Expected abort: ${expectedErrorStr}`);
    } catch (e) {
      if (e.message.includes('Expected abort')) throw e;
      assert.ok(e.message.includes(expectedErrorStr), `Wrong error: ${e.message} (expected: ${expectedErrorStr})`);
    }
    assert.strictEqual(senderCalls, 0, "Sender must not be called");
  }

  console.log("Running clock tests (Invalid now)");
  try {
    const fakeSb = createMockSupabase(() => getMockValidState());
    await runControlledRetryWorkflow(fakeSb, async () => {}, "invalid-date");
    assert.fail(`Expected abort: Invalid now`);
  } catch (e) {
    if (e.message.includes('Expected abort')) throw e;
    assert.ok(e.message.includes("Invalid now"), `Wrong error: ${e.message}`);
  }

  console.log("Running A, B, C, D (Gates)");

  console.log("Running E (Target nonexistent)");
  await testFail({ logs: [] }, "Target log not found");

  console.log("Running F (Target not pending)");
  await testFail({ logs: [{...getMockValidState().allLogs[0], status: 'failed'}] }, "Target log not pending");

  console.log("Running G (Retry != 0)");
  await testFail({ logs: [{...getMockValidState().allLogs[0], retry_count: 1}] }, "retry_count !==");

  console.log("Running H (last_attempt_at != null)");
  await testFail({ logs: [{...getMockValidState().allLogs[0], last_attempt_at: '2026'}] }, "last_attempt_at !==");

  console.log("Running I (sent_at != null)");
  await testFail({ logs: [{...getMockValidState().allLogs[0], sent_at: '2026'}] }, "sent_at !==");

  console.log("Running J (error_message != null)");
  await testFail({ logs: [{...getMockValidState().allLogs[0], error_message: 'Err'}] }, "error_message !==");

  console.log("Running K (claim_token != null)");
  await testFail({ logs: [{...getMockValidState().allLogs[0], claim_token: 'uuid'}] }, "claim_token !==");

  console.log("Running L (claimed_at != null)");
  await testFail({ logs: [{...getMockValidState().allLogs[0], claimed_at: '2026'}] }, "claimed_at !==");

  console.log("Running M (processing global != 0)");
  await testFail({ logs: [getMockValidState().allLogs[0], {...getMockValidState().allLogs[0], id: 'other', status: 'processing'}] }, "processing global !== 0");

  console.log("Running N (booking distinct)");
  await testFail({ logs: [{...getMockValidState().allLogs[0], booking_id: 'other'}], bookings: [{id: 'other', house_id: EXPECTED_HOUSE_ID, check_in: '2026-10-02'}] }, "booking_id mismatch");

  console.log("Running O (house distinct)");
  await testFail({ logs: [{...getMockValidState().allLogs[0], house_id: 'other'}], settings: [{id: 's', house_id: 'other', alarm_type: EXPECTED_ALARM_TYPE, is_enabled: true, days_before: 0, alarm_time: '07:00'}] }, "house_id mismatch");

  console.log("Running P (alarm_type distinct)");
  await testFail({ logs: [{...getMockValidState().allLogs[0], alarm_type: 'fridge'}], settings: [{id:'s', house_id: EXPECTED_HOUSE_ID, alarm_type: 'fridge', is_enabled: true, days_before: 0, alarm_time: '07:00'}] }, "alarm_type mismatch");

  console.log("Running Q (epoch distinct)");
  await testFail({ logs: [{...getMockValidState().allLogs[0], scheduled_for: new Date(EXPECTED_SCHEDULED_EPOCH + 1000).toISOString()}] }, "epoch mismatch");

  console.log("Running R (target not appears in groupsToSend)");
  await testFail({ settings: [] }, "Target not in groupsToSend");

    console.log("Running S (another group selected first)");
  let stS = getMockValidState();
  stS.allLogs.push({ id: 'older-id', booking_id: 'other-b', house_id: 'gredos', alarm_type: 'heating', scheduled_for: new Date(EXPECTED_SCHEDULED_EPOCH - 3600000).toISOString(), status: 'pending', retry_count: 0, last_attempt_at: null, sent_at: null, error_message: null, claim_token: null, claimed_at: null });
  stS.bookings.push({ id: 'other-b', house_id: 'gredos', check_in: '2026-10-02' });
  stS.settings.push({ id: 's2', house_id: 'gredos', alarm_type: 'heating', is_enabled: true, days_before: 0, alarm_time: '06:00' });
  await testFail({ logs: stS.allLogs, bookings: stS.bookings, settings: stS.settings }, "Another group selected first");

  console.log("Running T (second read changes target)");
  await testFail(null, "Target log not pending", (reads, baseSt) => {
    let copy = JSON.parse(JSON.stringify(baseSt));
    if (reads > 2) copy.allLogs[0].status = 'sent';
    return copy;
  });

    console.log("Running U (second evaluation changes selection)");
  await testFail(null, "Second evaluation selected another group", (reads, baseSt) => {
    let copy = JSON.parse(JSON.stringify(baseSt));
    if (reads > 4) copy.settings = [];
    return copy;
  });

  // SUCCESS & RESULT TESTS
  async function testResult(senderRes, postcheckMutator, expectManualReviewStr) {
    let tReads = 0;
    let tSt = getMockValidState();
    let sbSuccess = createMockSupabase((table) => {
      tReads++;
      let copy = JSON.parse(JSON.stringify(tSt));
      if (tReads > 8) { // Roughly postcheck time
         if (postcheckMutator) postcheckMutator(copy);
      }
      return copy;
    });
    
    senderCalls = 0;
    const _log = console.log; console.log = () => {};
    try {
      await runControlledRetryWorkflow(sbSuccess, async () => { senderCalls++; return { result: senderRes }; }, "2026-10-02T12:00:00Z");
      if (expectManualReviewStr) assert.fail("Expected MANUAL REVIEW");
    } catch(e) {
      if (!expectManualReviewStr || !e.message.includes(expectManualReviewStr)) throw e;
    }
    console.log = _log;
    assert.strictEqual(senderCalls, 1, "Sender must be called exactly once");
  }

  console.log("Running V, W (sender max once, sent + postcheck correct)");
  await testResult('sent', (c) => {
    c.allLogs[0].status = 'sent';
    c.allLogs[0].retry_count = 1;
    c.allLogs[0].last_attempt_at = '2026-10-02T12:00:00Z';
    c.allLogs[0].sent_at = '2026-10-02T12:00:00Z';
  }, null);

  console.log("Running X (sent + postcheck incorrect => manual review)");
  await testResult('sent', (c) => {
    // left processing
    c.allLogs[0].status = 'processing';
  }, 'MANUAL REVIEW REQUIRED');

  console.log("Running Y (sender skipped => no second attempt, no error thrown)");
  await testResult('skipped', null, null);

  console.log("Running Z (sender manual_review => no second attempt, no error thrown)");
  await testResult('manual_review', null, null);

  console.log("\nAll Local Sender Retry Validation Tests Passed.");
}




