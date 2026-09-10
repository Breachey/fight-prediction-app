CREATE TABLE IF NOT EXISTS public.tapology_event_cache (
  event_id bigint PRIMARY KEY,
  event_name text,
  event_date date,
  tapology_event_url text,
  event_image_url text,
  match_confidence text,
  source text NOT NULL DEFAULT 'scraper',
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.tapology_fighter_cache (
  fighter_id bigint PRIMARY KEY,
  mma_id bigint,
  first_name text,
  last_name text,
  normalized_name text,
  tapology_fighter_url text,
  rank integer,
  streak integer,
  style text,
  ko_tko_wins integer,
  ko_tko_losses integer,
  submission_wins integer,
  submission_losses integer,
  decision_wins integer,
  decision_losses integer,
  match_confidence text,
  source text NOT NULL DEFAULT 'scraper',
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE OR REPLACE FUNCTION public.set_tapology_cache_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_tapology_event_cache_updated_at ON public.tapology_event_cache;
CREATE TRIGGER set_tapology_event_cache_updated_at
BEFORE UPDATE ON public.tapology_event_cache
FOR EACH ROW
EXECUTE FUNCTION public.set_tapology_cache_updated_at();

DROP TRIGGER IF EXISTS set_tapology_fighter_cache_updated_at ON public.tapology_fighter_cache;
CREATE TRIGGER set_tapology_fighter_cache_updated_at
BEFORE UPDATE ON public.tapology_fighter_cache
FOR EACH ROW
EXECUTE FUNCTION public.set_tapology_cache_updated_at();

CREATE INDEX IF NOT EXISTS tapology_event_cache_date_idx
ON public.tapology_event_cache (event_date);

CREATE INDEX IF NOT EXISTS tapology_event_cache_url_idx
ON public.tapology_event_cache (tapology_event_url);

CREATE INDEX IF NOT EXISTS tapology_fighter_cache_mma_id_idx
ON public.tapology_fighter_cache (mma_id);

CREATE INDEX IF NOT EXISTS tapology_fighter_cache_normalized_name_idx
ON public.tapology_fighter_cache (normalized_name);

CREATE INDEX IF NOT EXISTS tapology_fighter_cache_url_idx
ON public.tapology_fighter_cache (tapology_fighter_url);

ALTER TABLE public.tapology_event_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tapology_fighter_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS public_read_tapology_event_cache ON public.tapology_event_cache;
CREATE POLICY public_read_tapology_event_cache
ON public.tapology_event_cache
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS public_read_tapology_fighter_cache ON public.tapology_fighter_cache;
CREATE POLICY public_read_tapology_fighter_cache
ON public.tapology_fighter_cache
FOR SELECT
TO anon, authenticated
USING (true);

INSERT INTO public.tapology_event_cache (
  event_id,
  event_name,
  event_date,
  tapology_event_url,
  match_confidence,
  source,
  last_success_at
)
SELECT DISTINCT ON ("EventId")
  "EventId"::bigint,
  NULLIF(BTRIM("Event"), ''),
  NULLIF(BTRIM("StartTime"::text), '')::timestamptz::date,
  NULLIF(BTRIM("TapologyEventURL"), ''),
  NULLIF(BTRIM("TapologyMatchConfidence"), ''),
  'historical_import',
  timezone('utc', now())
FROM public.ufc_full_fight_card
WHERE "EventId" IS NOT NULL
  AND NULLIF(BTRIM("TapologyEventURL"), '') IS NOT NULL
ORDER BY
  "EventId",
  CASE WHEN NULLIF(BTRIM("TapologyMatchConfidence"), '') IS NULL THEN 1 ELSE 0 END,
  id DESC NULLS LAST
ON CONFLICT (event_id) DO NOTHING;

INSERT INTO public.tapology_fighter_cache (
  fighter_id,
  mma_id,
  first_name,
  last_name,
  normalized_name,
  tapology_fighter_url,
  rank,
  streak,
  style,
  ko_tko_wins,
  ko_tko_losses,
  submission_wins,
  submission_losses,
  decision_wins,
  decision_losses,
  match_confidence,
  source,
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
  NULLIF(BTRIM("TapologyFighterURL"), ''),
  CASE WHEN NULLIF(BTRIM("Rank"::text), '') ~ '^-?\d+$'
    THEN NULLIF(BTRIM("Rank"::text), '')::integer
    ELSE NULL
  END,
  CASE WHEN NULLIF(BTRIM("Streak"::text), '') ~ '^-?\d+$'
    THEN NULLIF(BTRIM("Streak"::text), '')::integer
    ELSE NULL
  END,
  NULLIF(BTRIM(style), ''),
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
  NULLIF(BTRIM("TapologyMatchConfidence"), ''),
  'historical_import',
  timezone('utc', now())
FROM public.ufc_full_fight_card
WHERE "FighterId" IS NOT NULL
  AND (
    NULLIF(BTRIM("TapologyFighterURL"), '') IS NOT NULL
    OR NULLIF(BTRIM("Streak"::text), '') IS NOT NULL
    OR NULLIF(BTRIM(style), '') IS NOT NULL
    OR NULLIF(BTRIM("KO_TKO_Wins"::text), '') IS NOT NULL
    OR NULLIF(BTRIM("Submission_Wins"::text), '') IS NOT NULL
    OR NULLIF(BTRIM("Decision_Wins"::text), '') IS NOT NULL
  )
ORDER BY
  "FighterId",
  CASE WHEN NULLIF(BTRIM("TapologyFighterURL"), '') IS NULL THEN 1 ELSE 0 END,
  CASE WHEN NULLIF(BTRIM("KO_TKO_Wins"::text), '') IS NULL THEN 1 ELSE 0 END,
  CASE WHEN NULLIF(BTRIM(style), '') IS NULL THEN 1 ELSE 0 END,
  "EventId" DESC NULLS LAST,
  "FightId" DESC NULLS LAST,
  id DESC NULLS LAST
ON CONFLICT (fighter_id) DO NOTHING;
