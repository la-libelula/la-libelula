import { verifyGlobalAuth } from '../../lib/server/globalAuth.js';
import { getSupabaseBackendClient } from '../../lib/server/supabaseAdmin.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Methods', 'GET');
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

  try {
    const supabase = getSupabaseBackendClient();

    const { data, error } = await supabase
      .from('alarm_settings')
      .select('id, house_id, alarm_type, is_enabled, days_before, alarm_time, updated_at')
      .order('house_id', { ascending: true })
      .order('alarm_type', { ascending: true });

    if (error) {
      console.error('[alarms/settings] Supabase query failed', { code: error?.code });
      return res.status(500).json({ ok: false, error: 'No se pudieron cargar las configuraciones de alarmas' });
    }

    return res.status(200).json({ ok: true, settings: data });
  } catch (err) {
    console.error('[alarms/settings] Unexpected server error');
    return res.status(500).json({ ok: false, error: 'No se pudieron cargar las configuraciones de alarmas' });
  }
}

