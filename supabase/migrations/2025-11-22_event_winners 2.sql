-- Ensure UUID generation is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Store who won each finalized event
CREATE TABLE IF NOT EXISTS public.event_winners (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id bigint NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id bigint NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  points integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

-- One record per user/event pair
ALTER TABLE public.event_winners
  ADD CONSTRAINT event_winners_event_id_user_id_key
  UNIQUE (event_id, user_id);

-- Fast lookups by user
CREATE INDEX IF NOT EXISTS event_winners_user_id_idx
  ON public.event_winners (user_id);

