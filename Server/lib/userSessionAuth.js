const crypto = require('crypto');

const AUTHORIZATION_HEADER = 'authorization';
const DEFAULT_USER_SESSION_TTL_HOURS = 24 * 30;

function getUserSessionTtlHours() {
  const parsed = Number.parseInt(process.env.USER_SESSION_TTL_HOURS || '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_USER_SESSION_TTL_HOURS;
  }

  return parsed;
}

function buildUserSessionExpiryIso() {
  return new Date(Date.now() + (getUserSessionTtlHours() * 60 * 60 * 1000)).toISOString();
}

function hashUserSessionToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function generateUserSessionToken() {
  return `fps_user_${crypto.randomBytes(32).toString('hex')}`;
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

async function issueUserSession({ supabase, user }) {
  if (!supabase) {
    throw new Error('Supabase client is required to issue a user session.');
  }
  if (!user?.user_id) {
    throw new Error('A valid user is required to issue a user session.');
  }

  const token = generateUserSessionToken();
  const expiresAt = buildUserSessionExpiryIso();
  const { error } = await supabase
    .from('user_sessions')
    .insert({
      token_hash: hashUserSessionToken(token),
      user_id: user.user_id,
      expires_at: expiresAt,
    });

  if (error) {
    throw new Error(`Failed to create user session: ${error.message}`);
  }

  return {
    user_session_token: token,
    user_session_expires_at: expiresAt,
  };
}

async function revokeUserSession({ supabase, token, reason = 'logout' }) {
  if (!supabase) {
    throw new Error('Supabase client is required to revoke a user session.');
  }
  if (!token) {
    return;
  }

  const { error } = await supabase
    .from('user_sessions')
    .update({
      revoked_at: new Date().toISOString(),
      revoked_reason: reason,
    })
    .eq('token_hash', hashUserSessionToken(token))
    .is('revoked_at', null);

  if (error) {
    throw new Error(`Failed to revoke user session: ${error.message}`);
  }
}

function createRequireUserSession(supabase) {
  if (!supabase) {
    throw new Error('Supabase client is required to create user session middleware.');
  }

  return async function requireUserSession(req, res, next) {
    try {
      const token = readBearerToken(req);
      if (!token) {
        return res.status(401).json({ error: 'User session is required' });
      }

      const tokenHash = hashUserSessionToken(token);
      const { data: session, error: sessionError } = await supabase
        .from('user_sessions')
        .select('token_hash, user_id, expires_at, revoked_at')
        .eq('token_hash', tokenHash)
        .maybeSingle();

      if (sessionError) {
        console.error('Error loading user session:', sessionError);
        return res.status(500).json({ error: 'Failed to verify user session' });
      }
      if (!session || session.revoked_at) {
        return res.status(401).json({ error: 'User session is invalid' });
      }
      if (new Date(session.expires_at).getTime() <= Date.now()) {
        return res.status(401).json({ error: 'User session has expired. Please log in again.' });
      }

      const { data: user, error: userError } = await supabase
        .from('users')
        .select('user_id, username, user_type')
        .eq('user_id', session.user_id)
        .maybeSingle();

      if (userError) {
        console.error('Error loading session user:', userError);
        return res.status(500).json({ error: 'Failed to verify session user' });
      }
      if (!user) {
        return res.status(401).json({ error: 'User session is invalid' });
      }

      req.authenticatedUser = user;
      req.userSession = {
        tokenHash: session.token_hash,
        expires_at: session.expires_at,
      };

      supabase
        .from('user_sessions')
        .update({ last_used_at: new Date().toISOString() })
        .eq('token_hash', tokenHash)
        .then(({ error }) => {
          if (error) console.warn('Failed to update user session last_used_at:', error);
        })
        .catch((error) => {
          console.warn('Failed to update user session metadata:', error);
        });

      return next();
    } catch (error) {
      console.error('User session middleware error:', error);
      return res.status(500).json({ error: 'Failed to verify user session' });
    }
  };
}

function requireOwnUserParam(paramName = 'user_id') {
  return function requireOwnUserParamMiddleware(req, res, next) {
    const requestedUserId = Number.parseInt(String(req.params?.[paramName] || ''), 10);
    const authenticatedUserId = Number.parseInt(String(req.authenticatedUser?.user_id || ''), 10);
    if (!Number.isFinite(requestedUserId) || requestedUserId !== authenticatedUserId) {
      return res.status(403).json({ error: 'This action is limited to your own account' });
    }
    return next();
  };
}

module.exports = {
  AUTHORIZATION_HEADER,
  createRequireUserSession,
  getUserSessionTtlHours,
  hashUserSessionToken,
  issueUserSession,
  readBearerToken,
  requireOwnUserParam,
  revokeUserSession,
};
