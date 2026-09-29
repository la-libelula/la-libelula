import { getSupabaseBackendClient } from './supabaseAdmin.js';

export async function verifyGlobalAuth(req) {
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
      return { status: 401, error: 'Unauthorized' };
    }

    const allowedIdsString = process.env.APP_ALLOWED_USER_IDS || '';
    const allowedIds = allowedIdsString
      .split(',')
      .map(id => id.trim())
      .filter(Boolean);

    if (allowedIds.length === 0) {
      return { status: 403, error: 'Forbidden' };
    }

    if (!allowedIds.includes(user.id)) {
      return { status: 403, error: 'Forbidden' };
    }

    return { status: 200, user };
  } catch (err) {
    return { status: 500, error: 'Internal Server Error' };
  }
}
