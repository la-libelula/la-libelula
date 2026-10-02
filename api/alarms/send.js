import { verifyGlobalAuth } from '../../lib/server/globalAuth.js';
import { getSupabaseBackendClient } from '../../lib/server/supabaseAdmin.js';
import { processNextAlarmGroup } from '../../lib/server/alarmSender.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Mtodo no permitido. Utilizar POST.' });
  }

  const authResult = await verifyGlobalAuth(req);
  if (authResult.status !== 200) {
    return res.status(authResult.status).json({ ok: false, error: authResult.error });
  }

  const supabase = getSupabaseBackendClient();

  try {
    const result = await processNextAlarmGroup({ supabase });
    return res.status(200).json(result);
  } catch (err) {
    console.error('[alarmSender] Unexpected error:', err);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
}
