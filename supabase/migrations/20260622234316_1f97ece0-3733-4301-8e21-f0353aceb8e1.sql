DROP FUNCTION IF EXISTS public.get_live_pacing_campaigns();

CREATE FUNCTION public.get_live_pacing_campaigns()
 RETURNS TABLE(campaign_id text, campaign_name text, account_id text, account_name text, status text, effective_status text, daily_budget numeric, spend_today numeric, spend_yesterday numeric, impressions_today bigint, clicks_today bigint, sales_today bigint, revenue_today numeric, sales_yesterday bigint, revenue_yesterday numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH today_brt AS (
    SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d
  ),
  active_accounts AS (
    SELECT DISTINCT maa.account_id, maa.account_name
      FROM meta_ad_accounts maa
      JOIN traffic_data td ON td.account_id = maa.account_id
     WHERE maa.is_active = true
       AND maa.1=1
       AND td.date >= (SELECT d FROM today_brt) - 30
       AND td.spend > 0
  ),
  td_today AS (
    SELECT account_id, campaign_name,
           SUM(spend)::numeric AS spend,
           SUM(impressions)::bigint AS impressions,
           SUM(inline_link_clicks)::bigint AS clicks
      FROM traffic_data, today_brt
     WHERE date = today_brt.d
     GROUP BY account_id, campaign_name
  ),
  td_yest AS (
    SELECT account_id, campaign_name, SUM(spend)::numeric AS spend
      FROM traffic_data, today_brt
     WHERE date = today_brt.d - 1
     GROUP BY account_id, campaign_name
  ),
  s_today AS (
    SELECT utm_campaign, COUNT(*)::bigint AS sales, SUM(revenue)::numeric AS revenue
      FROM sales_data, today_brt
     WHERE date = today_brt.d
       AND utm_campaign IS NOT NULL
       AND revenue BETWEEN 900 AND 1600
       AND COALESCE(product_name,'') !~* '(upsell|upgrade|last\s*chance|bump|order\s*bump)'
     GROUP BY utm_campaign
  ),
  s_yest AS (
    SELECT utm_campaign, COUNT(*)::bigint AS sales, SUM(revenue)::numeric AS revenue
      FROM sales_data, today_brt
     WHERE date = today_brt.d - 1
       AND utm_campaign IS NOT NULL
       AND revenue BETWEEN 900 AND 1600
       AND COALESCE(product_name,'') !~* '(upsell|upgrade|last\s*chance|bump|order\s*bump)'
     GROUP BY utm_campaign
  )
  SELECT
    mcs.campaign_id, mcs.campaign_name, mcs.account_id, aa.account_name,
    mcs.status, mcs.effective_status, mcs.daily_budget,
    COALESCE(td_today.spend, 0), COALESCE(td_yest.spend, 0),
    COALESCE(td_today.impressions, 0), COALESCE(td_today.clicks, 0),
    COALESCE(s_today.sales, 0), COALESCE(s_today.revenue, 0),
    COALESCE(s_yest.sales, 0),  COALESCE(s_yest.revenue, 0)
    FROM meta_campaign_status mcs
    JOIN active_accounts aa ON aa.account_id = mcs.account_id
   LEFT JOIN td_today ON td_today.account_id = mcs.account_id AND td_today.campaign_name = mcs.campaign_name
   LEFT JOIN td_yest  ON td_yest.account_id  = mcs.account_id AND td_yest.campaign_name  = mcs.campaign_name
   LEFT JOIN s_today  ON s_today.utm_campaign = mcs.campaign_name
   LEFT JOIN s_yest   ON s_yest.utm_campaign  = mcs.campaign_name
   WHERE mcs.status = 'ACTIVE'
   ORDER BY COALESCE(td_today.spend, 0) DESC, mcs.campaign_name;
$function$;

GRANT EXECUTE ON FUNCTION public.get_live_pacing_campaigns() TO authenticated, service_role;