
CREATE OR REPLACE FUNCTION public.get_spend_normalized_sp(p_start_date date, p_end_date date)
RETURNS TABLE(sp_date date, total_spend numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH hourly_sp AS (
    SELECT 
      h.spend,
      -- Account local time (raw date+hour from table)
      make_timestamp(
        extract(year from h.date)::int,
        extract(month from h.date)::int,
        extract(day from h.date)::int,
        h.hour, 30, 0
      ) AS acc_ts,
      -- Same instant converted to São Paulo local time
      (
        make_timestamp(
          extract(year from h.date)::int,
          extract(month from h.date)::int,
          extract(day from h.date)::int,
          h.hour, 30, 0
        ) AT TIME ZONE COALESCE(a.timezone, 'America/Sao_Paulo') 
        AT TIME ZONE 'America/Sao_Paulo'
      ) AS sp_ts
    FROM traffic_data_hourly h
    JOIN meta_ad_accounts a ON h.account_id = a.account_id AND a.is_active = true
    WHERE h.date >= (p_start_date - 2)
      AND h.date <= (p_end_date + 2)
  ),
  adjusted AS (
    SELECT
      spend,
      CASE
        -- Account is AHEAD of SP (e.g. Europe/Belgrade +4h):
        -- subtract the offset so early-morning SP hours go to previous day
        WHEN acc_ts > sp_ts THEN (sp_ts - (acc_ts - sp_ts))::date
        -- Account same or behind SP: keep SP date as-is
        ELSE sp_ts::date
      END AS business_date
    FROM hourly_sp
  )
  SELECT business_date AS sp_date, SUM(spend) AS total_spend
  FROM adjusted
  WHERE business_date >= p_start_date AND business_date <= p_end_date
  GROUP BY business_date;
$$;
