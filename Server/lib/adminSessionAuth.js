const crypto = require('crypto');

const AUTHORIZATION_HEADER = 'authorization';
const DEFAULT_ADMIN_SESSION_TTL_HOURS = 24 * 30;

function getAdminSessionTtlHours() {
  const parsed = Number.parseInt(process.env.ADMIN_SESSION_TTL_HOURS || '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_ADMIN_SESSION_TTL_HOURS;
  }

  return parsed;
}

function buildAdminSessionExpiryIso() {
  const ttlHours = getAdminSessionTtlHours();
  return new Date(Date.now() + (ttlHours * 60 * 60 * 1000)).toISOString();
}

function hashAdminSessionToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function generateAdminSessionToken() {
  return `fps_admin_${crypto.randomBytes(32).toString('hex')}`;
}

function readBearerToken(req) {
  if (!req || typeof req.get !== 'function') {
    return '';
  }

  const authorization = req.get(AUTHORIZATION_HEADER);
  if (typeof authorization !== 'string') {
    return '';
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

async function issueAdminSession({ supabase, user }) {
  if (!supabase) {
    throw new Error('Supabase client is required to issue an admin session.');
  }

  if (!user || user.user_type !== 'admin') {
    return null;
  }

  const adminSessionToken = generateAdminSessionToken();
  const tokenHash = hashAdminSessionToken(adminSessionToken);
  const expiresAt = buildAdminSessionExpiryIso();

  const { error } = await supabase
    .from('admin_sessions')
    .insert({
      token_hash: tokenHash,
      user_id: user.user_id,
      username: user.username,
      expires_at: expiresAt,
    });

  if (error) {
    throw new Error(`Failed to create admin session: ${error.message}`);
  }

  return {
    admin_session_token: adminSessionToken,
    admin_session_expires_at: expiresAt,
  };
}

async function revokeAdminSession({ supabase, token, reason = 'logout' }) {
  if (!supabase) {
    throw new Error('Supabase client is required to revoke an admin session.');
  }

  if (!token) {
    return;
  }

  const { error } = await supabase
    .from('admin_sessions')
    .update({
      revoked_at: new Date().toISOString(),
      revoked_reason: reason,
    })
    .eq('token_hash', hashAdminSessionToken(token))
    .is('revoked_at', null);

  if (error) {
    throw new Error(`Failed to revoke admin session: ${error.message}`);
  }
}

async function revokeAdminSessionsForUser({ supabase, userId, reason = 'user_role_changed' }) {
  if (!supabase || userId === null || userId === undefined) {
    return;
  }

  const { error } = await supabase
    .from('admin_sessions')
    .update({
      revoked_at: new Date().toISOString(),
      revoked_reason: reason,
    })
    .eq('user_id', userId)
    .is('revoked_at', null);

  if (error) {
    throw new Error(`Failed to revoke admin sessions for user ${userId}: ${error.message}`);
  }
}

function createRequireAdminSession(supabase) {
  if (!supabase) {
    throw new Error('Supabase client is required to create the admin session middleware.');
  }

  return async function requireAdminSession(req, res, next) {
    try {
      const token = readBearerToken(req);
      if (!token) {
        return res.status(401).json({ error: 'Admin session is required' });
      }

      const tokenHash = hashAdminSessionToken(token);
      const { data: session, error: sessionError } = await supabase
        .from('admin_sessions')
        .select('token_hash, user_id, username, created_at, expires_at, revoked_at, revoked_reason, last_used_at')
        .eq('token_hash', tokenHash)
        .maybeSingle();

      if (sessionError) {
        console.error('Error loading admin session:', sessionError);
        return res.status(500).json({ error: 'Failed to verify admin session' });
      }

      if (!session) {
        return res.status(401).json({ error: 'Admin session is invalid or has expired' });
      }

      if (session.revoked_at) {
        return res.status(401).json({ error: 'Admin session has been revoked' });
      }

      if (new Date(session.expires_at).getTime() <= Date.now()) {
        return res.status(401).json({ error: 'Admin session has expired. Please log in again.' });
      }

      const { data: user, error: userError } = await supabase
        .from('users')
        .select('user_id, username, user_type')
        .eq('user_id', session.user_id)
        .maybeSingle();

      if (userError) {
        console.error('Error loading admin user:', userError);
        return res.status(500).json({ error: 'Failed to verify admin user' });
      }

      if (!user || user.user_type !== 'admin') {
        return res.status(403).json({ error: 'User is no longer authorized for admin actions' });
      }

      req.adminUser = {
        user_id: user.user_id,
        username: user.username,
        user_type: user.user_type,
      };
      req.adminSession = {
        tokenHash: session.token_hash,
        expires_at: session.expires_at,
      };

      supabase
        .from('admin_sessions')
        .update({
          last_used_at: new Date().toISOString(),
          username: user.username,
        })
        .eq('token_hash', tokenHash)
        .then(({ error }) => {
          if (error) {
            console.warn('Failed to update admin session last_used_at:', error);
          }
        })
        .catch((error) => {
          console.warn('Failed to update admin session metadata:', error);
        });

      return next();
    } catch (error) {
      console.error('Admin session middleware error:', error);
      return res.status(500).json({ error: 'Failed to verify admin session' });
    }
  };
}

module.exports = {
  AUTHORIZATION_HEADER,
  createRequireAdminSession,
  issueAdminSession,
  readBearerToken,
  revokeAdminSession,
  revokeAdminSessionsForUser,
};
