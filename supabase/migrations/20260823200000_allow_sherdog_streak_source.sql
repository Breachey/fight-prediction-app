ALTER TABLE public.fighters
  DROP CONSTRAINT IF EXISTS fighters_streak_source_check,
  ADD CONSTRAINT fighters_streak_source_check
    CHECK (streak_source IS NULL OR streak_source IN ('manual', 'tapology_live', 'sherdog_live', 'fight_results')),
  DROP CONSTRAINT IF EXISTS fighters_streak_anchor_source_check,
  ADD CONSTRAINT fighters_streak_anchor_source_check
    CHECK (streak_anchor_source IS NULL OR streak_anchor_source IN ('manual', 'tapology_live', 'sherdog_live'));
