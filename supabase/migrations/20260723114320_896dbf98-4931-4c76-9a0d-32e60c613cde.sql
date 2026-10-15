CREATE OR REPLACE FUNCTION public.get_traffic_spend_by_account_normalized(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(account_id text, date date, total_spend numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.require_op_access(p_operation_id);
  RETURN QUERY
  WITH brt_timezones AS (SELECT unnest(ARRAY['America/Sao_Paulo', 'America/Bahia']) AS tz),
  sp_accounts AS (
    SELECT t.account_id AS acc_id, t.date AS business_date, SUM(t.spend) AS spend
    FROM traffic_data t
    JOIN meta_ad_accounts a ON a.account_id = t.account_id AND a.is_active = true
    WHERE a.timezone IN (SELECT tz FROM brt_timezones)
      AND t.date BETWEEN p_start_date AND p_end_date
      AND (p_operation_id IS NULL OR t.operation_id = p_operation_id)
      AND (p_operation_id IS NULL OR a.operation_id = p_operation_id)
    GROUP BY t.account_id, t.date
  ),
  non_sp_accounts AS (
    SELECT h.account_id AS acc_id,
      (make_timestamp(extract(year from h.date)::int, extract(month from h.date)::int, extract(day from h.date)::int, h.hour, 30, 0) AT TIME ZONE a.timezone AT TIME ZONE 'America/Sao_Paulo')::date AS business_date,
      SUM(h.spend) AS spend
    FROM traffic_data_hourly h
    JOIN meta_ad_accounts a ON a.account_id = h.account_id AND a.is_active = true
    WHERE a.timezone NOT IN (SELECT tz FROM brt_timezones)
      AND h.date BETWEEN (p_start_date - 2) AND (p_end_date + 2)
      AND (p_operation_id IS NULL OR h.operation_id = p_operation_id)
      AND (p_operation_id IS NULL OR a.operation_id = p_operation_id)
    GROUP BY h.account_id, business_date
  ),
  combined AS (
    SELECT acc_id, business_date, spend FROM sp_accounts
    UNION ALL
    SELECT acc_id, business_date, spend FROM non_sp_accounts
    WHERE business_date BETWEEN p_start_date AND p_end_date
  )
  SELECT c.acc_id AS account_id, c.business_date AS date, COALESCE(SUM(c.spend), 0) AS total_spend
  FROM combined c
  WHERE c.business_date BETWEEN p_start_date AND p_end_date
  GROUP BY c.acc_id, c.business_date;
END;
$function$;