import crypto from 'crypto';
import { evaluateAlarmEmission } from './alarmEmitter.js';
import { sanitizeErrorMessage } from './errorSanitizer.js';

export async function defaultTelegramTransport(message, abortSignal, fetchImpl = fetch) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) {
    return { status: 'uncertain', errorReason: 'Missing Telegram configuration on server' };
  }

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML'
      }),
      signal: abortSignal
    });

    if (res.ok) {
      let data = null;
      try {
        data = await res.json();
      } catch (e) {
        return { status: 'uncertain', errorReason: 'Invalid JSON response from Telegram' };
      }
      
      if (data && data.ok === true) {
        return { status: 'success' };
      } else if (data && data.ok === false) {
        return { status: 'failure', errorReason: 'Telegram returned ok: false' };
      }
      
      return { status: 'uncertain', errorReason: 'Unexpected JSON structure' };
    } else {
      return { status: 'failure', errorReason: `HTTP ${res.status}` };
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      return { status: 'uncertain', errorReason: 'Telegram request timed out' };
    }
    return { status: 'uncertain', errorReason: `Network/Fetch error: ${err.message}` };
  }
}

export function selectNextAlarmGroup(groupsToSend) {
  if (!groupsToSend || groupsToSend.length === 0) return null;
  const sorted = [...groupsToSend];
  sorted.sort((a, b) => {
    if (a.expectedEpoch !== b.expectedEpoch) return a.expectedEpoch - b.expectedEpoch;
    if (a.house_id !== b.house_id) return a.house_id.localeCompare(b.house_id);
    return a.booking_id.localeCompare(b.booking_id);
  });
  return sorted[0];
}

export async function processNextAlarmGroup({
  supabase,
  now = new Date(),
  uuidGenerator = () => crypto.randomUUID(),
  telegramTransport = defaultTelegramTransport,
  timeoutMs = 10000
}) {
  async function loadAndEvaluate() {
    const { data: activeLogs, error: logsError } = await supabase
      .from('alarm_log')
      .select('id, booking_id, house_id, alarm_type, scheduled_for, status, retry_count, last_attempt_at')
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

    return evaluateAlarmEmission({ now, activeLogs, bookings, settings });
  }

  const result1 = await loadAndEvaluate();
  
  if (result1.summary.diagnostic_error) {
    return { ok: false, result: 'internal_error', error: 'Internal evaluation error' };
  }

  const { groupsToSend } = result1;

  if (groupsToSend.length === 0) {
    return { ok: true, result: 'nothing_due' };
  }

const selectedGroup = selectNextAlarmGroup(groupsToSend);

  const result2 = await loadAndEvaluate();
  const revalidatedGroup = result2.groupsToSend.find(g => 
    g.booking_id === selectedGroup.booking_id && 
    g.house_id === selectedGroup.house_id &&
    g.expectedEpoch === selectedGroup.expectedEpoch
  );

  if (!revalidatedGroup) {
    return { ok: true, result: 'skipped', reason: 'revalidation_changed' };
  }
  
  const ids1 = [...selectedGroup.ids].sort();
  const ids2 = [...revalidatedGroup.ids].sort();
  if (ids1.length !== ids2.length || ids1.some((id, i) => id !== ids2[i])) {
    return { ok: true, result: 'skipped', reason: 'revalidation_changed' };
  }

  const tasks1 = [...selectedGroup.tasks].sort();
  const tasks2 = [...revalidatedGroup.tasks].sort();
  if (tasks1.length !== tasks2.length || tasks1.some((t, i) => t !== tasks2[i])) {
    return { ok: true, result: 'skipped', reason: 'revalidation_changed' };
  }

  const claimToken = uuidGenerator();
  const groupIds = revalidatedGroup.ids;
  

  const { data: claimData, error: claimErr } = await supabase.rpc('claim_alarm_group', {
    p_ids: groupIds,
    p_claim_token: claimToken
  });

  if (claimErr || !claimData || claimData[0]?.updated_count !== groupIds.length) {
    return { ok: true, result: 'skipped', reason: 'claim_failed' };
  }

  let tgResult;
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

  try {
    tgResult = await telegramTransport(revalidatedGroup.message, abortController.signal);
  } catch (err) {
    tgResult = { status: 'uncertain', errorReason: 'Transport threw exception' };
  } finally {
    clearTimeout(timeoutId);
  }

  const sanitizedTgReason = tgResult.errorReason ? sanitizeErrorMessage(tgResult.errorReason) : null;

  if (tgResult.status === 'success') {
    const { data: succData, error: succErr } = await supabase.rpc('complete_alarm_group_success', {
      p_ids: groupIds,
      p_claim_token: claimToken
    });
    
    if (succErr || !succData || succData[0]?.updated_count !== groupIds.length) {
      return { ok: false, result: 'manual_review', reason: 'uncertain_db_finalize' };
    }
    
    return {
      ok: true,
      result: 'sent',
      house_id: revalidatedGroup.house_id,
      scheduled_for: revalidatedGroup.scheduled_for,
      alarm_types: revalidatedGroup.tasks,
      processed_count: groupIds.length,
      remaining_due_groups: result2.groupsToSend.length - 1
    };
  } else if (tgResult.status === 'failure') {
    const { data: failData, error: failErr } = await supabase.rpc('complete_alarm_group_failure', {
      p_ids: groupIds,
      p_claim_token: claimToken,
      p_error_message: sanitizedTgReason || 'telegram_confirmed_failure'
    });
    
    if (failErr || !failData || failData[0]?.updated_count !== groupIds.length) {
      return { ok: false, result: 'manual_review', reason: 'uncertain_db_finalize' };
    }
    
    return { ok: true, result: 'failed_and_recorded', reason: 'telegram_confirmed_failure' };
  } else {
    return { ok: false, result: 'manual_review', reason: 'uncertain_telegram_delivery' };
  }
}



