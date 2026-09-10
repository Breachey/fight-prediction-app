ALTER TABLE IF EXISTS public.ufc_full_fight_card
  ADD COLUMN IF NOT EXISTS "PossibleRounds" integer,
  ADD COLUMN IF NOT EXISTS "IsTitleFight" boolean,
  ADD COLUMN IF NOT EXISTS "TitleFightName" text;

CREATE OR REPLACE FUNCTION public.replace_ufc_full_fight_card_event(
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
  deleted_count integer := 0;
  inserted_count integer := 0;
  input_row_count integer := 0;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array';
  END IF;

  input_row_count := jsonb_array_length(p_rows);
  IF input_row_count = 0 THEN
    RAISE EXCEPTION 'p_rows must contain at least one fight-card row';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.events
    WHERE id = p_event_id
  ) THEN
    RAISE EXCEPTION 'Event % does not exist', p_event_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_rows) AS incoming("EventId" bigint)
    WHERE incoming."EventId" IS NOT NULL
      AND incoming."EventId" <> p_event_id
  ) THEN
    RAISE EXCEPTION 'Preview rows contain a mismatched EventId';
  END IF;

  UPDATE public.events
  SET
    name = COALESCE(NULLIF(BTRIM(p_event_name), ''), name),
    date = COALESCE(p_event_date, date),
    venue = COALESCE(NULLIF(BTRIM(p_venue), ''), venue),
    location_city = COALESCE(NULLIF(BTRIM(p_location_city), ''), location_city),
    location_state = COALESCE(NULLIF(BTRIM(p_location_state), ''), location_state),
    location_country = COALESCE(NULLIF(BTRIM(p_location_country), ''), location_country)
  WHERE id = p_event_id;

  SELECT COUNT(*)
  INTO deleted_count
  FROM public.ufc_full_fight_card
  WHERE "EventId" = p_event_id;

  DELETE FROM public.ufc_full_fight_card
  WHERE "EventId" = p_event_id;

  INSERT INTO public.ufc_full_fight_card (
    "Event",
    "EventId",
    "StartTime",
    "TimeZone",
    "EventStatus",
    "OrganizationId",
    "OrganizationName",
    "Venue",
    "VenueId",
    "Location_City",
    "Location_State",
    "Location_Country",
    "TriCode",
    "FightId",
    "FightOrder",
    "FightStatus",
    "PossibleRounds",
    "IsTitleFight",
    "TitleFightName",
    "CardSegment",
    "CardSegmentStartTime",
    "CardSegmentBroadcaster",
    "FighterId",
    "MMAId",
    "Corner",
    "FirstName",
    "LastName",
    "Nickname",
    "DOB",
    "Age",
    "Stance",
    "Weight_lbs",
    "Height_in",
    "Reach_in",
    "UFC_Profile",
    "FighterWeightClass",
    "Record_Wins",
    "Record_Losses",
    "Record_Draws",
    "Record_NoContests",
    "Born_City",
    "Born_State",
    "Born_Country",
    "FightingOutOf_City",
    "FightingOutOf_State",
    "FightingOutOf_Country",
    "ImageURL",
    "Rank",
    odds,
    "Streak",
    style,
    "KO_TKO_Wins",
    "KO_TKO_Losses",
    "Submission_Wins",
    "Submission_Losses",
    "Decision_Wins",
    "Decision_Losses",
    "TapologyEventURL",
    "TapologyFighterURL",
    "TapologyMatchConfidence"
  )
  SELECT
    incoming."Event",
    p_event_id,
    incoming."StartTime",
    incoming."TimeZone",
    incoming."EventStatus",
    incoming."OrganizationId",
    incoming."OrganizationName",
    incoming."Venue",
    incoming."VenueId",
    incoming."Location_City",
    incoming."Location_State",
    incoming."Location_Country",
    incoming."TriCode",
    incoming."FightId",
    incoming."FightOrder",
    incoming."FightStatus",
    incoming."PossibleRounds",
    incoming."IsTitleFight",
    incoming."TitleFightName",
    incoming."CardSegment",
    incoming."CardSegmentStartTime",
    incoming."CardSegmentBroadcaster",
    incoming."FighterId",
    incoming."MMAId",
    incoming."Corner",
    incoming."FirstName",
    incoming."LastName",
    incoming."Nickname",
    incoming."DOB",
    incoming."Age",
    incoming."Stance",
    incoming."Weight_lbs",
    incoming."Height_in",
    incoming."Reach_in",
    incoming."UFC_Profile",
    incoming."FighterWeightClass",
    incoming."Record_Wins",
    incoming."Record_Losses",
    incoming."Record_Draws",
    incoming."Record_NoContests",
    incoming."Born_City",
    incoming."Born_State",
    incoming."Born_Country",
    incoming."FightingOutOf_City",
    incoming."FightingOutOf_State",
    incoming."FightingOutOf_Country",
    incoming."ImageURL",
    incoming."Rank",
    incoming.odds,
    incoming."Streak",
    incoming.style,
    incoming."KO_TKO_Wins",
    incoming."KO_TKO_Losses",
    incoming."Submission_Wins",
    incoming."Submission_Losses",
    incoming."Decision_Wins",
    incoming."Decision_Losses",
    incoming."TapologyEventURL",
    incoming."TapologyFighterURL",
    incoming."TapologyMatchConfidence"
  FROM jsonb_populate_recordset(NULL::public.ufc_full_fight_card, p_rows) AS incoming;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'event_id', p_event_id,
    'deleted_count', deleted_count,
    'inserted_count', inserted_count
  );
END;
$$;
