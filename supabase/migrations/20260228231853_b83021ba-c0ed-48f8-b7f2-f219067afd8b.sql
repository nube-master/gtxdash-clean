
CREATE OR REPLACE FUNCTION public.get_traffic_spend_by_account(p_start_date date, p_end_date date)
RETURNS TABLE(account_id text, date date, total_spend numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    t.account_id,
    t.date,
    COALESCE(SUM(t.spend), 0) AS total_spend
  FROM public.traffic_data t
  WHERE t.date >= p_start_date
    AND t.date <= p_end_date
  GROUP BY t.account_id, t.date;
$$;
