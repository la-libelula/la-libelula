import assert from 'assert';
import { processNextAlarmGroup, defaultTelegramTransport } from './lib/server/alarmSender.js';
import handler from './api/alarms/send.js';

async function runTransportTests() {
  console.log("Running Transport Tests...");
  process.env.TELEGRAM_BOT_TOKEN = "TEST";
  process.env.TELEGRAM_CHAT_ID = "TEST";
  
  let res = await defaultTelegramTransport("msg", null, async () => ({ ok: true, json: async () => ({ok: true}) }));
  assert.strictEqual(res.status, 'success');

  res = await defaultTelegramTransport("msg", null, async () => ({ ok: false, status: 400 }));
  assert.strictEqual(res.status, 'failure');

  res = await defaultTelegramTransport("msg", null, async () => ({ ok: true, json: async () => ({ok: false}) }));
  assert.strictEqual(res.status, 'failure');

  res = await defaultTelegramTransport("msg", null, async () => ({ ok: true, json: async () => { throw new Error("JSON parse err"); } }));
  assert.strictEqual(res.status, 'uncertain');

  res = await defaultTelegramTransport("msg", null, async () => { throw new Error("Network offline"); });
  assert.strictEqual(res.status, 'uncertain');

  res = await defaultTelegramTransport("msg", null, async () => { 
    const e = new Error("Abort"); e.name = "AbortError"; throw e; 
  });
  assert.strictEqual(res.status, 'uncertain');

  res = await defaultTelegramTransport("msg", null, async () => ({ ok: true, json: async () => ({}) }));
  assert.strictEqual(res.status, 'uncertain');

  res = await defaultTelegramTransport("msg", null, async () => ({ ok: true, json: async () => null }));
  assert.strictEqual(res.status, 'uncertain');
}

function createMockSupabase(getStateFn, recordRpcFn, mockRpcResults) {
  return {
    from: (table) => ({
      select: () => ({
        in: async (col, arr) => {
          const s = getStateFn(table);
          if (table === 'alarm_log') return { data: s.logs.filter(l => arr.includes(l[col])), error: null };
          if (table === 'bookings') return { data: s.bookings.filter(b => arr.includes(b[col])), error: null };
          if (table === 'alarm_settings') return { data: s.settings.filter(s => arr.includes(s[col])), error: null };
          return { data: [], error: null };
        }
      })
    }),
        rpc: async (fnName, params) => {
      recordRpcFn(fnName, params);
      if (mockRpcResults && mockRpcResults[fnName]) {
        return mockRpcResults[fnName]();
      }
      const c = params.p_ids ? params.p_ids.length : 0;
      if (fnName === 'claim_alarm_group') return { data: [{ claimed_count: c }], error: null };
      return { data: [{ updated_count: c }], error: null };
    }
  };
}

