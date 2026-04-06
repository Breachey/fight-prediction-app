ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS is_test_account boolean NOT NULL DEFAULT false;

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS linked_live_user_id bigint;

UPDATE public.users
SET is_test_account = false
WHERE is_test_account IS NULL;

CREATE INDEX IF NOT EXISTS users_is_test_account_idx
ON public.users (is_test_account);

CREATE UNIQUE INDEX IF NOT EXISTS users_test_account_linked_live_user_id_idx
ON public.users (linked_live_user_id)
WHERE is_test_account = true AND linked_live_user_id IS NOT NULL;
