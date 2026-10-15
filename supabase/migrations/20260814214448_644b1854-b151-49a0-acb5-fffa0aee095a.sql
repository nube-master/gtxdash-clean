DROP FUNCTION IF EXISTS public.get_spend_normalized_sp(date, date, uuid);

CREATE OR REPLACE FUNCTION public.get_spend_normalized_sp(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(sp_date date, total_spend numeric, impressions bigint, clicks bigint, initiated_checkouts bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = public
AS $function$
  WITH t AS (
    SELECT generate_series(p_start_date, p_end_date, '1 day'::interval)::date AS d
  ),
  daily_meta AS (
    SELECT
      td.date,
      SUM(td.spend)::numeric as meta_spend,
      SUM(td.impressions)::bigint as meta_impressions,
      SUM(td.clicks)::bigint as meta_clicks,
      SUM(COALESCE(td.initiate_checkout, 0) + COALESCE(td.fb_pixel_initiate_checkout, 0))::bigint as meta_ic
    FROM public.traffic_data td
    WHERE td.date >= p_start_date AND td.date <= p_end_date
      AND (p_operation_id IS NULL OR td.operation_id = p_operation_id)
    GROUP BY td.date
  ),
  daily_hourly AS (
    SELECT
      h.date,
      SUM(h.spend)::numeric as hourly_spend,
      SUM(h.impressions)::bigint as hourly_impressions,
      SUM(h.clicks)::bigint as hourly_clicks,
      -- initiated_checkouts column does not exist, so we default to 0
      0::bigint as hourly_ic 
    FROM public.traffic_data_hourly h
    WHERE h.date >= p_start_date AND h.date <= p_end_date
      AND (p_operation_id IS NULL OR h.operation_id = p_operation_id)
    GROUP BY h.date
  )
  SELECT
    t.d,
    GREATEST(COALESCE(m.meta_spend, 0), COALESCE(h.hourly_spend, 0))::numeric,
    GREATEST(COALESCE(m.meta_impressions, 0), COALESCE(h.hourly_impressions, 0))::bigint,
    GREATEST(COALESCE(m.meta_clicks, 0), COALESCE(h.hourly_clicks, 0))::bigint,
    GREATEST(COALESCE(m.meta_ic, 0), COALESCE(h.hourly_ic, 0))::bigint
  FROM t
  LEFT JOIN daily_meta m ON m.date = t.d
  LEFT JOIN daily_hourly h ON h.date = t.d;
$function$;
