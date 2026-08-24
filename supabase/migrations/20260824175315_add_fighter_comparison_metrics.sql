ALTER TABLE IF EXISTS public.ufc_full_fight_card
  ADD COLUMN IF NOT EXISTS "SigStrLandedPerMin" numeric,
  ADD COLUMN IF NOT EXISTS "SigStrAbsorbedPerMin" numeric,
  ADD COLUMN IF NOT EXISTS "SigStrikeAccuracyPct" numeric,
  ADD COLUMN IF NOT EXISTS "SigStrikeDefensePct" numeric,
  ADD COLUMN IF NOT EXISTS "TakedownAvgPer15" numeric,
  ADD COLUMN IF NOT EXISTS "TakedownAccuracyPct" numeric,
  ADD COLUMN IF NOT EXISTS "TakedownDefensePct" numeric,
  ADD COLUMN IF NOT EXISTS "SubmissionAvgPer15" numeric,
  ADD COLUMN IF NOT EXISTS "KnockdownAvgPer15" numeric,
  ADD COLUMN IF NOT EXISTS "AverageFightTimeSeconds" integer,
  ADD COLUMN IF NOT EXISTS "RecentForm" text,
  ADD COLUMN IF NOT EXISTS "LastFightDate" date;

ALTER TABLE IF EXISTS public.fighters
  ADD COLUMN IF NOT EXISTS sig_str_landed_per_min numeric,
  ADD COLUMN IF NOT EXISTS sig_str_absorbed_per_min numeric,
  ADD COLUMN IF NOT EXISTS sig_strike_accuracy_pct numeric,
  ADD COLUMN IF NOT EXISTS sig_strike_defense_pct numeric,
  ADD COLUMN IF NOT EXISTS takedown_avg_per_15 numeric,
  ADD COLUMN IF NOT EXISTS takedown_accuracy_pct numeric,
  ADD COLUMN IF NOT EXISTS takedown_defense_pct numeric,
  ADD COLUMN IF NOT EXISTS submission_avg_per_15 numeric,
  ADD COLUMN IF NOT EXISTS knockdown_avg_per_15 numeric,
  ADD COLUMN IF NOT EXISTS average_fight_time_seconds integer,
  ADD COLUMN IF NOT EXISTS recent_form text,
  ADD COLUMN IF NOT EXISTS last_fight_date date;

ALTER TABLE IF EXISTS public.tapology_fighter_cache
  ADD COLUMN IF NOT EXISTS sig_str_landed_per_min numeric,
  ADD COLUMN IF NOT EXISTS sig_str_absorbed_per_min numeric,
  ADD COLUMN IF NOT EXISTS sig_strike_accuracy_pct numeric,
  ADD COLUMN IF NOT EXISTS sig_strike_defense_pct numeric,
  ADD COLUMN IF NOT EXISTS takedown_avg_per_15 numeric,
  ADD COLUMN IF NOT EXISTS takedown_accuracy_pct numeric,
  ADD COLUMN IF NOT EXISTS takedown_defense_pct numeric,
  ADD COLUMN IF NOT EXISTS submission_avg_per_15 numeric,
  ADD COLUMN IF NOT EXISTS knockdown_avg_per_15 numeric,
  ADD COLUMN IF NOT EXISTS average_fight_time_seconds integer,
  ADD COLUMN IF NOT EXISTS recent_form text,
  ADD COLUMN IF NOT EXISTS last_fight_date date;

ALTER FUNCTION public.replace_ufc_full_fight_card_event(
  bigint,
  text,
  date,
  text,
  text,
  text,
  text,
  jsonb
) RENAME TO replace_ufc_full_fight_card_event_without_comparison_metrics;

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
  import_result := public.replace_ufc_full_fight_card_event_without_comparison_metrics(
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
    "SigStrLandedPerMin" = incoming."SigStrLandedPerMin",
    "SigStrAbsorbedPerMin" = incoming."SigStrAbsorbedPerMin",
    "SigStrikeAccuracyPct" = incoming."SigStrikeAccuracyPct",
    "SigStrikeDefensePct" = incoming."SigStrikeDefensePct",
    "TakedownAvgPer15" = incoming."TakedownAvgPer15",
    "TakedownAccuracyPct" = incoming."TakedownAccuracyPct",
    "TakedownDefensePct" = incoming."TakedownDefensePct",
    "SubmissionAvgPer15" = incoming."SubmissionAvgPer15",
    "KnockdownAvgPer15" = incoming."KnockdownAvgPer15",
    "AverageFightTimeSeconds" = incoming."AverageFightTimeSeconds",
    "RecentForm" = NULLIF(BTRIM(incoming."RecentForm"), ''),
    "LastFightDate" = incoming."LastFightDate"
  FROM jsonb_to_recordset(p_rows) AS incoming(
    "FightId" bigint,
    "FighterId" bigint,
    "SigStrLandedPerMin" numeric,
    "SigStrAbsorbedPerMin" numeric,
    "SigStrikeAccuracyPct" numeric,
    "SigStrikeDefensePct" numeric,
    "TakedownAvgPer15" numeric,
    "TakedownAccuracyPct" numeric,
    "TakedownDefensePct" numeric,
    "SubmissionAvgPer15" numeric,
    "KnockdownAvgPer15" numeric,
    "AverageFightTimeSeconds" integer,
    "RecentForm" text,
    "LastFightDate" date
  )
  WHERE stored."EventId" = p_event_id
    AND stored."FightId" = incoming."FightId"
    AND stored."FighterId" = incoming."FighterId";

  RETURN import_result;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_ufc_full_fight_card_event(
  bigint, text, date, text, text, text, text, jsonb
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.replace_ufc_full_fight_card_event(
  bigint, text, date, text, text, text, text, jsonb
) TO service_role;

REVOKE ALL ON FUNCTION public.replace_ufc_full_fight_card_event_without_comparison_metrics(
  bigint, text, date, text, text, text, text, jsonb
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.replace_ufc_full_fight_card_event_without_comparison_metrics(
  bigint, text, date, text, text, text, text, jsonb
) TO service_role;
