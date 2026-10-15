DROP FUNCTION IF EXISTS public.get_spend_normalized_sp(date, date, uuid);

CREATE OR REPLACE FUNCTION public.get_spend_normalized_sp(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(operation_id uuid, total_spend numeric, impressions bigint, clicks bigint, landing_page_views bigint, initiated_checkouts bigint, vsl_plays bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        t.operation_id,
        COALESCE(SUM(t.spend), 0)::numeric as total_spend,
        COALESCE(SUM(t.impressions), 0)::bigint as impressions,
        COALESCE(SUM(t.clicks), 0)::bigint as clicks,
        COALESCE(SUM(t.landing_page_views), 0)::bigint as landing_page_views,
        COALESCE(SUM(t.initiated_checkouts), 0)::bigint as initiated_checkouts,
        COALESCE(SUM(t.vsl_plays), 0)::bigint as vsl_plays
    FROM public.traffic_data_hourly t
    WHERE t.date >= p_start_date 
      AND t.date <= p_end_date
      AND (p_operation_id IS NULL OR t.operation_id = p_operation_id)
    GROUP BY t.operation_id;
END;
$function$;
