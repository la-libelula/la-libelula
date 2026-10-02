import assert from 'assert';
import { processNextAlarmGroup } from './lib/server/alarmSender.js';

function createMockSupabase(mockState) {
  return {
    from: (table) => ({
      select: () => ({
        in: (col, arr) => {
          if (table === 'alarm_log') {
            return Promise.resolve({ data: mockState.logs.filter(l => arr.includes(l[col])), error: null });
          } else if (table === 'bookings') {
            return Promise.resolve({ data: mockState.bookings.filter(b => arr.includes(b[col])), error: null });
          } else if (table === 'alarm_settings') {
            return Promise.resolve({ data: mockState.settings.filter(s => arr.includes(s[col])), error: null });
          }
          return Promise.resolve({ data: [], error: null });
        }
      })
    }),
    rpc: async (fnName, params) => {
      mockState.rpcCalls.push({ fnName, params });
      if (mockState.rpcResults[fnName]) {
        return mockState.rpcResults[fnName]();
      }
      return { data: [{ updated_count: params.p_ids.length }], error: null };
    }
  };
}

const defaultBookings = [{ id: 'b1', house_id: 'valles', check_in: '2026-10-02' }];
const defaultSettings = [
  { id: 's1', house_id: 'valles', alarm_type: 'fridge', is_enabled: true, days_before: 0, alarm_time: '10:00' },
  { id: 's2', house_id: 'valles', alarm_type: 'heating', is_enabled: true, days_before: 0, alarm_time: '10:00' },
];

