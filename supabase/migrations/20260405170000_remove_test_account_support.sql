DROP INDEX IF EXISTS public.users_test_account_linked_live_user_id_idx;

DROP INDEX IF EXISTS public.users_is_test_account_idx;

ALTER TABLE public.users
DROP COLUMN IF EXISTS linked_live_user_id;

ALTER TABLE public.users
DROP COLUMN IF EXISTS is_test_account;
