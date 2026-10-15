CREATE OR REPLACE FUNCTION public.get_spend_normalized_sp(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(sp_date date, total_spend numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH
  brt_timezones AS (
    SELECT unnest(ARRAY['America/Sao_Paulo', 'America/Bahia']) AS tz
  ),
  -- Latest commercial FX rate per currency (USD/EUR/etc -> BRL)
  fx AS (
    SELECT 'USD'::text AS currency,
           COALESCE((SELECT rate FROM public.exchange_rate_log ORDER BY created_at DESC LIMIT 1), 5.15) AS rate
    UNION ALL SELECT 'BRL', 1
    UNION ALL SELECT 'EUR', 5.60
    UNION ALL SELECT 'HUF', 0.015
  ),
  -- SP/Bahia accounts: traffic_data already in BRT (daily). Convert by account currency.
  sp_accounts_daily AS (
    SELECT t.date AS business_date,
           SUM(t.spend * COALESCE(fx.rate, 1)) AS spend
    FROM traffic_data t
    JOIN meta_ad_accounts a ON t.account_id = a.account_id AND a.is_active = true
    LEFT JOIN fx ON fx.currency = COALESCE(a.currency, 'BRL')
    WHERE a.timezone IN (SELECT tz FROM brt_timezones)
      AND t.date >= p_start_date
      AND t.date <= p_end_date
      AND (p_operation_id IS NULL OR t.operation_id = p_operation_id)
      AND (p_operation_id IS NULL OR a.operation_id = p_operation_id)
    GROUP BY t.date
  ),
  -- Non-SP accounts: traffic_data_hourly already in BRT date+hour. Convert by account currency.
  non_sp_hourly AS (
    SELECT h.date AS business_date,
           SUM(h.spend * COALESCE(fx.rate, 1)) AS spend
    FROM traffic_data_hourly h
    JOIN meta_ad_accounts a ON h.account_id = a.account_id AND a.is_active = true
    LEFT JOIN fx ON fx.currency = COALESCE(a.currency, 'BRL')
    WHERE a.timezone NOT IN (SELECT tz FROM brt_timezones)
      AND h.date >= p_start_date
      AND h.date <= p_end_date
      AND (p_operation_id IS NULL OR h.operation_id = p_operation_id)
      AND (p_operation_id IS NULL OR a.operation_id = p_operation_id)
    GROUP BY h.date
  ),
  combined AS (
    SELECT business_date, spend FROM sp_accounts_daily
    UNION ALL
    SELECT business_date, spend FROM non_sp_hourly
  )
  SELECT business_date AS sp_date, SUM(spend) AS total_spend
  FROM combined
  WHERE business_date >= p_start_date AND business_date <= p_end_date
  GROUP BY business_date;
$function$;