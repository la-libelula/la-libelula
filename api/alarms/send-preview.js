import { verifyGlobalAuth } from '../../lib/server/globalAuth.js';
import { getSupabaseBackendClient } from '../../lib/server/supabaseAdmin.js';
import { evaluateAlarmEmission } from '../../lib/server/alarmEmitter.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido. Utilizar GET.' });
  }

  const authResult = await verifyGlobalAuth(req);
  if (authResult.status !== 200) {
    return res.status(authResult.status).json({ ok: false, error: authResult.error });
  }

  try {
    const supabase = getSupabaseBackendClient();
    
    // Leer todos los logs activos sin limite (solo pending y failed)
    const { data: activeLogs, error: logsError } = await supabase
      .from('alarm_log')
      .select('id, booking_id, house_id, alarm_type, scheduled_for, status, retry_count, last_attempt_at')
      .in('status', ['pending', 'failed']);

    if (logsError) throw logsError;

    // Obtener los bookings y settings necesarios
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

    const result = evaluateAlarmEmission({
      now: new Date(),
      activeLogs,
      bookings,
      settings
    });

    if (result.summary.diagnostic_error) {
       console.error('[send-preview] Diagnostic error:', result.summary.diagnostic_error);
       return res.status(500).json({ ok: false, error: 'Internal consistency error' });
    }

    return res.status(200).json({
      ok: true,
      dry_run: true,
      summary: result.summary,
      classifications: result.safeClassifications,
      groups_to_send: result.groupsToSend
    });
  } catch (err) {
    console.error('[send-preview] Unexpected error:', err);
    return res.status(500).json({ ok: false, error: 'Error interno en la simulación del emisor' });
  }
}
