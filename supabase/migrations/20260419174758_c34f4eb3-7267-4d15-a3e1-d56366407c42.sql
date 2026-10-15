CREATE OR REPLACE FUNCTION public.get_cb_creative_sales_daily(
  p_start_date date,
  p_end_date date,
  p_operation_id uuid DEFAULT NULL
)
RETURNS TABLE(date date, campaign_name text, revenue_brl numeric, receipt text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    cb.date,
    mcs.campaign_name,
    cb.amount_brl,
    cb.receipt
  FROM clickbank_audit cb
  JOIN meta_campaign_status mcs ON cb.aff_sub2 = mcs.campaign_id
  WHERE cb.date >= p_start_date
    AND cb.date <= p_end_date
    AND cb.transaction_type = 'SALE'
    AND cb.amount_usd BETWEEN 180 AND 250
    AND (p_operation_id IS NULL OR cb.operation_id = p_operation_id);
$$;