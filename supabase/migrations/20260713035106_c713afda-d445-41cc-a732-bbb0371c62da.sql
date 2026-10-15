
CREATE OR REPLACE FUNCTION public.get_pacing_campaigns_for_range(d_start date, d_end date)
 RETURNS TABLE(campaign_id text, campaign_name text, account_id text, account_name text, status text, effective_status text, daily_budget numeric, spend_today numeric, spend_yesterday numeric, impressions_today bigint, clicks_today bigint, sales_today bigint, revenue_today numeric, sales_yesterday bigint, revenue_yesterday numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH
  bounds AS (
    SELECT
      LEAST(d_start, d_end)::date AS start_date,
      GREATEST(d_start, d_end)::date AS end_date,
      (now() AT TIME ZONE 'America/Sao_Paulo')::date AS today_brt
  ),
  active_accounts AS (
    SELECT DISTINCT maa.account_id, maa.account_name
      FROM public.meta_ad_accounts maa
     WHERE maa.is_active = true
       AND maa.1=1
  ),
  td_range AS (
    SELECT account_id, campaign_name,
           SUM(spend)::numeric AS spend,
           SUM(impressions)::bigint AS impressions,
           SUM(inline_link_clicks)::bigint AS clicks
      FROM public.traffic_data, bounds
     WHERE date BETWEEN bounds.start_date AND bounds.end_date
     GROUP BY account_id, campaign_name
  ),
  td_prev AS (
    SELECT account_id, campaign_name, SUM(spend)::numeric AS spend
      FROM public.traffic_data, bounds
     WHERE date BETWEEN bounds.start_date - (bounds.end_date - bounds.start_date + 1) AND bounds.start_date - 1
     GROUP BY account_id, campaign_name
  ),
  status_actions_range AS (
    SELECT DISTINCT pal.account_id, pal.campaign_id
      FROM public.pacing_action_log pal, bounds
     WHERE (pal.triggered_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN bounds.start_date AND bounds.end_date
       AND pal.action_type IN ('pause', 'resume')
       AND pal.success = true
       AND pal.dry_run = false
  ),
  range_days AS (
    SELECT d::date AS d FROM bounds, generate_series(bounds.start_date, bounds.end_date, '1 day'::interval) AS d
  ),
  prev_days AS (
    SELECT d::date AS d
      FROM bounds, generate_series(bounds.start_date - (bounds.end_date - bounds.start_date + 1), bounds.start_date - 1, '1 day'::interval) AS d
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
  ),
  mcs_scored AS (
    SELECT
      mcs.*,
      COALESCE(td_range.spend, 0) AS range_spend_for_sort,
      ROW_NUMBER() OVER (
        PARTITION BY mcs.account_id, mcs.campaign_id
        ORDER BY
          CASE WHEN mcs.status = 'ACTIVE' OR mcs.effective_status = 'ACTIVE' THEN 0 ELSE 1 END,
          COALESCE(s_range.sales, 0) DESC,
          COALESCE(td_range.spend, 0) DESC,
          COALESCE(NULLIF(mcs.daily_budget, 0), mcs.lifetime_budget, 0) DESC,
          mcs.updated_at DESC NULLS LAST,
          mcs.campaign_id
      ) AS rn
    FROM public.meta_campaign_status mcs
    JOIN active_accounts aa ON aa.account_id = mcs.account_id
    LEFT JOIN td_range ON td_range.account_id = mcs.account_id AND td_range.campaign_name = mcs.campaign_name
    LEFT JOIN status_actions_range sar ON sar.account_id = mcs.account_id AND sar.campaign_id = mcs.campaign_id
    LEFT JOIN s_range ON s_range.campaign_id = mcs.campaign_id
    CROSS JOIN bounds
    -- ATIVIDADE REAL na janela: gasto, venda ou ação registrada.
    -- Removido fallback "ACTIVE hoje sem gasto" que trazia campanhas antigas
    -- de projetos que nem estão mais rodando quando o range inclui hoje.
    WHERE COALESCE(mcs.effective_status, mcs.status, 'UNKNOWN') <> 'ARCHIVED'
      AND (
        COALESCE(td_range.spend, 0) > 0
        OR COALESCE(s_range.revenue, 0) > 0
        OR sar.campaign_id IS NOT NULL
      )
  ),
  mcs_dedup AS (
    SELECT * FROM mcs_scored WHERE rn = 1
  )
  SELECT mcs.campaign_id, mcs.campaign_name, mcs.account_id, aa.account_name,
         mcs.status, mcs.effective_status,
         COALESCE(NULLIF(mcs.daily_budget, 0), mcs.lifetime_budget, 0) AS daily_budget,
         COALESCE(td_range.spend, 0), COALESCE(td_prev.spend, 0),
         COALESCE(td_range.impressions, 0), COALESCE(td_range.clicks, 0),
         COALESCE(s_range.sales, 0), COALESCE(s_range.revenue, 0),
         COALESCE(s_prev.sales, 0),  COALESCE(s_prev.revenue, 0)
    FROM mcs_dedup mcs
    JOIN active_accounts aa ON aa.account_id = mcs.account_id
    LEFT JOIN td_range ON td_range.account_id = mcs.account_id AND td_range.campaign_name = mcs.campaign_name
    LEFT JOIN td_prev  ON td_prev.account_id  = mcs.account_id AND td_prev.campaign_name  = mcs.campaign_name
    LEFT JOIN s_range  ON s_range.campaign_id = mcs.campaign_id
    LEFT JOIN s_prev   ON s_prev.campaign_id  = mcs.campaign_id
   ORDER BY COALESCE(td_range.spend, 0) DESC, mcs.campaign_name;
$function$;
