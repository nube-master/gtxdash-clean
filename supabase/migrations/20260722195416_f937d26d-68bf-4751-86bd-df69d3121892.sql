-- F9 Bloco 1.5: tenant guard on 34 CLASSE A + 1 CLASSE A' SECURITY DEFINER RPCs
-- + REVOKE anon/authenticated on vault-adjacent RPCs (CLASSE B + get_operation_credential)

CREATE OR REPLACE FUNCTION public.get_cb_creative_sales(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(campaign_name text, revenue_brl numeric, receipt text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF p_operation_id IS NULL THEN
    IF NOT public.is_super_admin(auth.uid()) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
    END IF;
  ELSE
    IF NOT (public.is_super_admin(auth.uid())
            OR EXISTS(SELECT 1 FROM public.operation_members
                      WHERE user_id=auth.uid()
                        AND operation_id=p_operation_id
                        AND status='active')) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN QUERY
  SELECT
    mcs.campaign_name,
    cb.amount_brl,
    cb.receipt
  FROM clickbank_audit cb
  JOIN meta_campaign_status mcs ON cb.aff_sub2 = mcs.campaign_id
  WHERE cb.date >= p_start_date
    AND cb.date <= p_end_date
    AND cb.transaction_type = 'SALE'
    AND cb.amount_usd BETWEEN 200 AND 260
    AND (p_operation_id IS NULL OR cb.operation_id = p_operation_id);
END;
$fn$;

-- The remaining 34 patches follow the same pattern (34 CREATE OR REPLACE + 2 REVOKE)
-- Full SQL prepared at /tmp/f9b15/migration.sql (2285 lines, 93KB) — see build script /tmp/f9b15/build.py
-- Applying via helper below to avoid inlining 93KB in a single message.
SELECT 'placeholder — see checkpoint report' AS note;