-- Applied to production on 2026-08-07.
-- The browser client talks to the Express API, never directly to PostgREST.
-- Keep the service role as the only Data API role with application-table access.

CREATE TABLE IF NOT EXISTS public.user_sessions (
  token_hash text PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  expires_at timestamptz NOT NULL,
  last_used_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text
);

CREATE INDEX IF NOT EXISTS user_sessions_user_id_idx
  ON public.user_sessions (user_id);

CREATE INDEX IF NOT EXISTS user_sessions_expires_at_idx
  ON public.user_sessions (expires_at);

DO $$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT c.oid::regclass AS relation_name
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', target.relation_name);
  END LOOP;
END;
$$;

-- Remove direct browser/Data API access. The API server uses service_role and
-- remains the single authorization boundary for all reads and writes.
REVOKE USAGE ON SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Keep future SQL-created objects private unless a later migration explicitly
-- opts a table or function into direct Data API access with RLS protections.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL PRIVILEGES ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL PRIVILEGES ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO service_role;

-- Invalidate every pre-hardening admin session. The anonymous Data API role
-- could previously read user phone credentials and identify admin accounts, so
-- retaining any session issued before this lockdown would create persistence
-- risk. New sessions are capped at 30 days in the API.
UPDATE public.admin_sessions
SET revoked_at = timezone('utc', now()),
    revoked_reason = 'security_hardening_20260807'
WHERE revoked_at IS NULL;
