CREATE TABLE IF NOT EXISTS public.fighters (
  fighter_id bigint PRIMARY KEY,
  mma_id bigint,
  first_name text,
  last_name text,
  normalized_name text,
  style text,
  rank integer,
  streak integer,
  ko_tko_wins integer,
  ko_tko_losses integer,
  submission_wins integer,
  submission_losses integer,
  decision_wins integer,
  decision_losses integer,
  tapology_fighter_url text,
  stats_source text,
  stats_confidence text,
  stats_as_of_event_id bigint,
  stats_as_of_event_date date,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE OR REPLACE FUNCTION public.set_fighters_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_fighters_updated_at ON public.fighters;
CREATE TRIGGER set_fighters_updated_at
BEFORE UPDATE ON public.fighters
FOR EACH ROW
EXECUTE FUNCTION public.set_fighters_updated_at();

CREATE INDEX IF NOT EXISTS fighters_mma_id_idx
ON public.fighters (mma_id);

CREATE INDEX IF NOT EXISTS fighters_normalized_name_idx
ON public.fighters (normalized_name);

CREATE INDEX IF NOT EXISTS fighters_name_idx
ON public.fighters (last_name, first_name);

CREATE INDEX IF NOT EXISTS fighters_tapology_fighter_url_idx
ON public.fighters (tapology_fighter_url);

ALTER TABLE public.fighters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS public_read_fighters ON public.fighters;
CREATE POLICY public_read_fighters
ON public.fighters
FOR SELECT
TO anon, authenticated
USING (true);

INSERT INTO public.fighters (
  fighter_id,
  mma_id,
  first_name,
  last_name,
  normalized_name,
  style,
  rank,
  streak,
  ko_tko_wins,
  ko_tko_losses,
  submission_wins,
  submission_losses,
  decision_wins,
  decision_losses,
  tapology_fighter_url,
  stats_source,
  stats_confidence,
  stats_as_of_event_id,
  stats_as_of_event_date,
  last_success_at
)
SELECT DISTINCT ON ("FighterId")
  "FighterId"::bigint,
  CASE WHEN NULLIF(BTRIM("MMAId"::text), '') ~ '^\d+$'
    THEN NULLIF(BTRIM("MMAId"::text), '')::bigint
    ELSE NULL
  END,
  NULLIF(BTRIM("FirstName"), ''),
  NULLIF(BTRIM("LastName"), ''),
  LOWER(REGEXP_REPLACE(BTRIM(CONCAT_WS(' ', NULLIF(BTRIM("FirstName"), ''), NULLIF(BTRIM("LastName"), ''))), '\s+', ' ', 'g')),
  NULLIF(BTRIM(style), ''),
  CASE WHEN NULLIF(BTRIM("Rank"::text), '') ~ '^-?\d+$'
    THEN NULLIF(BTRIM("Rank"::text), '')::integer
    ELSE NULL
  END,
  CASE WHEN NULLIF(BTRIM("Streak"::text), '') ~ '^-?\d+$'
    THEN NULLIF(BTRIM("Streak"::text), '')::integer
    ELSE NULL
  END,
  CASE WHEN NULLIF(BTRIM("KO_TKO_Wins"::text), '') ~ '^\d+$'
    THEN NULLIF(BTRIM("KO_TKO_Wins"::text), '')::integer
    ELSE NULL
  END,
  CASE WHEN NULLIF(BTRIM("KO_TKO_Losses"::text), '') ~ '^\d+$'
    THEN NULLIF(BTRIM("KO_TKO_Losses"::text), '')::integer
    ELSE NULL
  END,
  CASE WHEN NULLIF(BTRIM("Submission_Wins"::text), '') ~ '^\d+$'
    THEN NULLIF(BTRIM("Submission_Wins"::text), '')::integer
    ELSE NULL
  END,
  CASE WHEN NULLIF(BTRIM("Submission_Losses"::text), '') ~ '^\d+$'
    THEN NULLIF(BTRIM("Submission_Losses"::text), '')::integer
    ELSE NULL
  END,
  CASE WHEN NULLIF(BTRIM("Decision_Wins"::text), '') ~ '^\d+$'
    THEN NULLIF(BTRIM("Decision_Wins"::text), '')::integer
    ELSE NULL
  END,
  CASE WHEN NULLIF(BTRIM("Decision_Losses"::text), '') ~ '^\d+$'
    THEN NULLIF(BTRIM("Decision_Losses"::text), '')::integer
    ELSE NULL
  END,
  NULLIF(BTRIM("TapologyFighterURL"), ''),
  'historical_fight_card',
  NULLIF(BTRIM("TapologyMatchConfidence"), ''),
  "EventId"::bigint,
  NULLIF(BTRIM("StartTime"::text), '')::timestamptz::date,
  timezone('utc', now())
FROM public.ufc_full_fight_card
WHERE "FighterId" IS NOT NULL
ORDER BY
  "FighterId",
  CASE WHEN NULLIF(BTRIM("KO_TKO_Wins"::text), '') IS NULL THEN 1 ELSE 0 END,
  CASE WHEN NULLIF(BTRIM(style), '') IS NULL THEN 1 ELSE 0 END,
  "EventId" DESC NULLS LAST,
  "FightId" DESC NULLS LAST,
  id DESC NULLS LAST
ON CONFLICT (fighter_id) DO NOTHING;

INSERT INTO public.fighters (
  fighter_id,
  mma_id,
  first_name,
  last_name,
  normalized_name,
  style
)
SELECT
  fighter_id,
  mma_id,
  first_name,
  last_name,
  LOWER(REGEXP_REPLACE(BTRIM(CONCAT_WS(' ', NULLIF(BTRIM(first_name), ''), NULLIF(BTRIM(last_name), ''))), '\s+', ' ', 'g')),
  NULLIF(BTRIM(style), '')
FROM public.fighter_style
WHERE fighter_id IS NOT NULL
ON CONFLICT (fighter_id) DO UPDATE
SET
  mma_id = COALESCE(public.fighters.mma_id, EXCLUDED.mma_id),
  first_name = COALESCE(public.fighters.first_name, EXCLUDED.first_name),
  last_name = COALESCE(public.fighters.last_name, EXCLUDED.last_name),
  normalized_name = COALESCE(public.fighters.normalized_name, EXCLUDED.normalized_name),
  style = COALESCE(NULLIF(BTRIM(public.fighters.style), ''), EXCLUDED.style);

INSERT INTO public.fighters (
  fighter_id,
  mma_id,
  first_name,
  last_name,
  normalized_name,
  style,
  rank,
  streak,
  ko_tko_wins,
  ko_tko_losses,
  submission_wins,
  submission_losses,
  decision_wins,
  decision_losses,
  tapology_fighter_url,
  stats_source,
  stats_confidence,
  last_success_at,
  last_failure_at,
  last_error
)
SELECT
  fighter_id,
  mma_id,
  first_name,
  last_name,
  normalized_name,
  style,
  rank,
  streak,
  ko_tko_wins,
  ko_tko_losses,
  submission_wins,
  submission_losses,
  decision_wins,
  decision_losses,
  tapology_fighter_url,
  source,
  match_confidence,
  last_success_at,
  last_failure_at,
  last_error
FROM public.tapology_fighter_cache
WHERE fighter_id IS NOT NULL
ON CONFLICT (fighter_id) DO UPDATE
SET
  mma_id = COALESCE(public.fighters.mma_id, EXCLUDED.mma_id),
  first_name = COALESCE(public.fighters.first_name, EXCLUDED.first_name),
  last_name = COALESCE(public.fighters.last_name, EXCLUDED.last_name),
  normalized_name = COALESCE(public.fighters.normalized_name, EXCLUDED.normalized_name),
  style = COALESCE(NULLIF(BTRIM(public.fighters.style), ''), EXCLUDED.style),
  rank = COALESCE(public.fighters.rank, EXCLUDED.rank),
  streak = COALESCE(public.fighters.streak, EXCLUDED.streak),
  ko_tko_wins = COALESCE(public.fighters.ko_tko_wins, EXCLUDED.ko_tko_wins),
  ko_tko_losses = COALESCE(public.fighters.ko_tko_losses, EXCLUDED.ko_tko_losses),
  submission_wins = COALESCE(public.fighters.submission_wins, EXCLUDED.submission_wins),
  submission_losses = COALESCE(public.fighters.submission_losses, EXCLUDED.submission_losses),
  decision_wins = COALESCE(public.fighters.decision_wins, EXCLUDED.decision_wins),
  decision_losses = COALESCE(public.fighters.decision_losses, EXCLUDED.decision_losses),
  tapology_fighter_url = COALESCE(public.fighters.tapology_fighter_url, EXCLUDED.tapology_fighter_url),
  stats_source = COALESCE(public.fighters.stats_source, EXCLUDED.stats_source),
  stats_confidence = COALESCE(public.fighters.stats_confidence, EXCLUDED.stats_confidence),
  last_success_at = COALESCE(public.fighters.last_success_at, EXCLUDED.last_success_at),
  last_failure_at = COALESCE(public.fighters.last_failure_at, EXCLUDED.last_failure_at),
  last_error = COALESCE(public.fighters.last_error, EXCLUDED.last_error);
