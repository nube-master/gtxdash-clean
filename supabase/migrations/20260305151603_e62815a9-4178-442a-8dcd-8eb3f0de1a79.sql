
CREATE OR REPLACE FUNCTION public.get_spend_normalized_sp(p_start_date date, p_end_date date)
 RETURNS TABLE(sp_date date, total_spend numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  -- SIMPLIFIED APPROACH: use traffic_data (daily) for ALL accounts.
  -- This matches Meta Ads Manager per-account daily reporting.
  -- Previous approach used hourly normalization for non-SP accounts,
  -- but this caused a ~2-3% gap because early European morning hours
  -- (e.g. 00:00-03:00 Belgrade = 20:00-23:00 SP previous day) were
  -- attributed to the wrong SP business day.
  SELECT 
    t.date AS sp_date, 
    SUM(t.spend) AS total_spend
  FROM traffic_data t
  JOIN meta_ad_accounts a ON t.account_id = a.account_id AND a.is_active = true
  WHERE t.date >= p_start_date
    AND t.date <= p_end_date
  GROUP BY t.date;
$$;
