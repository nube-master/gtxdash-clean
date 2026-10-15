
CREATE OR REPLACE FUNCTION public.get_spend_normalized_sp(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(sp_date date, total_spend numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH 
  today_sp AS (
    SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d
  ),
  brt_timezones AS (
    SELECT unnest(ARRAY['America/Sao_Paulo', 'America/Bahia']) AS tz
  ),
  sp_accounts_daily AS (
    SELECT t.date AS business_date, SUM(t.spend) AS spend
    FROM traffic_data t
    JOIN meta_ad_accounts a ON t.account_id = a.account_id AND a.is_active = true
    WHERE a.timezone IN (SELECT tz FROM brt_timezones)
      AND t.date >= p_start_date
      AND t.date <= p_end_date
      AND (p_operation_id IS NULL OR t.operation_id = p_operation_id)
      AND (p_operation_id IS NULL OR a.operation_id = p_operation_id)
    GROUP BY t.date
  ),
  non_sp_hourly AS (
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
    WHERE a.timezone NOT IN (SELECT tz FROM brt_timezones)
      AND h.date >= (p_start_date - 2)
      AND h.date <= (p_end_date + 2)
      AND (p_operation_id IS NULL OR h.operation_id = p_operation_id)
      AND (p_operation_id IS NULL OR a.operation_id = p_operation_id)
    GROUP BY business_date
  ),
  non_sp_realtime_today AS (
    SELECT 
      r.sp_date AS business_date,
      SUM(r.spend_brl) AS spend
    FROM meta_spend_realtime_safe r
    JOIN meta_ad_accounts a ON r.account_id = a.account_id AND a.is_active = true
    WHERE a.timezone NOT IN (SELECT tz FROM brt_timezones)
      AND r.sp_date = (SELECT d FROM today_sp)
      AND r.sp_date >= p_start_date
      AND r.sp_date <= p_end_date
      AND (p_operation_id IS NULL OR r.operation_id = p_operation_id)
      AND (p_operation_id IS NULL OR a.operation_id = p_operation_id)
    GROUP BY r.sp_date
  ),
  combined AS (
    SELECT business_date, spend FROM sp_accounts_daily
    UNION ALL
    SELECT business_date, spend FROM non_sp_hourly
    WHERE business_date >= p_start_date 
      AND business_date <= p_end_date
      AND business_date != (SELECT d FROM today_sp)
    UNION ALL
    SELECT business_date, spend FROM non_sp_realtime_today
  )
  SELECT business_date AS sp_date, SUM(spend) AS total_spend
  FROM combined
  WHERE business_date >= p_start_date AND business_date <= p_end_date
  GROUP BY business_date;
$function$;
