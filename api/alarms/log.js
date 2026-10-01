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
      .from('alarm_log')
      .select('id, house_id, alarm_type, scheduled_for, status, retry_count, last_attempt_at, sent_at, error_message, created_at')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[alarms/log] Supabase query failed', { code: error?.code });
      return res.status(500).json({ ok: false, error: 'No se pudieron cargar los ultimos avisos' });
    }

    return res.status(200).json({ ok: true, logs: data });
  } catch (err) {
    console.error('[alarms/log] Unexpected server error');
    return res.status(500).json({ ok: false, error: 'No se pudieron cargar los ultimos avisos' });
  }
}

