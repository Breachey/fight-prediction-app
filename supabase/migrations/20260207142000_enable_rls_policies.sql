-- Enable RLS for all application tables that were previously unrestricted.
ALTER TABLE IF EXISTS public.badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.event_winners ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.fight_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.playercards ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.prediction_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ufc_full_fight_card ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.weightclasses ENABLE ROW LEVEL SECURITY;

-- Public read-only policies for data the app can expose publicly.
DROP POLICY IF EXISTS public_read_badges ON public.badges;
CREATE POLICY public_read_badges
ON public.badges
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS public_read_event_winners ON public.event_winners;
CREATE POLICY public_read_event_winners
ON public.event_winners
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS public_read_events ON public.events;
CREATE POLICY public_read_events
ON public.events
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS public_read_fight_results ON public.fight_results;
CREATE POLICY public_read_fight_results
ON public.fight_results
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS public_read_playercards ON public.playercards;
CREATE POLICY public_read_playercards
ON public.playercards
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS public_read_prediction_results ON public.prediction_results;
CREATE POLICY public_read_prediction_results
ON public.prediction_results
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS public_read_ufc_full_fight_card ON public.ufc_full_fight_card;
CREATE POLICY public_read_ufc_full_fight_card
ON public.ufc_full_fight_card
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS public_read_weightclasses ON public.weightclasses;
CREATE POLICY public_read_weightclasses
ON public.weightclasses
FOR SELECT
TO anon, authenticated
USING (true);

-- Intentionally no anon/authenticated policies for:
--   public.users
--   public.predictions
-- Writes/privileged reads for these tables should happen only through backend
-- requests using SUPABASE_SERVICE_ROLE_KEY.
