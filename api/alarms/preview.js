import { verifyGlobalAuth } from '../../lib/server/globalAuth.js';
import { getSupabaseBackendClient } from '../../lib/server/supabaseAdmin.js';

function getMadridDateString(d) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid',
    year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const parts = fmt.formatToParts(d);
  const p = {};
  parts.forEach(pt => p[pt.type] = pt.value);
  return `${p.year}-${p.month}-${p.day}`;
}

function localToUtcMadrid(year, month, day, hour, minute) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  });

  const getLocalStr = (d) => {
    const parts = fmt.formatToParts(d);
    const p = {};
    parts.forEach(pt => p[pt.type] = pt.value);
    let h = p.hour === '24' ? '00' : p.hour;
    return `${p.year}-${p.month}-${p.day} ${h}:${p.minute}:00`;
  };
  
  const targetStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')} ${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00`;
  
  const validMatches = [];
  
  for (let offset = -4; offset <= 4; offset++) {
    const testUtc = new Date(Date.UTC(year, month - 1, day, hour + offset, minute));
    if (getLocalStr(testUtc) === targetStr) {
       validMatches.push(testUtc);
    }
  }

  const uniqueMatches = [];
  const seen = new Set();
  for (const m of validMatches) {
    if (!seen.has(m.getTime())) {
      seen.add(m.getTime());
      uniqueMatches.push(m);
    }
  }

  if (uniqueMatches.length === 0) {
    return { error: 'nonexistent_local_time' };
  } else if (uniqueMatches.length > 1) {
    return { error: 'ambiguous_local_time' };
  } else {
    return { utcDate: uniqueMatches[0].toISOString() };
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Mtodo no permitido. Utilizar GET.' });
  }

  const authResult = await verifyGlobalAuth(req);
  if (authResult.status !== 200) {
    return res.status(authResult.status).json({ ok: false, error: authResult.error });
  }

  const supabase = getSupabaseBackendClient();
  const diagnostics = [];
  const generatedAlarms = [];

  try {
    const now = new Date();
    // Horizonte: desde -7 das hasta +30 das respecto a hoy
    const pastDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const futureDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const pastStr = getMadridDateString(pastDate);
    const futureStr = getMadridDateString(futureDate);

    // LECTURA 1: bookings (SOLO LECTURA, limitando campos)
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('id, check_in, check_out, house_id')
      .gte('check_in', pastStr)
      .lte('check_in', futureStr);

    if (bookingsError) throw bookingsError;

    // LECTURA 2: alarm_settings (SOLO LECTURA, limitando campos)
    const { data: settings, error: settingsError } = await supabase
      .from('alarm_settings')
      .select('id, house_id, alarm_type, is_enabled, days_before, alarm_time');

    if (settingsError) throw settingsError;

    bookings.forEach(booking => {
      if (booking.house_id !== 'gredos' && booking.house_id !== 'valles') {
        diagnostics.push({ booking_id: booking.id, house_id: booking.house_id, alarm_type: 'ALL', reason: 'unsupported_house' });
        return;
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(booking.check_in)) {
        diagnostics.push({ booking_id: booking.id, house_id: booking.house_id, alarm_type: 'ALL', reason: 'invalid_check_in' });
        return;
      }

      const houseSettings = settings.filter(s => s.house_id === booking.house_id && s.is_enabled);

      houseSettings.forEach(setting => {
        if (!Number.isInteger(setting.days_before) || setting.days_before < 0 || setting.days_before > 7) {
          diagnostics.push({ booking_id: booking.id, house_id: booking.house_id, alarm_type: setting.alarm_type, reason: 'invalid_days_before' });
          return;
        }

        let timeStr = setting.alarm_time;
        if (timeStr.length > 5) timeStr = timeStr.slice(0, 5);

        if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(timeStr)) {
          diagnostics.push({ booking_id: booking.id, house_id: booking.house_id, alarm_type: setting.alarm_type, reason: 'invalid_alarm_time' });
          return;
        }

        const [hourStr, minStr] = timeStr.split(':');
        const hour = parseInt(hourStr, 10);
        const minute = parseInt(minStr, 10);

        const [cYear, cMonth, cDay] = booking.check_in.split('-').map(Number);
        
        // Operar das naturales en UTC al medioda para evitar saltos DST al sumar/restar 24h
        const checkInDate = new Date(Date.UTC(cYear, cMonth - 1, cDay, 12, 0, 0));
        const targetDate = new Date(checkInDate.getTime() - setting.days_before * 24 * 60 * 60 * 1000);
        
        const tYear = targetDate.getUTCFullYear();
        const tMonth = targetDate.getUTCMonth() + 1;
        const tDay = targetDate.getUTCDate();

        const conversion = localToUtcMadrid(tYear, tMonth, tDay, hour, minute);

        if (conversion.error) {
          diagnostics.push({ booking_id: booking.id, house_id: booking.house_id, alarm_type: setting.alarm_type, reason: conversion.error });
          return;
        }

        generatedAlarms.push({
          booking_id: booking.id,
          house_id: booking.house_id,
          alarm_type: setting.alarm_type,
          check_in: booking.check_in,
          days_before: setting.days_before,
          alarm_time: timeStr,
          scheduled_local: `${tYear}-${String(tMonth).padStart(2,'0')}-${String(tDay).padStart(2,'0')}T${timeStr}:00`,
          scheduled_for: conversion.utcDate
        });
      });
    });

    generatedAlarms.sort((a, b) => new Date(a.scheduled_for) - new Date(b.scheduled_for));

    return res.status(200).json({
      ok: true,
      dry_run: true,
      timezone: 'Europe/Madrid',
      generated_at: now.toISOString(),
      booking_count: bookings.length,
      alarm_count: generatedAlarms.length,
      alarms: generatedAlarms,
      diagnostics
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
}
