-- Default users without a selected card to the base playercard.
UPDATE public.users
SET selected_playercard_id = 16
WHERE selected_playercard_id IS NULL;

ALTER TABLE public.users
  ALTER COLUMN selected_playercard_id SET DEFAULT 16;
