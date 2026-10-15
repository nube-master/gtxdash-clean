CREATE OR REPLACE FUNCTION public.get_vsl_spend_breakdown(
  p_start_date date,
  p_end_date date,
  p_operation_id uuid DEFAULT NULL
)
RETURNS TABLE(vsl_id text, spend_brl numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH vturb_camp AS (
    SELECT v.vsl_id, v.date, v.meta_campaign_id, SUM(v.views)::numeric AS views
    FROM public.vturb_performance_daily v
    WHERE v.date >= p_start_date AND v.date <= p_end_date
      AND v.meta_campaign_id IS NOT NULL
      AND (p_operation_id IS NULL OR v.operation_id = p_operation_id)
    GROUP BY v.vsl_id, v.date, v.meta_campaign_id
  ),
  -- Total views per (campaign,date) so we can compute share
  total_per_camp_day AS (
    SELECT date, meta_campaign_id, SUM(views) AS total_views
    FROM vturb_camp GROUP BY date, meta_campaign_id
  ),
  -- Resolve campaign_id -> campaign_name
  cstatus AS (
    SELECT campaign_id, campaign_name
    FROM public.meta_campaign_status
    WHERE p_operation_id IS NULL OR operation_id = p_operation_id
  ),
  -- Spend per (campaign_name, date)
  traffic AS (
    SELECT t.campaign_name, t.date, SUM(t.spend) AS spend
    FROM public.traffic_data t
    WHERE t.date >= p_start_date AND t.date <= p_end_date
      AND (p_operation_id IS NULL OR t.operation_id = p_operation_id)
    GROUP BY t.campaign_name, t.date
  ),
  joined AS (
    SELECT
      vc.vsl_id,
      (vc.views / NULLIF(tpc.total_views, 0)) * COALESCE(tr.spend, 0) AS attributed_spend
    FROM vturb_camp vc
    JOIN total_per_camp_day tpc
      ON tpc.date = vc.date AND tpc.meta_campaign_id = vc.meta_campaign_id
    LEFT JOIN cstatus cs ON cs.campaign_id = vc.meta_campaign_id
    LEFT JOIN traffic tr ON tr.campaign_name = cs.campaign_name AND tr.date = vc.date
  )
  SELECT vsl_id, COALESCE(SUM(attributed_spend), 0)::numeric AS spend_brl
  FROM joined
  GROUP BY vsl_id;
$function$;