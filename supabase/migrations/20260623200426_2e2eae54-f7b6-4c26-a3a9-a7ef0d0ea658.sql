DROP FUNCTION IF EXISTS public.get_pacing_sales_match_stats();
DROP INDEX IF EXISTS public.idx_meta_campaign_status_campaign_key;
DROP INDEX IF EXISTS public.idx_sales_data_pacing_frontend_date;

CREATE OR REPLACE FUNCTION public.normalize_campaign_key(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT NULLIF(
    trim(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              lower(COALESCE(p, '')),
              '\s*(?:—|-|–)\s*(?:c[oó]pia|copy)(?:\s*\(?\d+\)?)?\s*$',
              '',
              'i'
            ),
            '\s*(?:—|-|–)\s*(?:top|xxx|old|kill|test|teste)\b.*$',
            '',
            'i'
          ),
          '\s*\(\s*\d+\s*\)\s*$',
          '',
          'i'
        ),
        '\s+',
        ' ',
        'g'
      )
    ),
    ''
  );
$function$;

GRANT EXECUTE ON FUNCTION public.normalize_campaign_key(text) TO anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_meta_campaign_status_campaign_key
ON public.meta_campaign_status (public.normalize_campaign_key(campaign_name))
INCLUDE (campaign_id, status, effective_status, account_id)
WHERE campaign_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_data_pacing_frontend_date
ON public.sales_data (date)
INCLUDE (id, utm_campaign, revenue, order_id, product_name)
WHERE utm_campaign IS NOT NULL AND revenue >= 200 AND revenue <= 1600;

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
      AND s.revenue BETWEEN 200 AND 1600
      AND COALESCE(s.product_name,'') !~* '(upsell|upgrade|last\s*chance|bump|order\s*bump|downsell)'
  ),
  traffic_day AS (
    SELECT
      td.account_id,
      public.normalize_campaign_key(td.campaign_name) AS campaign_key,
      SUM(td.spend)::numeric AS spend
    FROM public.traffic_data td
    WHERE td.date = p_date
      AND td.campaign_name IS NOT NULL
    GROUP BY td.account_id, public.normalize_campaign_key(td.campaign_name)
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
      LEFT JOIN traffic_day td
        ON td.account_id = m.account_id
       AND td.campaign_key = public.normalize_campaign_key(m.campaign_name)
     WHERE m.campaign_name IS NOT NULL
     ORDER BY
       public.normalize_campaign_key(m.campaign_name),
       CASE WHEN m.status = 'ACTIVE' OR m.effective_status = 'ACTIVE' THEN 0 ELSE 1 END,
       COALESCE(td.spend, 0) DESC,
       m.campaign_id
  ),
  rt_clicks AS (
    SELECT DISTINCT clickid
    FROM base
    WHERE clickid IS NOT NULL
  ),
  rt_candidates AS (
    SELECT
      r.clickid,
      COALESCE(m_campaign.campaign_id, m_adset.campaign_id, m_name.campaign_id) AS campaign_id,
      CASE
        WHEN m_campaign.campaign_id IS NOT NULL THEN 'rt_campaign_id'
        WHEN m_adset.campaign_id IS NOT NULL THEN 'rt_adset_id'
        WHEN m_name.campaign_id IS NOT NULL THEN 'rt_clone_name'
        ELSE NULL
      END AS matched_via,
      r.occurred_at
    FROM public.redtrack_events r
    JOIN rt_clicks rc ON rc.clickid = r.clickid
    LEFT JOIN public.meta_campaign_status m_campaign
      ON m_campaign.campaign_id = r.meta_campaign_id
    LEFT JOIN public.meta_campaign_status m_adset
      ON m_adset.campaign_id = r.meta_adset_id
    LEFT JOIN name_map m_name
      ON m_name.campaign_key = public.normalize_campaign_key(r.utm_campaign)
    WHERE r.meta_campaign_id IS NOT NULL
       OR r.meta_adset_id IS NOT NULL
       OR r.utm_campaign IS NOT NULL
  ),
  rt_map AS (
    SELECT DISTINCT ON (clickid)
           clickid,
           campaign_id,
           matched_via
      FROM rt_candidates
     WHERE campaign_id IS NOT NULL
     ORDER BY
       clickid,
       CASE matched_via
         WHEN 'rt_campaign_id' THEN 0
         WHEN 'rt_adset_id' THEN 1
         WHEN 'rt_clone_name' THEN 2
         ELSE 9
       END,
       occurred_at DESC
  ),
  resolved AS (
    SELECT
      b.sale_id,
      b.revenue,
      COALESCE(rm.campaign_id, nm.campaign_id) AS campaign_id,
      CASE
        WHEN rm.campaign_id IS NOT NULL THEN rm.matched_via
        WHEN nm.campaign_id IS NOT NULL THEN 'name'
        ELSE 'unmatched'
      END AS matched_via
    FROM base b
    LEFT JOIN rt_map rm ON rm.clickid = b.clickid
    LEFT JOIN name_map nm ON nm.campaign_key = b.campaign_key
  )
  SELECT campaign_id, COUNT(*)::bigint, SUM(revenue)::numeric, matched_via
    FROM resolved
   GROUP BY campaign_id, matched_via;
$function$;

GRANT EXECUTE ON FUNCTION public.resolve_pacing_sales_attribution(date) TO anon, authenticated, service_role;

CREATE FUNCTION public.get_pacing_sales_match_stats()
RETURNS TABLE(
  total_sales bigint,
  matched_sales bigint,
  unmatched_sales bigint,
  unmatched_revenue numeric,
  matched_by_name bigint,
  matched_by_rt bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH t AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date d),
  r AS (
    SELECT *
    FROM public.resolve_pacing_sales_attribution((SELECT d FROM t))
  )
  SELECT
    COALESCE(SUM(sales), 0)::bigint AS total_sales,
    COALESCE(SUM(sales) FILTER (WHERE campaign_id IS NOT NULL), 0)::bigint AS matched_sales,
    COALESCE(SUM(sales) FILTER (WHERE campaign_id IS NULL), 0)::bigint AS unmatched_sales,
    COALESCE(SUM(revenue) FILTER (WHERE campaign_id IS NULL), 0)::numeric AS unmatched_revenue,
    COALESCE(SUM(sales) FILTER (WHERE matched_via = 'name'), 0)::bigint AS matched_by_name,
    COALESCE(SUM(sales) FILTER (WHERE matched_via LIKE 'rt_%'), 0)::bigint AS matched_by_rt
  FROM r;
$function$;

GRANT EXECUTE ON FUNCTION public.get_pacing_sales_match_stats() TO anon, authenticated, service_role;