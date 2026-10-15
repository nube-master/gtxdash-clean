CREATE OR REPLACE FUNCTION public.get_pacing_campaigns_for_range(d_start date, d_end date)
 RETURNS TABLE(campaign_id text, campaign_name text, account_id text, account_name text, status text, effective_status text, daily_budget numeric, spend_today numeric, spend_yesterday numeric, impressions_today bigint, clicks_today bigint, sales_today bigint, revenue_today numeric, sales_yesterday bigint, revenue_yesterday numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH
  active_accounts AS (
    SELECT DISTINCT maa.account_id, maa.account_name
      FROM meta_ad_accounts maa
      JOIN traffic_data td ON td.account_id = maa.account_id
     WHERE maa.is_active = true AND maa.1=1
       AND td.date >= d_start - 30 AND td.spend > 0
  ),
  td_range AS (
    SELECT account_id, campaign_name,
           SUM(spend)::numeric AS spend,
           SUM(impressions)::bigint AS impressions,
           SUM(inline_link_clicks)::bigint AS clicks
      FROM traffic_data
     WHERE date BETWEEN d_start AND d_end
     GROUP BY account_id, campaign_name
  ),
  td_prev AS (
    SELECT account_id, campaign_name, SUM(spend)::numeric AS spend
      FROM traffic_data
     WHERE date BETWEEN d_start - (d_end - d_start + 1) AND d_start - 1
     GROUP BY account_id, campaign_name
  ),
  range_days AS (
    SELECT d::date AS d FROM generate_series(d_start, d_end, '1 day'::interval) AS d
  ),
  prev_days AS (
    SELECT d::date AS d FROM generate_series(d_start - (d_end - d_start + 1), d_start - 1, '1 day'::interval) AS d
  ),
  s_range AS (
    SELECT r.campaign_id, SUM(r.sales)::bigint AS sales, SUM(r.revenue)::numeric AS revenue
      FROM range_days rd
      CROSS JOIN LATERAL public.resolve_pacing_sales_attribution(rd.d) AS r
     WHERE r.campaign_id IS NOT NULL
     GROUP BY r.campaign_id
  ),
  s_prev AS (
    SELECT r.campaign_id, SUM(r.sales)::bigint AS sales, SUM(r.revenue)::numeric AS revenue
      FROM prev_days rd
      CROSS JOIN LATERAL public.resolve_pacing_sales_attribution(rd.d) AS r
     WHERE r.campaign_id IS NOT NULL
     GROUP BY r.campaign_id
  )
  SELECT mcs.campaign_id, mcs.campaign_name, mcs.account_id, aa.account_name,
         mcs.status, mcs.effective_status, mcs.daily_budget,
         COALESCE(td_range.spend, 0), COALESCE(td_prev.spend, 0),
         COALESCE(td_range.impressions, 0), COALESCE(td_range.clicks, 0),
         COALESCE(s_range.sales, 0), COALESCE(s_range.revenue, 0),
         COALESCE(s_prev.sales, 0),  COALESCE(s_prev.revenue, 0)
    FROM meta_campaign_status mcs
    JOIN active_accounts aa ON aa.account_id = mcs.account_id
   LEFT JOIN td_range ON td_range.account_id = mcs.account_id AND td_range.campaign_name = mcs.campaign_name
   LEFT JOIN td_prev  ON td_prev.account_id  = mcs.account_id AND td_prev.campaign_name  = mcs.campaign_name
   LEFT JOIN s_range  ON s_range.campaign_id = mcs.campaign_id
   LEFT JOIN s_prev   ON s_prev.campaign_id  = mcs.campaign_id
   WHERE mcs.status = 'ACTIVE'
      OR COALESCE(td_range.spend, 0) > 0
   ORDER BY COALESCE(td_range.spend, 0) DESC, mcs.campaign_name;
$function$;

GRANT EXECUTE ON FUNCTION public.get_pacing_campaigns_for_range(date, date) TO authenticated, service_role;