async function runSenderTests() {
  console.log("Running Sender Tests...");
  const n = new Date('2026-10-02T12:00:00Z');
  const pastD = '2026-10-02T08:00:00.000Z';
  
  function getDefBookings() { return [{ id: 'b1', house_id: 'valles', check_in: '2026-10-02' }]; }
  function getDefSettings() { return [
    { id: 's1', house_id: 'valles', alarm_type: 'fridge', is_enabled: true, days_before: 0, alarm_time: '10:00' },
    { id: 's2', house_id: 'valles', alarm_type: 'heating', is_enabled: true, days_before: 0, alarm_time: '10:00' },
    { id: 's3', house_id: 'valles', alarm_type: 'hot_water', is_enabled: true, days_before: 0, alarm_time: '10:00' }
  ];}
  
  let state = { logs: [], bookings: getDefBookings(), settings: getDefSettings() };
  let evalPhase = 1;
  let sb = createMockSupabase(() => state, () => {});
  let res = await processNextAlarmGroup({ supabase: sb, now: n });
  assert.strictEqual(res.result, 'nothing_due');

  state.logs = [
    { id: '1', booking_id: 'b1', house_id: 'valles', alarm_type: 'fridge', scheduled_for: pastD, status: 'pending', retry_count: 0 },
    { id: '2', booking_id: 'b1', house_id: 'valles', alarm_type: 'heating', scheduled_for: pastD, status: 'pending', retry_count: 0 },
    { id: '3', booking_id: 'b1', house_id: 'valles', alarm_type: 'hot_water', scheduled_for: pastD, status: 'pending', retry_count: 0 },
    { id: '4', booking_id: 'b2', house_id: 'gredos', alarm_type: 'fridge', scheduled_for: '2026-10-02T09:00:00.000Z', status: 'pending', retry_count: 0 }
  ];
  state.bookings.push({ id: 'b2', house_id: 'gredos', check_in: '2026-10-02' });
  state.settings.push({ id: 's4', house_id: 'gredos', alarm_type: 'fridge', is_enabled: true, days_before: 0, alarm_time: '11:00' });
  
  let rpcCalls = [];
  sb = createMockSupabase(() => state, (fn, p) => rpcCalls.push({fn, p}));
  let tgCalled = 0; let sentMsg = "";
  res = await processNextAlarmGroup({ supabase: sb, now: n, telegramTransport: async (msg) => { tgCalled++; sentMsg=msg; return {status:'success'} } });
  
  assert.strictEqual(res.result, 'sent');
  assert.strictEqual(tgCalled, 1);
  assert.strictEqual(res.processed_count, 3);
  assert.ok(sentMsg.includes('frigor'));
  assert.ok(sentMsg.includes('calefac'));
  assert.ok(!sentMsg.includes('undefined'));
  assert.deepStrictEqual(rpcCalls[0].p.p_ids.sort(), ['1','2','3'].sort());
  assert.deepStrictEqual(rpcCalls[1].p.p_ids.sort(), ['1','2','3'].sort());

  rpcCalls = [];
  sb = createMockSupabase(() => state, (fn, p) => rpcCalls.push({fn, p}), { claim_alarm_group: () => ({error: new Error("DB lock")}) });
  tgCalled = 0;
  res = await processNextAlarmGroup({ supabase: sb, now: n, telegramTransport: async () => { tgCalled++; return {status:'success'} } });
  assert.strictEqual(res.result, 'skipped');
  assert.strictEqual(tgCalled, 0);

  rpcCalls = [];
  sb = createMockSupabase(() => state, (fn, p) => rpcCalls.push({fn, p}), { claim_alarm_group: () => ({data: [{updated_count: 2}]}) });
  tgCalled = 0;
  res = await processNextAlarmGroup({ supabase: sb, now: n, telegramTransport: async () => { tgCalled++; return {status:'success'} } });
  assert.strictEqual(res.result, 'skipped');
  assert.strictEqual(tgCalled, 0);

  rpcCalls = [];
  sb = createMockSupabase(() => state, (fn, p) => rpcCalls.push({fn, p}));
  res = await processNextAlarmGroup({ supabase: sb, now: n, telegramTransport: async () => ({status:'failure', errorReason:'HTTP 400'}) });
  assert.strictEqual(res.result, 'failed_and_recorded');
  assert.strictEqual(rpcCalls[1].fn, 'complete_alarm_group_failure');

  sb = createMockSupabase(() => state, () => {}, { complete_alarm_group_success: () => ({error: new Error()}) });
  res = await processNextAlarmGroup({ supabase: sb, now: n, telegramTransport: async () => ({status:'success'}) });
  assert.strictEqual(res.result, 'manual_review');
  assert.strictEqual(res.reason, 'uncertain_db_finalize');

  sb = createMockSupabase(() => state, () => {}, { complete_alarm_group_success: () => ({data: [{updated_count: 2}]}) });
  res = await processNextAlarmGroup({ supabase: sb, now: n, telegramTransport: async () => ({status:'success'}) });
  assert.strictEqual(res.result, 'manual_review');
  assert.strictEqual(res.reason, 'uncertain_db_finalize');

  sb = createMockSupabase(() => state, () => {}, { complete_alarm_group_failure: () => ({error: new Error()}) });
  res = await processNextAlarmGroup({ supabase: sb, now: n, telegramTransport: async () => ({status:'failure', errorReason: 'Err'}) });
  assert.strictEqual(res.result, 'manual_review');
  assert.strictEqual(res.reason, 'uncertain_db_finalize');

  sb = createMockSupabase(() => state, () => {}, { complete_alarm_group_failure: () => ({data: [{updated_count: 2}]}) });
  res = await processNextAlarmGroup({ supabase: sb, now: n, telegramTransport: async () => ({status:'failure', errorReason: 'Err'}) });
  assert.strictEqual(res.result, 'manual_review');
  assert.strictEqual(res.reason, 'uncertain_db_finalize');

  rpcCalls = [];
  sb = createMockSupabase(() => state, (fn, p) => rpcCalls.push({fn, p}));
  res = await processNextAlarmGroup({ supabase: sb, now: n, telegramTransport: async () => ({status:'uncertain'}) });
  assert.strictEqual(res.result, 'manual_review');
  assert.strictEqual(res.reason, 'uncertain_telegram_delivery');
  assert.strictEqual(rpcCalls.length, 1);
  assert.strictEqual(rpcCalls[0].fn, 'claim_alarm_group');

  rpcCalls = [];
  res = await processNextAlarmGroup({ supabase: sb, now: n, telegramTransport: async () => { throw new Error("Throw"); } });
  assert.strictEqual(res.result, 'manual_review');
  assert.strictEqual(res.reason, 'uncertain_telegram_delivery');
  assert.strictEqual(rpcCalls.length, 1);

  rpcCalls = [];
  await processNextAlarmGroup({ supabase: sb, now: n, telegramTransport: async () => ({status:'success'}) });
  let u1 = rpcCalls[0].p.p_claim_token;
  await processNextAlarmGroup({ supabase: sb, now: n, telegramTransport: async () => ({status:'success'}) });
  let u2 = rpcCalls[2].p.p_claim_token;
  assert.notStrictEqual(u1, u2);

  // REVALIDATION TESTS
  evalPhase = 1;
  let getDynamicState = (table) => {
    if (table === 'alarm_log') evalPhase++;
    if (evalPhase <= 2) return { logs: state.logs, bookings: state.bookings, settings: state.settings };
    return { logs: state.logs, bookings: [], settings: state.settings };
  };
  rpcCalls = [];
  sb = createMockSupabase(getDynamicState, (fn, p) => rpcCalls.push({fn, p}));
  res = await processNextAlarmGroup({ supabase: sb, now: n, telegramTransport: async () => ({status:'success'}) });
  assert.strictEqual(res.result, 'skipped');
  assert.strictEqual(res.reason, 'revalidation_changed');
  assert.strictEqual(rpcCalls.length, 0);

  evalPhase = 1;
  getDynamicState = (table) => {
    if (table === 'alarm_log') evalPhase++;
    if (evalPhase <= 2) return { logs: state.logs, bookings: state.bookings, settings: state.settings };
    const disabledSettings = getDefSettings().map(s => ({...s, is_enabled: false}));
    return { logs: state.logs, bookings: state.bookings, settings: disabledSettings };
  };
  rpcCalls = []; sb = createMockSupabase(getDynamicState, (fn, p) => rpcCalls.push({fn, p}));
  res = await processNextAlarmGroup({ supabase: sb, now: n, telegramTransport: async () => ({status:'success'}) });
  assert.strictEqual(res.result, 'skipped');

  evalPhase = 1;
  getDynamicState = (table) => {
    if (table === 'alarm_log') evalPhase++;
    if (evalPhase <= 2) return { logs: state.logs, bookings: state.bookings, settings: state.settings };
    const modLogs = state.logs.map(l => ({...l, scheduled_for: '2026-10-02T10:00:00.000Z'}));
    return { logs: modLogs, bookings: state.bookings, settings: state.settings };
  };
  rpcCalls = []; sb = createMockSupabase(getDynamicState, (fn, p) => rpcCalls.push({fn, p}));
  res = await processNextAlarmGroup({ supabase: sb, now: n, telegramTransport: async () => ({status:'success'}) });
  assert.strictEqual(res.result, 'skipped');

  evalPhase = 1;
  getDynamicState = (table) => {
    if (table === 'alarm_log') evalPhase++;
    if (evalPhase <= 2) return { logs: state.logs, bookings: state.bookings, settings: state.settings };
    return { logs: [state.logs[0]], bookings: state.bookings, settings: state.settings };
  };
  rpcCalls = []; sb = createMockSupabase(getDynamicState, (fn, p) => rpcCalls.push({fn, p}));
  res = await processNextAlarmGroup({ supabase: sb, now: n, telegramTransport: async () => ({status:'success'}) });
  assert.strictEqual(res.result, 'skipped');

  state.logs = [{ id: '1', booking_id: 'b1', house_id: 'valles', alarm_type: 'fridge', scheduled_for: pastD, status: 'failed', retry_count: 1, last_attempt_at: '2026-10-02T11:50:00Z' }];
  sb = createMockSupabase(() => state, () => {});
  res = await processNextAlarmGroup({ supabase: sb, now: n });
  assert.strictEqual(res.result, 'nothing_due');

  state.logs = [{ id: '1', booking_id: 'b1', house_id: 'valles', alarm_type: 'fridge', scheduled_for: pastD, status: 'failed', retry_count: 3, last_attempt_at: '2026-10-01T12:00:00Z' }];
  res = await processNextAlarmGroup({ supabase: sb, now: n });
  assert.strictEqual(res.result, 'nothing_due');

  state.logs = [{ id: '1', booking_id: 'b1', house_id: 'valles', alarm_type: 'fridge', scheduled_for: '2026-10-01T08:00:00.000Z', status: 'pending', retry_count: 0 }];
  res = await processNextAlarmGroup({ supabase: sb, now: n });
  assert.strictEqual(res.result, 'nothing_due');

  state.logs = [{ id: '1', booking_id: 'b1', house_id: 'valles', alarm_type: 'fridge', scheduled_for: pastD, status: 'processing', retry_count: 0 }];
  res = await processNextAlarmGroup({ supabase: sb, now: n });
  assert.strictEqual(res.result, 'nothing_due');

  state.logs = [{ id: '1', booking_id: 'b1', house_id: 'valles', alarm_type: 'fridge', scheduled_for: pastD, status: 'obsolete', retry_count: 0 }];
  res = await processNextAlarmGroup({ supabase: sb, now: n });
  assert.strictEqual(res.result, 'nothing_due');

  state.logs = [{ id: '1', booking_id: 'bX', house_id: 'valles', alarm_type: 'fridge', scheduled_for: pastD, status: 'pending', retry_count: 0 }]; 
  res = await processNextAlarmGroup({ supabase: sb, now: n });
  assert.strictEqual(res.result, 'nothing_due');

  const req = { method: 'POST', headers: {} };
  const _res = { 
    s: 0, d: null, 
    status: function(code) { this.s = code; return this; }, 
    json: function(data) { this.d = data; return this; }
  };
  await handler(req, _res);
  assert.strictEqual(_res.s, 401);
  assert.strictEqual(_res.d.ok, false);

  console.log("All Sender Tests Passed!");
}

async function run() {
  try {
    await runTransportTests();
    await runSenderTests();
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

run();



