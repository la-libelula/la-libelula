import { verifyGlobalAuth } from '../../lib/server/globalAuth.js';
import { getSupabaseBackendClient } from '../../lib/server/supabaseAdmin.js';
import { getMadridDateString, calculateExpectedAlarm } from '../../lib/server/alarmSchedule.js';

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
    const pastDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const futureDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const pastStr = getMadridDateString(pastDate);
    const futureStr = getMadridDateString(futureDate);

    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('id, check_in, check_out, house_id')
      .gte('check_in', pastStr)
      .lte('check_in', futureStr);

    if (bookingsError) throw bookingsError;

    const { data: settings, error: settingsError } = await supabase
      .from('alarm_settings')
      .select('id, house_id, alarm_type, is_enabled, days_before, alarm_time');

    if (settingsError) throw settingsError;

    bookings.forEach(booking => {
      if (booking.house_id !== 'gredos' && booking.house_id !== 'valles') {
        diagnostics.push({ booking_id: booking.id, house_id: booking.house_id, alarm_type: 'ALL', reason: 'unsupported_house' });
        return;
      }

      const houseSettings = settings.filter(s => s.house_id === booking.house_id && s.is_enabled);

      houseSettings.forEach(setting => {
        const calc = calculateExpectedAlarm(booking.check_in, setting.days_before, setting.alarm_time);
        
        if (calc.error) {
          diagnostics.push({ booking_id: booking.id, house_id: booking.house_id, alarm_type: setting.alarm_type, reason: calc.error });
          return;
        }

        generatedAlarms.push({
          booking_id: booking.id,
          house_id: booking.house_id,
          alarm_type: setting.alarm_type,
          check_in: booking.check_in,
          days_before: setting.days_before,
          alarm_time: calc.alarm_time_trimmed,
          scheduled_local: calc.scheduled_local,
          scheduled_for: calc.scheduled_for
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
