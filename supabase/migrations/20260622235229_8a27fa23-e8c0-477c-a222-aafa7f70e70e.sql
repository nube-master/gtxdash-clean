DROP FUNCTION IF EXISTS public.get_live_pacing_campaigns();
DROP FUNCTION IF EXISTS public.get_pacing_sales_match_stats();

-- Resolve campaign_id for each sale today (and yesterday) using a 2-tier strategy
CREATE OR REPLACE FUNCTION public.resolve_pacing_sales_attribution(p_date date)
RETURNS TABLE(campaign_id text, sales bigint, revenue numeric, matched_via text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH base AS (
    SELECT
      s.id AS sale_id,
      s.utm_campaign,
      s.revenue,
      CASE WHEN s.order_id LIKE 'rt:%' THEN substring(s.order_id FROM 4) END AS clickid
    FROM sales_data s
    WHERE date = p_date
      AND utm_campaign IS NOT NULL
      AND revenue BETWEEN 900 AND 1600
      AND COALESCE(product_name,'') !~* '(upsell|upgrade|last\s*chance|bump|order\s*bump)'
  ),
  by_name AS (
    SELECT b.sale_id, b.revenue,
           (SELECT m.campaign_id FROM meta_campaign_status m
             WHERE public.normalize_campaign_key(m.campaign_name) = public.normalize_campaign_key(b.utm_campaign)
             LIMIT 1) AS cid
      FROM base b
  ),
  by_rt AS (
    SELECT b.sale_id, b.revenue,
           (SELECT r.meta_campaign_id FROM redtrack_events r
             WHERE r.clickid = b.clickid AND r.meta_campaign_id IS NOT NULL
             ORDER BY r.occurred_at DESC LIMIT 1) AS cid
      FROM base b WHERE b.clickid IS NOT NULL
  ),
  resolved AS (
    SELECT bn.sale_id, bn.revenue,
           COALESCE(bn.cid, br.cid) AS campaign_id,
           CASE WHEN bn.cid IS NOT NULL THEN 'name'
                WHEN br.cid IS NOT NULL THEN 'rt_id'
                ELSE 'unmatched' END AS matched_via
      FROM by_name bn
      LEFT JOIN by_rt br USING (sale_id)
  )
  SELECT campaign_id, COUNT(*)::bigint, SUM(revenue)::numeric, matched_via
    FROM resolved
   GROUP BY campaign_id, matched_via;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_pacing_sales_attribution(date) TO authenticated, service_role;

CREATE FUNCTION public.get_live_pacing_campaigns()
 RETURNS TABLE(campaign_id text, campaign_name text, account_id text, account_name text, status text, effective_status text, daily_budget numeric, spend_today numeric, spend_yesterday numeric, impressions_today bigint, clicks_today bigint, sales_today bigint, revenue_today numeric, sales_yesterday bigint, revenue_yesterday numeric)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH t AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d),
  active_accounts AS (
    SELECT DISTINCT maa.account_id, maa.account_name
      FROM meta_ad_accounts maa
      JOIN traffic_data td ON td.account_id = maa.account_id
     WHERE maa.is_active = true AND maa.1=1
       AND td.date >= (SELECT d FROM t) - 30 AND td.spend > 0
  ),
  td_today AS (
    SELECT account_id, campaign_name,
           SUM(spend)::numeric AS spend, SUM(impressions)::bigint AS impressions, SUM(inline_link_clicks)::bigint AS clicks
      FROM traffic_data, t WHERE date = t.d GROUP BY account_id, campaign_name
  ),
  td_yest AS (
    SELECT account_id, campaign_name, SUM(spend)::numeric AS spend
      FROM traffic_data, t WHERE date = t.d - 1 GROUP BY account_id, campaign_name
  ),
  s_today AS (
    SELECT campaign_id, SUM(sales)::bigint AS sales, SUM(revenue)::numeric AS revenue
      FROM public.resolve_pacing_sales_attribution((SELECT d FROM t))
     WHERE campaign_id IS NOT NULL GROUP BY campaign_id
  ),
  s_yest AS (
    SELECT campaign_id, SUM(sales)::bigint AS sales, SUM(revenue)::numeric AS revenue
      FROM public.resolve_pacing_sales_attribution((SELECT d FROM t) - 1)
     WHERE campaign_id IS NOT NULL GROUP BY campaign_id
  )
  SELECT mcs.campaign_id, mcs.campaign_name, mcs.account_id, aa.account_name,
         mcs.status, mcs.effective_status, mcs.daily_budget,
         COALESCE(td_today.spend, 0), COALESCE(td_yest.spend, 0),
         COALESCE(td_today.impressions, 0), COALESCE(td_today.clicks, 0),
         COALESCE(s_today.sales, 0), COALESCE(s_today.revenue, 0),
         COALESCE(s_yest.sales, 0),  COALESCE(s_yest.revenue, 0)
    FROM meta_campaign_status mcs
    JOIN active_accounts aa ON aa.account_id = mcs.account_id
   LEFT JOIN td_today ON td_today.account_id = mcs.account_id AND td_today.campaign_name = mcs.campaign_name
   LEFT JOIN td_yest  ON td_yest.account_id  = mcs.account_id AND td_yest.campaign_name  = mcs.campaign_name
   LEFT JOIN s_today  ON s_today.campaign_id = mcs.campaign_id
   LEFT JOIN s_yest   ON s_yest.campaign_id  = mcs.campaign_id
   WHERE mcs.status = 'ACTIVE'
   ORDER BY COALESCE(td_today.spend, 0) DESC, mcs.campaign_name;
$function$;

GRANT EXECUTE ON FUNCTION public.get_live_pacing_campaigns() TO authenticated, service_role;

CREATE FUNCTION public.get_pacing_sales_match_stats()
RETURNS TABLE(total_sales bigint, matched_sales bigint, unmatched_sales bigint, unmatched_revenue numeric, matched_by_name bigint, matched_by_rt bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH t AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date d),
  r AS (SELECT * FROM public.resolve_pacing_sales_attribution((SELECT d FROM t)))
  SELECT
    COALESCE(SUM(sales), 0)::bigint AS total_sales,
    COALESCE(SUM(sales) FILTER (WHERE matched_via <> 'unmatched'), 0)::bigint AS matched_sales,
    COALESCE(SUM(sales) FILTER (WHERE matched_via = 'unmatched'), 0)::bigint AS unmatched_sales,
    COALESCE(SUM(revenue) FILTER (WHERE matched_via = 'unmatched'), 0)::numeric AS unmatched_revenue,
    COALESCE(SUM(sales) FILTER (WHERE matched_via = 'name'), 0)::bigint AS matched_by_name,
    COALESCE(SUM(sales) FILTER (WHERE matched_via = 'rt_id'), 0)::bigint AS matched_by_rt
  FROM r;
$$;

GRANT EXECUTE ON FUNCTION public.get_pacing_sales_match_stats() TO authenticated, service_role;