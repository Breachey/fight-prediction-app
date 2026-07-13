-- Move users on the old default playercard to the new default.
UPDATE public.users
SET selected_playercard_id = 16
WHERE selected_playercard_id = 1;
