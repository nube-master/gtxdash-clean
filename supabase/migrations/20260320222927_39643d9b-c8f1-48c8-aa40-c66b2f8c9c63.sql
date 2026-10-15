
CREATE OR REPLACE FUNCTION public.get_cb_creative_sales(p_start_date date, p_end_date date)
RETURNS TABLE(
  campaign_name text,
  revenue_brl numeric,
  receipt text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    mcs.campaign_name,
    cb.amount_brl,
    cb.receipt
  FROM clickbank_audit cb
  JOIN meta_campaign_status mcs ON cb.aff_sub2 = mcs.campaign_id
  WHERE cb.date >= p_start_date
    AND cb.date <= p_end_date
    AND cb.transaction_type = 'SALE'
    AND cb.amount_usd BETWEEN 180 AND 250;
$$;
