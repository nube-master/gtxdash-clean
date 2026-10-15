
CREATE OR REPLACE FUNCTION public.get_spend_normalized_sp(p_start_date date, p_end_date date)
 RETURNS TABLE(sp_date date, total_spend numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  -- HYBRID APPROACH:
  -- 1) For accounts in America/Sao_Paulo timezone: use traffic_data (daily) directly
  --    → eliminates Meta API hourly rounding gap (~1%)
  -- 2) For accounts in other timezones (e.g. Europe): use traffic_data_hourly
  --    with timezone normalization to assign spend to correct SP business day

  WITH sp_accounts_daily AS (
    -- BRT accounts: daily data is already correctly dated
    SELECT t.date AS business_date, SUM(t.spend) AS spend
    FROM traffic_data t
    JOIN meta_ad_accounts a ON t.account_id = a.account_id AND a.is_active = true
    WHERE a.timezone = 'America/Sao_Paulo'
      AND t.date >= p_start_date
      AND t.date <= p_end_date
    GROUP BY t.date
  ),
  non_sp_hourly AS (
    -- Non-BRT accounts: normalize each hour to SP business day
    SELECT 
      (
        make_timestamp(
          extract(year from h.date)::int,
          extract(month from h.date)::int,
          extract(day from h.date)::int,
          h.hour, 30, 0
        ) AT TIME ZONE a.timezone 
        AT TIME ZONE 'America/Sao_Paulo'
      )::date AS business_date,
      SUM(h.spend) AS spend
    FROM traffic_data_hourly h
    JOIN meta_ad_accounts a ON h.account_id = a.account_id AND a.is_active = true
    WHERE a.timezone != 'America/Sao_Paulo'
      AND h.date >= (p_start_date - 2)
      AND h.date <= (p_end_date + 2)
    GROUP BY business_date
  ),
  combined AS (
    SELECT business_date, spend FROM sp_accounts_daily
    UNION ALL
    SELECT business_date, spend FROM non_sp_hourly
    WHERE business_date >= p_start_date AND business_date <= p_end_date
  )
  SELECT business_date AS sp_date, SUM(spend) AS total_spend
  FROM combined
  WHERE business_date >= p_start_date AND business_date <= p_end_date
  GROUP BY business_date;
$$;
