ALTER TABLE public.clickbank_audit
  ADD COLUMN IF NOT EXISTS buyer_email text,
  ADD COLUMN IF NOT EXISTS buyer_email_hash text,
  ADD COLUMN IF NOT EXISTS buyer_name text;

CREATE INDEX IF NOT EXISTS idx_cb_audit_buyer_hash
  ON public.clickbank_audit (operation_id, buyer_email_hash, date)
  WHERE buyer_email_hash IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_unique_buyers(
  p_operation_id uuid,
  p_start date,
  p_end date
) RETURNS TABLE (
  unique_buyers bigint,
  total_revenue_brl numeric,
  total_transactions bigint,
  arpu_brl numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      COALESCE(NULLIF(buyer_email_hash,''), 'txn:'||id::text) AS buyer_key,
      amount_brl
    FROM public.clickbank_audit
    WHERE operation_id = p_operation_id
      AND date >= p_start
      AND date <= p_end
      AND transaction_type = 'SALE'
  )
  SELECT
    COUNT(DISTINCT buyer_key)::bigint AS unique_buyers,
    COALESCE(SUM(amount_brl),0)::numeric AS total_revenue_brl,
    COUNT(*)::bigint AS total_transactions,
    CASE WHEN COUNT(DISTINCT buyer_key) > 0
      THEN (COALESCE(SUM(amount_brl),0) / COUNT(DISTINCT buyer_key))::numeric
      ELSE 0::numeric
    END AS arpu_brl
  FROM base;
$$;

GRANT EXECUTE ON FUNCTION public.get_unique_buyers(uuid, date, date) TO authenticated, service_role;