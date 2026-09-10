CREATE TABLE IF NOT EXISTS public.fighter_style (
  fighter_id bigint PRIMARY KEY,
  mma_id bigint,
  first_name text,
  last_name text,
  style text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE OR REPLACE FUNCTION public.set_fighter_style_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_fighter_style_updated_at ON public.fighter_style;
CREATE TRIGGER set_fighter_style_updated_at
BEFORE UPDATE ON public.fighter_style
FOR EACH ROW
EXECUTE FUNCTION public.set_fighter_style_updated_at();

CREATE INDEX IF NOT EXISTS fighter_style_mma_id_idx
ON public.fighter_style (mma_id);

CREATE INDEX IF NOT EXISTS fighter_style_name_idx
ON public.fighter_style (last_name, first_name);

CREATE INDEX IF NOT EXISTS fighter_style_style_idx
ON public.fighter_style (style);

ALTER TABLE public.fighter_style ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS public_read_fighter_style ON public.fighter_style;
CREATE POLICY public_read_fighter_style
ON public.fighter_style
FOR SELECT
TO anon, authenticated
USING (true);

CREATE OR REPLACE FUNCTION public.sync_fighter_style_from_fight_card()
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  synced_count integer;
BEGIN
  WITH ranked_fighters AS (
    SELECT DISTINCT ON ("FighterId")
      "FighterId"::bigint AS fighter_id,
      NULLIF(BTRIM("MMAId"::text), '')::bigint AS mma_id,
      NULLIF(BTRIM("FirstName"), '') AS first_name,
      NULLIF(BTRIM("LastName"), '') AS last_name,
      NULLIF(BTRIM(style), '') AS style
    FROM public.ufc_full_fight_card
    WHERE "FighterId" IS NOT NULL
    ORDER BY
      "FighterId",
      CASE WHEN NULLIF(BTRIM(style), '') IS NULL THEN 1 ELSE 0 END,
      "EventId" DESC NULLS LAST,
      "FightId" DESC NULLS LAST,
      id DESC NULLS LAST
  ),
  upserted AS (
    INSERT INTO public.fighter_style (
      fighter_id,
      mma_id,
      first_name,
      last_name,
      style
    )
    SELECT
      fighter_id,
      mma_id,
      first_name,
      last_name,
      style
    FROM ranked_fighters
    ON CONFLICT (fighter_id) DO UPDATE
    SET
      style = EXCLUDED.style,
      updated_at = timezone('utc', now())
    WHERE NULLIF(BTRIM(public.fighter_style.style), '') IS NULL
      AND EXCLUDED.style IS NOT NULL
    RETURNING 1
  )
  SELECT COUNT(*) INTO synced_count
  FROM upserted;

  RETURN synced_count;
END;
$$;

SELECT public.sync_fighter_style_from_fight_card();
