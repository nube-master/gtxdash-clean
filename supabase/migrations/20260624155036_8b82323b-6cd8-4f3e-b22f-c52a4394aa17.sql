
-- Índice geral por clickid (os índices existentes são parciais e não cobrem o JOIN da resolve_pacing_sales_attribution)
CREATE INDEX IF NOT EXISTS idx_redtrack_events_clickid_any
  ON public.redtrack_events (clickid)
  WHERE clickid IS NOT NULL;

-- Otimiza get_live_pacing_campaigns: troca o active_accounts pesado por uma leitura direta de meta_ad_accounts
CREATE OR REPLACE FUNCTION public.get_live_pacing_campaigns()
 RETURNS TABLE(campaign_id text, campaign_name text, account_id text, account_name text, status text, effective_status text, daily_budget numeric, spend_today numeric, spend_yesterday numeric, impressions_today bigint, clicks_today bigint, sales_today bigint, revenue_today numeric, sales_yesterday bigint, revenue_yesterday numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH t AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d),
  active_accounts AS (
    SELECT account_id, account_name
      FROM meta_ad_accounts
     WHERE is_active = true AND 1=1
  ),
  td_today AS (
    SELECT td.account_id, td.campaign_name,
           SUM(td.spend)::numeric AS spend,
           SUM(td.impressions)::bigint AS impressions,
           SUM(td.inline_link_clicks)::bigint AS clicks
      FROM traffic_data td, t
     WHERE td.date = t.d
     GROUP BY td.account_id, td.campaign_name
  ),
  td_yest AS (
    SELECT td.account_id, td.campaign_name, SUM(td.spend)::numeric AS spend
      FROM traffic_data td, t
     WHERE td.date = t.d - 1
     GROUP BY td.account_id, td.campaign_name
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
      OR COALESCE(td_today.spend, 0) > 0
   ORDER BY COALESCE(td_today.spend, 0) DESC, mcs.campaign_name;
$function$;
