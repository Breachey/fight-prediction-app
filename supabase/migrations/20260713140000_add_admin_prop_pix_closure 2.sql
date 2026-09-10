CREATE OR REPLACE FUNCTION public.admin_close_prop_pix_claim(
  p_prop_bet_id bigint,
  p_claim_id bigint,
  p_admin_user_id bigint
)
RETURNS TABLE (
  prop_bet_id bigint,
  claim_id bigint,
  claimant_user_id bigint,
  confirming_user_id bigint,
  outcome_text text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claim_row public.prop_bet_claims%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.users
    WHERE user_id = p_admin_user_id
      AND user_type = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only admins can close a Prop Pix claim without voter confirmation';
  END IF;

  SELECT c.*
  INTO claim_row
  FROM public.prop_bet_claims c
  JOIN public.prop_bets b ON b.id = c.prop_bet_id
  WHERE c.id = p_claim_id
    AND c.prop_bet_id = p_prop_bet_id
    AND c.status = 'pending'
    AND b.status = 'claim_pending'
  FOR UPDATE OF c;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Claim is no longer pending';
  END IF;

  PERFORM 1
  FROM public.prop_bets b
  WHERE b.id = claim_row.prop_bet_id
  FOR UPDATE;

  UPDATE public.prop_bet_claims
  SET status = 'confirmed',
      confirming_user_id = p_admin_user_id,
      confirmed_at = timezone('utc', now())
  WHERE id = claim_row.id;

  UPDATE public.prop_bets
  SET status = 'closed',
      outcome_text = claim_row.outcome_text,
      closed_at = timezone('utc', now()),
      closed_by_claim_id = claim_row.id
  WHERE id = claim_row.prop_bet_id;

  RETURN QUERY
  SELECT claim_row.prop_bet_id,
         claim_row.id,
         claim_row.claimant_user_id,
         p_admin_user_id,
         claim_row.outcome_text;
END;
$$;
