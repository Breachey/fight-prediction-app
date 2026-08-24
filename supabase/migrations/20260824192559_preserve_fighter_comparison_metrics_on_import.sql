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
    "SigStrLandedPerMin" = COALESCE(incoming."SigStrLandedPerMin", canonical.sig_str_landed_per_min),
    "SigStrAbsorbedPerMin" = COALESCE(incoming."SigStrAbsorbedPerMin", canonical.sig_str_absorbed_per_min),
    "SigStrikeAccuracyPct" = COALESCE(incoming."SigStrikeAccuracyPct", canonical.sig_strike_accuracy_pct),
    "SigStrikeDefensePct" = COALESCE(incoming."SigStrikeDefensePct", canonical.sig_strike_defense_pct),
    "TakedownAvgPer15" = COALESCE(incoming."TakedownAvgPer15", canonical.takedown_avg_per_15),
    "TakedownAccuracyPct" = COALESCE(incoming."TakedownAccuracyPct", canonical.takedown_accuracy_pct),
    "TakedownDefensePct" = COALESCE(incoming."TakedownDefensePct", canonical.takedown_defense_pct),
    "SubmissionAvgPer15" = COALESCE(incoming."SubmissionAvgPer15", canonical.submission_avg_per_15),
    "KnockdownAvgPer15" = COALESCE(incoming."KnockdownAvgPer15", canonical.knockdown_avg_per_15),
    "AverageFightTimeSeconds" = COALESCE(incoming."AverageFightTimeSeconds", canonical.average_fight_time_seconds),
    "RecentForm" = COALESCE(
      NULLIF(BTRIM(incoming."RecentForm"), ''),
      NULLIF(BTRIM(canonical.recent_form), '')
    ),
    "LastFightDate" = COALESCE(incoming."LastFightDate", canonical.last_fight_date)
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
  LEFT JOIN public.fighters AS canonical
    ON canonical.fighter_id = incoming."FighterId"
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

UPDATE public.ufc_full_fight_card AS stored
SET
  "SigStrLandedPerMin" = COALESCE(stored."SigStrLandedPerMin", canonical.sig_str_landed_per_min),
  "SigStrAbsorbedPerMin" = COALESCE(stored."SigStrAbsorbedPerMin", canonical.sig_str_absorbed_per_min),
  "SigStrikeAccuracyPct" = COALESCE(stored."SigStrikeAccuracyPct", canonical.sig_strike_accuracy_pct),
  "SigStrikeDefensePct" = COALESCE(stored."SigStrikeDefensePct", canonical.sig_strike_defense_pct),
  "TakedownAvgPer15" = COALESCE(stored."TakedownAvgPer15", canonical.takedown_avg_per_15),
  "TakedownAccuracyPct" = COALESCE(stored."TakedownAccuracyPct", canonical.takedown_accuracy_pct),
  "TakedownDefensePct" = COALESCE(stored."TakedownDefensePct", canonical.takedown_defense_pct),
  "SubmissionAvgPer15" = COALESCE(stored."SubmissionAvgPer15", canonical.submission_avg_per_15),
  "KnockdownAvgPer15" = COALESCE(stored."KnockdownAvgPer15", canonical.knockdown_avg_per_15),
  "AverageFightTimeSeconds" = COALESCE(stored."AverageFightTimeSeconds", canonical.average_fight_time_seconds),
  "RecentForm" = COALESCE(stored."RecentForm", canonical.recent_form),
  "LastFightDate" = COALESCE(stored."LastFightDate", canonical.last_fight_date)
FROM public.fighters AS canonical
WHERE canonical.fighter_id = stored."FighterId"
  AND (
    (stored."SigStrLandedPerMin" IS NULL AND canonical.sig_str_landed_per_min IS NOT NULL)
    OR (stored."SigStrAbsorbedPerMin" IS NULL AND canonical.sig_str_absorbed_per_min IS NOT NULL)
    OR (stored."SigStrikeAccuracyPct" IS NULL AND canonical.sig_strike_accuracy_pct IS NOT NULL)
    OR (stored."SigStrikeDefensePct" IS NULL AND canonical.sig_strike_defense_pct IS NOT NULL)
    OR (stored."TakedownAvgPer15" IS NULL AND canonical.takedown_avg_per_15 IS NOT NULL)
    OR (stored."TakedownAccuracyPct" IS NULL AND canonical.takedown_accuracy_pct IS NOT NULL)
    OR (stored."TakedownDefensePct" IS NULL AND canonical.takedown_defense_pct IS NOT NULL)
    OR (stored."SubmissionAvgPer15" IS NULL AND canonical.submission_avg_per_15 IS NOT NULL)
    OR (stored."KnockdownAvgPer15" IS NULL AND canonical.knockdown_avg_per_15 IS NOT NULL)
    OR (stored."AverageFightTimeSeconds" IS NULL AND canonical.average_fight_time_seconds IS NOT NULL)
    OR (stored."RecentForm" IS NULL AND canonical.recent_form IS NOT NULL)
    OR (stored."LastFightDate" IS NULL AND canonical.last_fight_date IS NOT NULL)
  );
