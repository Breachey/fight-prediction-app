CREATE TABLE IF NOT EXISTS public.admin_sessions (
  token_hash text PRIMARY KEY,
  user_id bigint NOT NULL,
  username text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  expires_at timestamptz NOT NULL,
  last_used_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text
);

CREATE INDEX IF NOT EXISTS admin_sessions_user_id_idx
  ON public.admin_sessions (user_id);

CREATE INDEX IF NOT EXISTS admin_sessions_expires_at_idx
  ON public.admin_sessions (expires_at);

CREATE TABLE IF NOT EXISTS public.admin_action_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  admin_user_id bigint NOT NULL,
  admin_username text NOT NULL,
  action text NOT NULL,
  status text NOT NULL CHECK (status IN ('success', 'error')),
  target_type text,
  target_id text,
  event_id bigint,
  request_method text NOT NULL,
  request_path text NOT NULL,
  ip_address text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS admin_action_audit_log_created_at_idx
  ON public.admin_action_audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS admin_action_audit_log_event_id_idx
  ON public.admin_action_audit_log (event_id);

CREATE INDEX IF NOT EXISTS admin_action_audit_log_action_idx
  ON public.admin_action_audit_log (action);

CREATE INDEX IF NOT EXISTS admin_action_audit_log_admin_user_id_idx
  ON public.admin_action_audit_log (admin_user_id);
