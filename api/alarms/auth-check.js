import { verifyAlarmAdmin } from '../../lib/server/alarmAuth.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Método no permitido. Utilizar GET.' });
  }

  const authResult = await verifyAlarmAdmin(req);

  if (authResult.status !== 200) {
    return res.status(authResult.status).json({ ok: false, error: authResult.error });
  }

  return res.status(200).json({ ok: true, authorized: true });
}
