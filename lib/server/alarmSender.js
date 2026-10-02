import crypto from 'crypto';
import { evaluateAlarmEmission } from './alarmEmitter.js';
import { sanitizeErrorMessage } from './errorSanitizer.js';

async function defaultTelegramTransport(message, abortSignal) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) {
    return { status: 'uncertain', errorReason: 'Missing Telegram configuration on server' };
  }

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  try {
    const res = await fetch(url, {
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
      const data = await res.json().catch(() => null);
      if (data && data.ok === true) {
        return { status: 'success' };
      }
      return { status: 'failure', errorReason: 'Telegram returned ok: false or invalid JSON' };
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

export async function processNextAlarmGroup({
  supabase,
  now = new Date(),
  uuidGenerator = () => crypto.randomUUID(),
  telegramTransport = defaultTelegramTransport,
  timeoutMs = 10000
}) {
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

  const result = evaluateAlarmEmission({ now, activeLogs, bookings, settings });
  
  if (result.summary.diagnostic_error) {
    return { ok: false, result: 'internal_error', error: result.summary.diagnostic_error };
  }

  const { groupsToSend } = result;

  if (groupsToSend.length === 0) {
    return { ok: true, result: 'nothing_due' };
  }

  groupsToSend.sort((a, b) => {
    if (a.expectedEpoch !== b.expectedEpoch) return a.expectedEpoch - b.expectedEpoch;
    if (a.house_id !== b.house_id) return a.house_id.localeCompare(b.house_id);
    return a.booking_id.localeCompare(b.booking_id);
  });

  const selectedGroup = groupsToSend[0];
  const claimToken = uuidGenerator();
  const groupIds = selectedGroup.ids;

  const { data: claimData, error: claimErr } = await supabase.rpc('claim_alarm_group', {
    p_ids: groupIds,
    p_claim_token: claimToken
  });

  if (claimErr || !claimData || claimData[0]?.updated_count !== groupIds.length) {
    return { ok: true, result: 'skipped', reason: 'claim_failed' };
  }

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

  const tgResult = await telegramTransport(selectedGroup.message, abortController.signal);
  clearTimeout(timeoutId);

  if (tgResult.status === 'success') {
    const { error: succErr } = await supabase.rpc('complete_alarm_group_success', {
      p_ids: groupIds,
      p_claim_token: claimToken
    });
    if (succErr) {
      console.error("complete_alarm_group_success failed:", succErr);
      return { ok: false, result: 'manual_review', reason: 'uncertain_db_finalize' };
    }
    return {
      ok: true,
      result: 'sent',
      house_id: selectedGroup.house_id,
      scheduled_for: selectedGroup.scheduled_for,
      alarm_types: selectedGroup.tasks,
      processed_count: groupIds.length,
      remaining_due_groups: groupsToSend.length - 1
    };
  } else if (tgResult.status === 'failure') {
    const safeError = sanitizeErrorMessage(tgResult.errorReason || 'Telegram failure');
    const { error: failErr } = await supabase.rpc('complete_alarm_group_failure', {
      p_ids: groupIds,
      p_claim_token: claimToken,
      p_error_message: safeError
    });
    if (failErr) {
      console.error("complete_alarm_group_failure failed:", failErr);
      return { ok: false, result: 'manual_review', reason: 'uncertain_db_finalize' };
    }
    return { ok: true, result: 'failed_and_recorded', reason: tgResult.errorReason };
  } else {
    return { ok: false, result: 'manual_review', reason: 'uncertain_telegram_delivery', details: tgResult.errorReason };
  }
}
