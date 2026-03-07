CREATE TABLE IF NOT EXISTS public.fighter_vote_reminders (
  user_id bigint NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  fighter_id bigint NOT NULL,
  fighter_name text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT fighter_vote_reminders_pkey PRIMARY KEY (user_id, fighter_id)
);

CREATE OR REPLACE FUNCTION public.set_fighter_vote_reminders_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_fighter_vote_reminders_updated_at ON public.fighter_vote_reminders;
CREATE TRIGGER set_fighter_vote_reminders_updated_at
BEFORE UPDATE ON public.fighter_vote_reminders
FOR EACH ROW
EXECUTE FUNCTION public.set_fighter_vote_reminders_updated_at();

CREATE INDEX IF NOT EXISTS fighter_vote_reminders_user_id_idx
ON public.fighter_vote_reminders (user_id);

CREATE INDEX IF NOT EXISTS fighter_vote_reminders_fighter_id_idx
ON public.fighter_vote_reminders (fighter_id);

ALTER TABLE public.fighter_vote_reminders ENABLE ROW LEVEL SECURITY;
