CREATE OR REPLACE FUNCTION public.get_live_pacing_campaigns(p_operation_id uuid DEFAULT NULL)
RETURNS TABLE (
  id text, name text, account text, status text, effective_status text,
  spend numeric, revenue numeric, sales bigint, cpa numeric, roas numeric,
  impressions bigint, clicks bigint, ctr numeric, cpc numeric,
  yesterday_spend numeric, today_label text, operation_id uuid,
  daily_budget numeric, account_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
 #variable_conflict use_column
 BEGIN
   PERFORM public.require_op_access(p_operation_id);
   RETURN QUERY
   WITH t AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d),
     active_accounts AS (
       SELECT account_id, account_name FROM public.meta_ad_accounts
       WHERE is_active = true
         AND account_status = 1
         AND (p_operation_id IS NULL OR operation_id = p_operation_id)
     ),
     recent_spend_campaigns AS (
       SELECT DISTINCT campaign_name, account_id
       FROM public.traffic_data, t
       WHERE date >= t.d - INTERVAL '2 days'
         AND spend > 0
         AND (p_operation_id IS NULL OR operation_id = p_operation_id)
     ),
     mcs_filtered AS (
       SELECT 
          m.campaign_id, 
          m.campaign_name, 
          m.account_id, 
          m.status, 
          m.effective_status, 
          m.operation_id,
          COALESCE(NULLIF(m.daily_budget,0), m.lifetime_budget, 0) as daily_budget
       FROM public.meta_campaign_status m
       JOIN active_accounts a ON a.account_id = m.account_id
       JOIN recent_spend_campaigns r ON r.account_id = m.account_id AND r.campaign_name = m.campaign_name
       -- FIX 2026-08-29: removido filtro ACTIVE-only.
       -- Pausadas com gasto nos últimos 2 dias DEVEM aparecer (auditoria) —
       -- o join com recent_spend_campaigns já limita a quem gastou.
     ),
     td_today AS (
       SELECT 
          td.account_id, 
          td.campaign_name, 
          SUM(td.spend_brl)::numeric AS spend,
          SUM(td.impressions)::bigint AS impressions, 
          SUM(td.inline_link_clicks)::bigint AS clicks
       FROM public.traffic_data td, t
       WHERE td.date = t.d 
         AND (p_operation_id IS NULL OR td.operation_id = p_operation_id)
       GROUP BY td.account_id, td.campaign_name
     ),
     td_yest AS (
       SELECT 
          td.account_id, 
          td.campaign_name, 
          SUM(td.spend_brl)::numeric AS spend
       FROM public.traffic_data td, t
       WHERE td.date = t.d - 1 
         AND (p_operation_id IS NULL OR td.operation_id = p_operation_id)
       GROUP BY td.account_id, td.campaign_name
     ),
     s_today AS (
       SELECT campaign_id, SUM(sales)::bigint AS sales, SUM(revenue)::numeric AS revenue
       FROM public.resolve_pacing_sales_attribution((SELECT d FROM t))
       WHERE campaign_id IS NOT NULL 
       GROUP BY campaign_id
     )
     SELECT
       m.campaign_id::text AS id,
       m.campaign_name::text AS name,
       a.account_name::text AS account,
       m.status::text,
       m.effective_status::text,
       COALESCE(td.spend, 0)::numeric AS spend,
       COALESCE(st.revenue, 0)::numeric AS revenue,
       COALESCE(st.sales, 0)::bigint AS sales,
       (CASE WHEN COALESCE(st.sales,0) > 0 THEN td.spend / st.sales ELSE 0 END)::numeric AS cpa,
       (CASE WHEN COALESCE(td.spend,0) > 0 THEN st.revenue / td.spend ELSE 0 END)::numeric AS roas,
       COALESCE(td.impressions, 0)::bigint AS impressions,
       COALESCE(td.clicks, 0)::bigint AS clicks,
       (CASE WHEN COALESCE(td.impressions,0) > 0 THEN (td.clicks::numeric / td.impressions::numeric) * 100 ELSE 0 END)::numeric AS ctr,
       (CASE WHEN COALESCE(td.clicks,0) > 0 THEN (td.spend / td.clicks) ELSE 0 END)::numeric AS cpc,
       COALESCE(ty.spend, 0)::numeric AS yesterday_spend,
       (SELECT d::text FROM t) AS today_label,
       m.operation_id,
       m.daily_budget,
       m.account_id::text AS account_id
     FROM mcs_filtered m
     JOIN active_accounts a ON a.account_id = m.account_id
     LEFT JOIN td_today td ON td.account_id = m.account_id AND td.campaign_name = m.campaign_name
     LEFT JOIN td_yest ty ON ty.account_id = m.account_id AND ty.campaign_name = m.campaign_name
     LEFT JOIN s_today st ON st.campaign_id = m.campaign_id;
 END;
$func$;