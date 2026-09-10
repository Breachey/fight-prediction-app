ALTER TABLE public.fighters
  ADD COLUMN IF NOT EXISTS streak_source text,
  ADD COLUMN IF NOT EXISTS streak_anchor_source text,
  ADD COLUMN IF NOT EXISTS streak_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS streak_anchor_value integer,
  ADD COLUMN IF NOT EXISTS streak_anchor_record_wins integer,
  ADD COLUMN IF NOT EXISTS streak_anchor_record_losses integer,
  ADD COLUMN IF NOT EXISTS streak_anchor_event_id bigint,
  ADD COLUMN IF NOT EXISTS streak_anchor_through_date date,
  ADD COLUMN IF NOT EXISTS streak_record_wins integer,
  ADD COLUMN IF NOT EXISTS streak_record_losses integer,
  ADD COLUMN IF NOT EXISTS streak_verified_through_date date,
  ADD COLUMN IF NOT EXISTS streak_needs_review boolean NOT NULL DEFAULT true;

ALTER TABLE public.fighters
  DROP CONSTRAINT IF EXISTS fighters_streak_source_check,
  ADD CONSTRAINT fighters_streak_source_check
    CHECK (streak_source IS NULL OR streak_source IN ('manual', 'tapology_live', 'fight_results')),
  DROP CONSTRAINT IF EXISTS fighters_streak_anchor_source_check,
  ADD CONSTRAINT fighters_streak_anchor_source_check
    CHECK (streak_anchor_source IS NULL OR streak_anchor_source IN ('manual', 'tapology_live')),
  DROP CONSTRAINT IF EXISTS fighters_streak_anchor_record_wins_check,
  ADD CONSTRAINT fighters_streak_anchor_record_wins_check
    CHECK (streak_anchor_record_wins IS NULL OR streak_anchor_record_wins >= 0),
  DROP CONSTRAINT IF EXISTS fighters_streak_anchor_record_losses_check,
  ADD CONSTRAINT fighters_streak_anchor_record_losses_check
    CHECK (streak_anchor_record_losses IS NULL OR streak_anchor_record_losses >= 0),
  DROP CONSTRAINT IF EXISTS fighters_streak_record_wins_check,
  ADD CONSTRAINT fighters_streak_record_wins_check
    CHECK (streak_record_wins IS NULL OR streak_record_wins >= 0),
  DROP CONSTRAINT IF EXISTS fighters_streak_record_losses_check,
  ADD CONSTRAINT fighters_streak_record_losses_check
    CHECK (streak_record_losses IS NULL OR streak_record_losses >= 0);

-- Every pre-migration streak has mixed or incomplete provenance. Keep the value for
-- historical inspection, but require a new live Tapology or manual anchor before use.
UPDATE public.fighters
SET
  streak_source = NULL,
  streak_anchor_source = NULL,
  streak_verified_at = NULL,
  streak_anchor_value = NULL,
  streak_anchor_record_wins = NULL,
  streak_anchor_record_losses = NULL,
  streak_anchor_event_id = NULL,
  streak_anchor_through_date = NULL,
  streak_record_wins = NULL,
  streak_record_losses = NULL,
  streak_verified_through_date = NULL,
  streak_needs_review = true;

CREATE TABLE IF NOT EXISTS public.fighter_streak_results (
  fighter_id bigint NOT NULL,
  fight_id bigint NOT NULL,
  event_id bigint NOT NULL,
  event_date date NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('win', 'loss')),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (fighter_id, fight_id)
);

CREATE INDEX IF NOT EXISTS fighter_streak_results_replay_idx
ON public.fighter_streak_results (fighter_id, event_date, event_id, fight_id);

CREATE OR REPLACE FUNCTION public.set_fighter_streak_results_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_fighter_streak_results_updated_at
ON public.fighter_streak_results;
CREATE TRIGGER set_fighter_streak_results_updated_at
BEFORE UPDATE ON public.fighter_streak_results
FOR EACH ROW
EXECUTE FUNCTION public.set_fighter_streak_results_updated_at();

ALTER TABLE public.fighter_streak_results ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.fighter_streak_results FROM anon, authenticated;
GRANT ALL ON TABLE public.fighter_streak_results TO service_role;
