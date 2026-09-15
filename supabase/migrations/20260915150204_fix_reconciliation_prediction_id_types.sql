-- Prediction/result IDs are text in production; cast numeric card IDs, preserving text indexes.
CREATE OR REPLACE FUNCTION public.reconcile_upcoming_fight_card_event(
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
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  removed_fight_ids bigint[];
  removed_prediction_count integer;
  import_result jsonb;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array';
  END IF;
  IF jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'Cannot reconcile an empty fight card';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_rows)
      AS r("FightId" bigint, "FighterId" bigint, "Corner" text, "EventId" bigint)
    GROUP BY r."FightId"
    HAVING r."FightId" IS NULL OR count(*) <> 2
      OR count(DISTINCT r."FighterId") <> 2
      OR count(*) FILTER (WHERE r."Corner" = 'Red') <> 1
      OR count(*) FILTER (WHERE r."Corner" = 'Blue') <> 1
      OR count(*) FILTER (WHERE r."EventId" = p_event_id) <> 2
  ) THEN
    RAISE EXCEPTION 'Incoming card must contain complete fights for this event';
  END IF;

  PERFORM 1 FROM public.events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event % does not exist', p_event_id;
  END IF;
  -- Match the importer's event-first lock order, then serialize card/pick/result writes.
  LOCK TABLE public.ufc_full_fight_card, public.predictions, public.fight_results
    IN SHARE ROW EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM public.events WHERE id = p_event_id AND is_completed)
    OR EXISTS (
      SELECT 1 FROM public.ufc_full_fight_card c
      WHERE c."EventId" = p_event_id
        AND (NULLIF(BTRIM(c."StartTime"::text), '')::timestamptz <= clock_timestamp()
          OR EXISTS (SELECT 1 FROM public.fight_results r WHERE r.fight_id = c."FightId"::text))
    ) THEN
    RAISE EXCEPTION 'Cannot reconcile a started or completed event';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.ufc_full_fight_card c
    JOIN public.predictions p ON p.fight_id = c."FightId"::text
    WHERE c."EventId" = p_event_id
      AND EXISTS (SELECT 1 FROM jsonb_to_recordset(p_rows) AS r("FightId" bigint)
                  WHERE r."FightId" = c."FightId")
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_to_recordset(p_rows) AS r("FightId" bigint, "FighterId" bigint)
        WHERE r."FightId" = c."FightId" AND r."FighterId" = c."FighterId"
      )
  ) THEN
    RAISE EXCEPTION 'Opponent changes with existing predictions require review';
  END IF;

  SELECT coalesce(array_agg(DISTINCT c."FightId"), ARRAY[]::bigint[])
  INTO removed_fight_ids
  FROM public.ufc_full_fight_card c
  WHERE c."EventId" = p_event_id
    AND NOT EXISTS (SELECT 1 FROM jsonb_to_recordset(p_rows) AS r("FightId" bigint)
                    WHERE r."FightId" = c."FightId");

  DELETE FROM public.predictions WHERE fight_id = ANY(removed_fight_ids::text[]);
  GET DIAGNOSTICS removed_prediction_count = ROW_COUNT;

  import_result := public.replace_ufc_full_fight_card_event(
    p_event_id, p_event_name, p_event_date, p_venue,
    p_location_city, p_location_state, p_location_country, p_rows
  );
  RETURN import_result || jsonb_build_object(
    'removedFightIds', removed_fight_ids,
    'removedPredictionCount', removed_prediction_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_upcoming_fight_card_event(
  bigint, text, date, text, text, text, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_upcoming_fight_card_event(
  bigint, text, date, text, text, text, text, jsonb
) TO service_role;
