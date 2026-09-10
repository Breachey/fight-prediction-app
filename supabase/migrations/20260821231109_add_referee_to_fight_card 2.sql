ALTER TABLE IF EXISTS public.ufc_full_fight_card
  ADD COLUMN IF NOT EXISTS "Referee_FirstName" text,
  ADD COLUMN IF NOT EXISTS "Referee_LastName" text;

ALTER FUNCTION public.replace_ufc_full_fight_card_event(
  bigint,
  text,
  date,
  text,
  text,
  text,
  text,
  jsonb
) RENAME TO replace_ufc_full_fight_card_event_without_referee;

CREATE FUNCTION public.replace_ufc_full_fight_card_event(
  p_event_id bigint,
  p_event_name text,
  p_event_date date,
  p_venue text,
  p_location_city text,
  p_location_state text,
  p_location_country text,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  import_result jsonb;
BEGIN
  import_result := public.replace_ufc_full_fight_card_event_without_referee(
    p_event_id,
    p_event_name,
    p_event_date,
    p_venue,
    p_location_city,
    p_location_state,
    p_location_country,
    p_rows
  );

  UPDATE public.ufc_full_fight_card AS stored
  SET
    "Referee_FirstName" = NULLIF(BTRIM(incoming."Referee_FirstName"), ''),
    "Referee_LastName" = NULLIF(BTRIM(incoming."Referee_LastName"), '')
  FROM jsonb_to_recordset(p_rows) AS incoming(
    "FightId" bigint,
    "FighterId" bigint,
    "Referee_FirstName" text,
    "Referee_LastName" text
  )
  WHERE stored."EventId" = p_event_id
    AND stored."FightId" = incoming."FightId"
    AND stored."FighterId" = incoming."FighterId";

  RETURN import_result;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_ufc_full_fight_card_event(
  bigint,
  text,
  date,
  text,
  text,
  text,
  text,
  jsonb
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.replace_ufc_full_fight_card_event(
  bigint,
  text,
  date,
  text,
  text,
  text,
  text,
  jsonb
) TO service_role;

REVOKE ALL ON FUNCTION public.replace_ufc_full_fight_card_event_without_referee(
  bigint,
  text,
  date,
  text,
  text,
  text,
  text,
  jsonb
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.replace_ufc_full_fight_card_event_without_referee(
  bigint,
  text,
  date,
  text,
  text,
  text,
  text,
  jsonb
) TO service_role;
