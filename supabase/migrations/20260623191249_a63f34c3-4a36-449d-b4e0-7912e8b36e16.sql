CREATE INDEX IF NOT EXISTS idx_redtrack_events_clickid_meta_campaign_recent
ON public.redtrack_events (clickid, occurred_at DESC)
INCLUDE (meta_campaign_id)
WHERE clickid IS NOT NULL AND meta_campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_meta_campaign_status_campaign_key
ON public.meta_campaign_status (public.normalize_campaign_key(campaign_name))
INCLUDE (campaign_id)
WHERE campaign_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_traffic_data_pacing_daily
ON public.traffic_data (date, account_id, campaign_name)
INCLUDE (spend, impressions, inline_link_clicks);

CREATE INDEX IF NOT EXISTS idx_sales_data_pacing_frontend_date
ON public.sales_data (date)
INCLUDE (id, utm_campaign, revenue, order_id, product_name)
WHERE utm_campaign IS NOT NULL AND revenue >= 900 AND revenue <= 1600;

CREATE OR REPLACE FUNCTION public.resolve_pacing_sales_attribution(p_date date)
RETURNS TABLE(campaign_id text, sales bigint, revenue numeric, matched_via text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT
      s.id AS sale_id,
      s.utm_campaign,
      s.revenue,
      public.normalize_campaign_key(s.utm_campaign) AS campaign_key,
      CASE WHEN s.order_id LIKE 'rt:%' THEN substring(s.order_id FROM 4) END AS clickid
    FROM public.sales_data s
    WHERE s.date = p_date
      AND s.utm_campaign IS NOT NULL
      AND s.revenue BETWEEN 900 AND 1600
      AND COALESCE(s.product_name,'') !~* '(upsell|upgrade|last\s*chance|bump|order\s*bump)'
  ),
  sale_keys AS (
    SELECT DISTINCT campaign_key
    FROM base
    WHERE campaign_key IS NOT NULL
  ),
  name_map AS (
    SELECT DISTINCT ON (public.normalize_campaign_key(m.campaign_name))
           public.normalize_campaign_key(m.campaign_name) AS campaign_key,
           m.campaign_id
      FROM public.meta_campaign_status m
      JOIN sale_keys sk ON sk.campaign_key = public.normalize_campaign_key(m.campaign_name)
     WHERE m.campaign_name IS NOT NULL
     ORDER BY public.normalize_campaign_key(m.campaign_name), m.campaign_id
  ),
  rt_clicks AS (
    SELECT DISTINCT clickid
    FROM base
    WHERE clickid IS NOT NULL
  ),
  rt_map AS (
    SELECT DISTINCT ON (r.clickid)
           r.clickid,
           r.meta_campaign_id AS campaign_id
      FROM public.redtrack_events r
      JOIN rt_clicks rc ON rc.clickid = r.clickid
     WHERE r.meta_campaign_id IS NOT NULL
     ORDER BY r.clickid, r.occurred_at DESC
  ),
  resolved AS (
    SELECT
      b.sale_id,
      b.revenue,
      COALESCE(nm.campaign_id, rm.campaign_id) AS campaign_id,
      CASE
        WHEN nm.campaign_id IS NOT NULL THEN 'name'
        WHEN rm.campaign_id IS NOT NULL THEN 'rt_id'
        ELSE 'unmatched'
      END AS matched_via
    FROM base b
    LEFT JOIN name_map nm ON nm.campaign_key = b.campaign_key
    LEFT JOIN rt_map rm ON rm.clickid = b.clickid
  )
  SELECT campaign_id, COUNT(*)::bigint, SUM(revenue)::numeric, matched_via
    FROM resolved
   GROUP BY campaign_id, matched_via;
$function$;

GRANT EXECUTE ON FUNCTION public.resolve_pacing_sales_attribution(date) TO authenticated, service_role;