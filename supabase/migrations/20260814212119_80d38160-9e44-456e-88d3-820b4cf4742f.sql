DROP FUNCTION IF EXISTS public.get_live_pacing_campaigns(uuid);

CREATE OR REPLACE FUNCTION public.get_live_pacing_campaigns(p_operation_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id text, name text, account text, status text, effective_status text, spend numeric, revenue numeric, sales bigint, cpa numeric, roas numeric, impressions bigint, clicks bigint, ctr numeric, cpc numeric, yesterday_spend numeric, today_label text, operation_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = public
AS $function$
 #variable_conflict use_column
 BEGIN
   PERFORM public.require_op_access(p_operation_id);
   RETURN QUERY
 WITH t AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d),
   active_accounts AS (
     SELECT account_id, account_name FROM public.meta_ad_accounts
     WHERE is_active = true AND 1=1
       AND (p_operation_id IS NULL OR operation_id = p_operation_id)
   ),
   latest_snapshots AS (
     SELECT DISTINCT ON (s.account_id, s.campaign_id)
       s.account_id, s.campaign_id, s.campaign_name,
       s.spend_today_brl::numeric AS spend, s.revenue_today_brl::numeric AS revenue,
       s.impressions_today::bigint AS impressions,
       COALESCE(NULLIF(s.link_clicks_today,0), s.clicks_today)::bigint AS clicks,
       s.snapshot_at
     FROM public.pacing_campaign_hourly_snapshots s, t
     WHERE s.date = t.d AND (p_operation_id IS NULL OR s.operation_id = p_operation_id)
     ORDER BY s.account_id, s.campaign_id, s.snapshot_at DESC
   ),
   snap_by_name AS (
     SELECT account_id, campaign_name, SUM(spend)::numeric AS spend,
       SUM(impressions)::bigint AS impressions, SUM(clicks)::bigint AS clicks
     FROM latest_snapshots GROUP BY account_id, campaign_name
   ),
   td_today_raw AS (
     SELECT td.account_id, td.campaign_name, SUM(td.spend)::numeric AS spend,
       SUM(td.impressions)::bigint AS impressions, SUM(td.inline_link_clicks)::bigint AS clicks
     FROM public.traffic_data td, t
     WHERE td.date = t.d AND (p_operation_id IS NULL OR td.operation_id = p_operation_id)
     GROUP BY td.account_id, td.campaign_name
   ),
   td_today AS (
     SELECT tr.account_id, tr.campaign_name,
       CASE WHEN COALESCE(sb.spend,0) > tr.spend THEN sb.spend ELSE tr.spend END::numeric AS spend,
       GREATEST(COALESCE(sb.impressions,0), tr.impressions)::bigint AS impressions,
       GREATEST(COALESCE(sb.clicks,0), tr.clicks)::bigint AS clicks
     FROM td_today_raw tr
     LEFT JOIN snap_by_name sb ON sb.account_id=tr.account_id AND sb.campaign_name=tr.campaign_name
   ),
   td_yest AS (
     SELECT td.account_id, td.campaign_name, SUM(td.spend)::numeric AS spend
     FROM public.traffic_data td, t
     WHERE td.date = t.d - 1 AND (p_operation_id IS NULL OR td.operation_id = p_operation_id)
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
   ),
   mcs_filtered AS (
     SELECT * FROM public.meta_campaign_status
     WHERE COALESCE(UPPER(effective_status), UPPER(status), '') NOT IN ('ARCHIVED', 'DELETED')
       AND COALESCE(UPPER(status), '') NOT IN ('ARCHIVED', 'DELETED')
       AND (p_operation_id IS NULL OR operation_id = p_operation_id)
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
     (CASE WHEN COALESCE(td.clicks,0) > 0 THEN td.spend / td.clicks ELSE 0 END)::numeric AS cpc,
     COALESCE(ty.spend, 0)::numeric AS yesterday_spend,
     (SELECT d FROM t)::text AS today_label,
     m.operation_id
   FROM mcs_filtered m
   JOIN active_accounts a ON a.account_id = m.account_id
   LEFT JOIN td_today td ON td.account_id = m.account_id AND td.campaign_name = m.campaign_name
   LEFT JOIN td_yest ty ON ty.account_id = m.account_id AND ty.campaign_name = m.campaign_name
   LEFT JOIN s_today st ON st.campaign_id = m.campaign_id
   WHERE (COALESCE(td.spend, 0) > 0 OR m.status = 'ACTIVE' OR m.effective_status = 'ACTIVE' OR COALESCE(st.sales, 0) > 0);
 END;
$function$;