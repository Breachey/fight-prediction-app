ALTER TABLE public.fight_results
  ADD COLUMN IF NOT EXISTS result_type text;

UPDATE public.fight_results
SET result_type = 'winner'
WHERE is_completed = true
  AND fighter_id IS NOT NULL
  AND result_type IS NULL;

ALTER TABLE public.fight_results
  DROP CONSTRAINT IF EXISTS fight_results_result_type_check,
  ADD CONSTRAINT fight_results_result_type_check
    CHECK (result_type IS NULL OR result_type IN ('winner', 'draw', 'no_contest'));

COMMENT ON COLUMN public.fight_results.result_type IS
  'Completed fight outcome: winner, draw, or no_contest. Null represents an unset result.';
