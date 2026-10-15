-- Add missing metrics to daily_totals_snapshot
ALTER TABLE public.daily_totals_snapshot ADD COLUMN IF NOT EXISTS total_lp_views integer DEFAULT 0;
ALTER TABLE public.daily_totals_snapshot ADD COLUMN IF NOT EXISTS vsl_plays integer DEFAULT 0;

-- Drop function because return type changed
DROP FUNCTION IF EXISTS public.get_total_traffic_metrics(date, date, uuid);

-- Recreate get_total_traffic_metrics to include VSL plays
CREATE OR REPLACE FUNCTION public.get_total_traffic_metrics(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(total_link_clicks bigint, total_landing_page_views bigint, total_vsl_plays bigint, total_impressions bigint, total_clicks bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(inline_link_clicks), 0)::BIGINT as total_link_clicks,
    COALESCE(SUM(landing_page_views), 0)::BIGINT as total_landing_page_views,
    COALESCE(SUM(vsl_plays), 0)::BIGINT as total_vsl_plays,
    COALESCE(SUM(impressions), 0)::BIGINT as total_impressions,
    COALESCE(SUM(clicks), 0)::BIGINT as total_clicks
  FROM public.traffic_data
  WHERE date >= p_start_date 
    AND date <= p_end_date
    AND (p_operation_id IS NULL OR operation_id = p_operation_id);
END;
$function$;

-- Grant access (required after drop/recreate)
GRANT EXECUTE ON FUNCTION public.get_total_traffic_metrics(date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_total_traffic_metrics(date, date, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_total_traffic_metrics(date, date, uuid) TO anon;
