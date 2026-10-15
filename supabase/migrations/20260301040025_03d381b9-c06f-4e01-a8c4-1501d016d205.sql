
CREATE OR REPLACE FUNCTION public.get_spend_normalized_sp(p_start_date date, p_end_date date)
RETURNS TABLE(sp_date date, total_spend numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH hourly_sp AS (
    SELECT 
      h.spend,
      (
        make_timestamp(
          extract(year from h.date)::int,
          extract(month from h.date)::int,
          extract(day from h.date)::int,
          h.hour, 30, 0
        ) AT TIME ZONE COALESCE(a.timezone, 'America/Sao_Paulo') 
        AT TIME ZONE 'America/Sao_Paulo'
      )::date AS business_date
    FROM traffic_data_hourly h
    JOIN meta_ad_accounts a ON h.account_id = a.account_id AND a.is_active = true
    WHERE h.date >= (p_start_date - 2)
      AND h.date <= (p_end_date + 2)
  )
  SELECT business_date AS sp_date, SUM(spend) AS total_spend
  FROM hourly_sp
  WHERE business_date >= p_start_date AND business_date <= p_end_date
  GROUP BY business_date;
$$;
