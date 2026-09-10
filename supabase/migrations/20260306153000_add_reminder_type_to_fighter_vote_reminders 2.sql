ALTER TABLE public.fighter_vote_reminders
ADD COLUMN IF NOT EXISTS reminder_type text;

UPDATE public.fighter_vote_reminders
SET reminder_type = 'broken_heart'
WHERE reminder_type IS NULL
   OR reminder_type NOT IN ('broken_heart', 'heart_eyes');

ALTER TABLE public.fighter_vote_reminders
ALTER COLUMN reminder_type SET DEFAULT 'broken_heart';

ALTER TABLE public.fighter_vote_reminders
ALTER COLUMN reminder_type SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fighter_vote_reminders_reminder_type_check'
  ) THEN
    ALTER TABLE public.fighter_vote_reminders
    ADD CONSTRAINT fighter_vote_reminders_reminder_type_check
    CHECK (reminder_type IN ('broken_heart', 'heart_eyes'));
  END IF;
END;
$$;
