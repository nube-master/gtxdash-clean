
-- RPC 1: Retention 7d sparkline por VSL (todas de uma vez)
CREATE OR REPLACE FUNCTION public.get_vsl_retention_7d(
  p_operation_id uuid DEFAULT NULL
)
RETURNS TABLE(vsl_id text, date date, retention_pct numeric, plays bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH today_brt AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d)
  SELECT
    v.video_id AS vsl_id,
    v.date,
    CASE WHEN SUM(v.unique_views) > 0
      THEN (SUM(v.unique_views * v.retention_rate) / SUM(v.unique_views))::numeric
      ELSE 0 END AS retention_pct,
    SUM(v.unique_views)::bigint AS plays
  FROM public.vsl_data v
  WHERE v.date >= (SELECT d FROM today_brt) - 6
    AND v.date <= (SELECT d FROM today_brt)
    AND (p_operation_id IS NULL OR v.operation_id = p_operation_id)
  GROUP BY v.video_id, v.date
  ORDER BY v.video_id, v.date;
$$;

-- RPC 2: Top 3 criativos por VSL via share-of-views x traffic spend
CREATE OR REPLACE FUNCTION public.get_vsl_top_creatives(
  p_vsl_id text,
  p_start_date date,
  p_end_date date,
  p_operation_id uuid DEFAULT NULL,
  p_limit int DEFAULT 3
)
RETURNS TABLE(
  ad_name text,
  campaign_name text,
  attributed_spend_brl numeric,
  total_spend_brl numeric,
  impressions bigint,
  link_clicks bigint,
  share_pct numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH vturb_camp AS (
    SELECT v.date, v.meta_campaign_id, SUM(v.views)::numeric AS views
    FROM public.vturb_performance_daily v
    WHERE v.vsl_id = p_vsl_id
      AND v.date BETWEEN p_start_date AND p_end_date
      AND v.meta_campaign_id IS NOT NULL
      AND (p_operation_id IS NULL OR v.operation_id = p_operation_id)
    GROUP BY v.date, v.meta_campaign_id
  ),
  total_views_camp AS (
    SELECT v.date, v.meta_campaign_id, SUM(v.views)::numeric AS total_views
    FROM public.vturb_performance_daily v
    WHERE v.date BETWEEN p_start_date AND p_end_date
      AND v.meta_campaign_id IS NOT NULL
      AND (p_operation_id IS NULL OR v.operation_id = p_operation_id)
    GROUP BY v.date, v.meta_campaign_id
  ),
  cstatus AS (
    SELECT campaign_id, campaign_name FROM public.meta_campaign_status
    WHERE p_operation_id IS NULL OR operation_id = p_operation_id
  ),
  -- Spend at ad level per (campaign_name, ad_name, date)
  traffic_ads AS (
    SELECT t.campaign_name, t.ad_name, t.date,
      SUM(t.spend) AS spend, SUM(t.impressions) AS imps, SUM(t.inline_link_clicks) AS clicks
    FROM public.traffic_data t
    WHERE t.date BETWEEN p_start_date AND p_end_date
      AND (p_operation_id IS NULL OR t.operation_id = p_operation_id)
    GROUP BY t.campaign_name, t.ad_name, t.date
  ),
  joined AS (
    SELECT
      ta.ad_name,
      ta.campaign_name,
      (vc.views / NULLIF(tv.total_views, 0)) * ta.spend AS attr_spend,
      ta.spend AS total_spend,
      ((vc.views / NULLIF(tv.total_views, 0)) * ta.imps)::bigint AS attr_imps,
      ((vc.views / NULLIF(tv.total_views, 0)) * ta.clicks)::bigint AS attr_clicks,
      vc.views / NULLIF(tv.total_views, 0) AS share
    FROM vturb_camp vc
    JOIN total_views_camp tv ON tv.date = vc.date AND tv.meta_campaign_id = vc.meta_campaign_id
    JOIN cstatus cs ON cs.campaign_id = vc.meta_campaign_id
    JOIN traffic_ads ta ON ta.campaign_name = cs.campaign_name AND ta.date = vc.date
  )
  SELECT
    j.ad_name,
    MAX(j.campaign_name) AS campaign_name,
    COALESCE(SUM(j.attr_spend), 0)::numeric AS attributed_spend_brl,
    COALESCE(SUM(j.total_spend), 0)::numeric AS total_spend_brl,
    COALESCE(SUM(j.attr_imps), 0)::bigint AS impressions,
    COALESCE(SUM(j.attr_clicks), 0)::bigint AS link_clicks,
    (AVG(j.share) * 100)::numeric AS share_pct
  FROM joined j
  WHERE j.ad_name IS NOT NULL
  GROUP BY j.ad_name
  ORDER BY attributed_spend_brl DESC
  LIMIT p_limit;
$$;
