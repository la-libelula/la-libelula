import { verifyGlobalAuth } from '../../lib/server/globalAuth.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Utilizar POST.' });
  }

  const authResult = await verifyGlobalAuth(req);
  if (authResult.status !== 200) {
    return res.status(authResult.status).json({ ok: false, error: authResult.error });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    console.error('[telegram-test] Token o Chat ID no configurado en servidor');
    return res.status(500).json({ ok: false, error: 'Telegram no configurado' });
  }

  const text = `🔔 Prueba de La Libélula

La conexión con Telegram funciona correctamente.

Este es un mensaje de prueba.
No corresponde a ninguna reserva.`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: text
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`[telegram-test] Telegram returned HTTP ${response.status}`);
      return res.status(502).json({ ok: false, error: 'No se pudo enviar el mensaje de prueba' });
    }

    const payload = await response.json();
    if (payload.ok !== true) {
      console.error(`[telegram-test] Telegram payload.ok is false`);
      return res.status(502).json({ ok: false, error: 'No se pudo enviar el mensaje de prueba' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.error('[telegram-test] Request timed out');
      return res.status(502).json({ ok: false, error: 'Tiempo de espera agotado al contactar con Telegram' });
    }
    console.error('[telegram-test] Unexpected error:', err.message);
    return res.status(500).json({ ok: false, error: 'Error interno al enviar el aviso' });
  }
}