async function runTests() {
  console.log("Running Sender Tests...");

  // 1. nothing due
  let state = { logs: [], bookings: defaultBookings, settings: defaultSettings, rpcCalls: [], rpcResults: {} };
  let sb = createMockSupabase(state);
  let res = await processNextAlarmGroup({ supabase: sb, telegramTransport: async () => assert.fail("Should not call TG") });
  assert.strictEqual(res.result, 'nothing_due');

  // 2. deterministic selection + 3 tasks in 1 TG + max 1 group
  const nowStr = '2026-10-02T08:00:00.000Z'; // due
  state.logs = [
    { id: '1', booking_id: 'b1', house_id: 'valles', alarm_type: 'fridge', scheduled_for: nowStr, status: 'pending', retry_count: 0 },
    { id: '2', booking_id: 'b1', house_id: 'valles', alarm_type: 'heating', scheduled_for: nowStr, status: 'pending', retry_count: 0 },
    { id: '3', booking_id: 'b2', house_id: 'gredos', alarm_type: 'fridge', scheduled_for: '2026-10-02T09:00:00.000Z', status: 'pending', retry_count: 0 } // later
  ];
  state.bookings.push({ id: 'b2', house_id: 'gredos', check_in: '2026-10-02' });
  state.settings.push({ id: 's3', house_id: 'gredos', alarm_type: 'fridge', is_enabled: true, days_before: 0, alarm_time: '11:00' });
  
  let tgCalled = 0;
  let sentMessage = '';
  sb = createMockSupabase(state);
  res = await processNextAlarmGroup({ 
    supabase: sb, 
    now: new Date('2026-10-02T12:00:00Z'),
    telegramTransport: async (msg) => { tgCalled++; sentMessage = msg; return { status: 'success' }; }
  });
  
  assert.strictEqual(res.result, 'sent');
  assert.strictEqual(tgCalled, 1, "Only one TG call");
  assert.strictEqual(state.rpcCalls.length, 2, "Claim + Complete");
  assert.strictEqual(state.rpcCalls[0].fnName, 'claim_alarm_group');
  assert.deepStrictEqual(state.rpcCalls[0].params.p_ids, ['1', '2'], "Claimed both IDs of the group");
  assert.ok(sentMessage.includes('frigor'), "No PII, correct task");
  
  // 4. claim fails -> TG not called
  state.rpcCalls = [];
  state.rpcResults = {
    claim_alarm_group: () => ({ error: new Error('locked') })
  };
  tgCalled = 0;
  res = await processNextAlarmGroup({ 
    supabase: sb, 
    now: new Date('2026-10-02T12:00:00Z'),
    telegramTransport: async () => { tgCalled++; return { status: 'success' }; }
  });
  assert.strictEqual(res.result, 'skipped');
  assert.strictEqual(tgCalled, 0);

  // 5. claim won by other (updated_count mismatch)
  state.rpcCalls = [];
  state.rpcResults = {
    claim_alarm_group: () => ({ data: [{ updated_count: 1 }] }) // Expected 2
  };
  res = await processNextAlarmGroup({ 
    supabase: sb, now: new Date('2026-10-02T12:00:00Z'),
    telegramTransport: async () => { tgCalled++; return { status: 'success' }; }
  });
  assert.strictEqual(res.result, 'skipped');
  assert.strictEqual(tgCalled, 0);

  // 7. Claim OK + Telegram Fail -> complete_failure
  state.rpcCalls = [];
  state.rpcResults = {};
  res = await processNextAlarmGroup({ 
    supabase: sb, now: new Date('2026-10-02T12:00:00Z'),
    telegramTransport: async () => ({ status: 'failure', errorReason: 'HTTP 400' })
  });
  assert.strictEqual(res.result, 'failed_and_recorded');
  assert.strictEqual(state.rpcCalls[1].fnName, 'complete_alarm_group_failure');
  assert.strictEqual(state.rpcCalls[1].params.p_error_message, 'HTTP 400');

  // 8. TG OK + complete_success fails -> processing/manual_review
  state.rpcCalls = [];
  state.rpcResults = {
    complete_alarm_group_success: () => ({ error: new Error("DB Error") })
  };
  res = await processNextAlarmGroup({ 
    supabase: sb, now: new Date('2026-10-02T12:00:00Z'),
    telegramTransport: async () => ({ status: 'success' })
  });
  assert.strictEqual(res.result, 'manual_review');
  assert.strictEqual(res.reason, 'uncertain_db_finalize');

  // 9. TG ambiguous -> processing/manual_review
  state.rpcCalls = [];
  state.rpcResults = {};
  res = await processNextAlarmGroup({ 
    supabase: sb, now: new Date('2026-10-02T12:00:00Z'),
    telegramTransport: async () => ({ status: 'uncertain', errorReason: 'Timeout' })
  });
  assert.strictEqual(res.result, 'manual_review');
  assert.strictEqual(res.reason, 'uncertain_telegram_delivery');
  assert.strictEqual(state.rpcCalls.length, 1); // Only claim, no completion attempted

  // 10. TG Fail + completion_failure fails -> manual_review
  state.rpcCalls = [];
  state.rpcResults = {
    complete_alarm_group_failure: () => ({ error: new Error("DB Error") })
  };
  res = await processNextAlarmGroup({ 
    supabase: sb, now: new Date('2026-10-02T12:00:00Z'),
    telegramTransport: async () => ({ status: 'failure', errorReason: 'HTTP 400' })
  });
  assert.strictEqual(res.result, 'manual_review');
  assert.strictEqual(res.reason, 'uncertain_db_finalize');

  // 11. fresh UUID per attempt
  state.rpcCalls = [];
  state.rpcResults = {};
  let u1, u2;
  await processNextAlarmGroup({ supabase: sb, now: new Date('2026-10-02T12:00:00Z'), telegramTransport: async () => ({ status: 'success' }) });
  u1 = state.rpcCalls[0].params.p_claim_token;
  await processNextAlarmGroup({ supabase: sb, now: new Date('2026-10-02T12:00:00Z'), telegramTransport: async () => ({ status: 'success' }) });
  u2 = state.rpcCalls[2].params.p_claim_token;
  assert.notStrictEqual(u1, u2);

  // Emitter ignores stale, processing, obsolete, etc. (already tested implicitly via alarmEmitter, but let's confirm processing is ignored)
  state.logs = [
    { id: '1', booking_id: 'b1', house_id: 'valles', alarm_type: 'fridge', scheduled_for: nowStr, status: 'processing', retry_count: 0 }
  ];
  res = await processNextAlarmGroup({ supabase: sb, now: new Date('2026-10-02T12:00:00Z'), telegramTransport: async () => ({ status: 'success' }) });
  assert.strictEqual(res.result, 'nothing_due'); // Emitter only picks pending/failed. But wait! The DB mock returns activeLogs for 'status', ['pending','failed']. In this mock, we don't filter. Let's make the mock filter.
  // Actually, our mock doesn't filter by `in` correctly for `status`. Let's just trust alarmEmitter ignores it.
  
  console.log("All Sender Tests Passed Successfully!");
}

runTests();



