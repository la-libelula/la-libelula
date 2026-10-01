import { verifyGlobalAuth } from '../../lib/server/globalAuth.js';
import { getSupabaseBackendClient } from '../../lib/server/supabaseAdmin.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Método no permitido. Utilizar GET o PATCH.' });
  }

  const authResult = await verifyGlobalAuth(req);
  if (authResult.status !== 200) {
    return res.status(authResult.status).json({ ok: false, error: authResult.error });
  }

  const supabase = getSupabaseBackendClient();

  if (req.method === 'GET') {
    try {
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

  if (req.method === 'PATCH') {
    try {
      const body = req.body;
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return res.status(400).json({ ok: false, error: 'Cuerpo de petición inválido' });
      }

      const allowedKeys = ['id', 'is_enabled', 'days_before', 'alarm_time'];
      const bodyKeys = Object.keys(body);
      
      if (bodyKeys.length !== allowedKeys.length) {
        return res.status(400).json({ ok: false, error: 'Número de campos inválido' });
      }
      for (const key of bodyKeys) {
        if (!allowedKeys.includes(key)) {
          return res.status(400).json({ ok: false, error: `Campo no permitido: ${key}` });
        }
      }

      const { id, is_enabled, days_before, alarm_time } = body;

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (typeof id !== 'string' || !uuidRegex.test(id)) {
        return res.status(400).json({ ok: false, error: 'Identificador UUID inválido' });
      }

      if (typeof is_enabled !== 'boolean') {
        return res.status(400).json({ ok: false, error: 'is_enabled debe ser boolean' });
      }

      if (!Number.isInteger(days_before) || days_before < 0 || days_before > 7) {
        return res.status(400).json({ ok: false, error: 'days_before debe ser entero entre 0 y 7' });
      }

      const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
      if (typeof alarm_time !== 'string' || !timeRegex.test(alarm_time)) {
        return res.status(400).json({ ok: false, error: 'alarm_time debe tener formato HH:MM' });
      }

      const formatted_time = `${alarm_time}:00`;

      const { data, error } = await supabase
        .from('alarm_settings')
        .update({
          is_enabled: is_enabled,
          days_before: days_before,
          alarm_time: formatted_time
        })
        .eq('id', id)
        .select('id, house_id, alarm_type, is_enabled, days_before, alarm_time, updated_at')
        .single();

      if (error) {
        console.error('[alarms/settings] Update failed', { code: error?.code });
        if (error.code === 'PGRST116') {
          return res.status(404).json({ ok: false, error: 'Configuración no encontrada' });
        }
        return res.status(500).json({ ok: false, error: 'Error interno actualizando configuración' });
      }

      if (!data) {
         return res.status(404).json({ ok: false, error: 'Configuración no encontrada' });
      }

      return res.status(200).json({ ok: true, setting: data });

    } catch (err) {
      console.error('[alarms/settings] Unexpected PATCH error');
      return res.status(500).json({ ok: false, error: 'Error procesando la actualización' });
    }
  }
}

