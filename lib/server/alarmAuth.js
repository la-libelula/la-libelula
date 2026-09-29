import { getSupabaseBackendClient } from './supabaseAdmin.js';

export async function verifyAlarmAdmin(req) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { status: 401, error: 'Unauthorized' };
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return { status: 401, error: 'Unauthorized' };
    }

    const supabase = getSupabaseBackendClient();
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      console.error('[alarms/auth] Invalid token');
      return { status: 401, error: 'Unauthorized' };
    }

    const adminIdsString = process.env.ALARM_ADMIN_USER_IDS || '';
    const authorizedIds = adminIdsString
      .split(',')
      .map(id => id.trim())
      .filter(Boolean);

    if (!authorizedIds.includes(user.id)) {
      console.error('[alarms/auth] User not authorized for administration');
      return { status: 403, error: 'Forbidden' };
    }

    return { status: 200, user };
  } catch (err) {
    console.error('[alarms/auth] Unexpected auth error');
    return { status: 500, error: 'Internal Server Error' };
  }
}
