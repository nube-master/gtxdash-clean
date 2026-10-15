CREATE OR REPLACE FUNCTION public.get_live_pacing_campaigns(p_operation_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(campaign_id text, campaign_name text, account_id text, account_name text, status text, effective_status text, daily_budget numeric, spend_today numeric, spend_yesterday numeric, impressions_today bigint, clicks_today bigint, sales_today bigint, revenue_today numeric, sales_yesterday bigint, revenue_yesterday numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH t AS (
    SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d
  ),
  active_accounts AS (
    SELECT account_id, account_name
    FROM public.meta_ad_accounts
    WHERE is_active = true
      AND 1=1
      AND (p_operation_id IS NULL OR operation_id = p_operation_id)
  ),
  latest_snapshots AS (
    SELECT DISTINCT ON (s.account_id, s.campaign_id)
      s.account_id,
      s.campaign_id,
      s.campaign_name,
      s.spend_today_brl::numeric AS spend,
      s.revenue_today_brl::numeric AS revenue,
      s.impressions_today::bigint AS impressions,
      COALESCE(NULLIF(s.link_clicks_today,0), s.clicks_today)::bigint AS clicks,
      s.snapshot_at
    FROM public.pacing_campaign_hourly_snapshots s, t
    WHERE s.date = t.d
      AND (p_operation_id IS NULL OR s.operation_id = p_operation_id)
    ORDER BY s.account_id, s.campaign_id, s.snapshot_at DESC
  ),
  snap_by_name AS (
    SELECT account_id, campaign_name,
           SUM(spend)::numeric AS spend,
           SUM(impressions)::bigint AS impressions,
           SUM(clicks)::bigint AS clicks
    FROM latest_snapshots
    GROUP BY account_id, campaign_name
  ),
  td_today_raw AS (
    SELECT td.account_id, td.campaign_name,
           SUM(td.spend)::numeric AS spend,
           SUM(td.impressions)::bigint AS impressions,
           SUM(td.inline_link_clicks)::bigint AS clicks
    FROM public.traffic_data td, t
    WHERE td.date = t.d
      AND (p_operation_id IS NULL OR td.operation_id = p_operation_id)
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
    WHERE td.date = t.d - 1
      AND (p_operation_id IS NULL OR td.operation_id = p_operation_id)
    GROUP BY td.account_id, td.campaign_name
  ),
  s_today AS (
    SELECT campaign_id, SUM(sales)::bigint AS sales, SUM(revenue)::numeric AS revenue
    FROM public.resolve_pacing_sales_attribution((SELECT d FROM t))
    WHERE campaign_id IS NOT NULL
    GROUP BY campaign_id
  ),
  s_yest AS (
    SELECT campaign_id, SUM(sales)::bigint AS sales, SUM(revenue)::numeric AS revenue
    FROM public.resolve_pacing_sales_attribution((SELECT d FROM t) - 1)
    WHERE campaign_id IS NOT NULL
    GROUP BY campaign_id
  ),
  mcs_scored AS (
    SELECT mcs.*,
      COALESCE(ls.spend, td_today.spend, 0) AS today_spend_for_sort,
      COALESCE(td_yest.spend, 0) AS yesterday_spend_for_visibility,
      ROW_NUMBER() OVER (
        PARTITION BY mcs.account_id, mcs.campaign_id
        ORDER BY
          CASE
            WHEN mcs.status='ACTIVE' OR mcs.effective_status='ACTIVE' THEN 0
            WHEN mcs.status='PAUSED' OR mcs.effective_status='PAUSED' THEN 1
            WHEN mcs.status='UNKNOWN' OR mcs.effective_status='UNKNOWN' THEN 2
            ELSE 3
          END,
          COALESCE(s_today.sales,0) DESC,
          COALESCE(ls.spend, td_today.spend, 0) DESC,
          COALESCE(NULLIF(mcs.daily_budget,0), mcs.lifetime_budget, 0) DESC,
          mcs.updated_at DESC NULLS LAST,
          mcs.campaign_id
      ) AS rn
    FROM public.meta_campaign_status mcs
    JOIN active_accounts aa ON aa.account_id = mcs.account_id
    LEFT JOIN latest_snapshots ls ON ls.account_id=mcs.account_id AND ls.campaign_id=mcs.campaign_id
    LEFT JOIN td_today ON td_today.account_id=mcs.account_id AND td_today.campaign_name=mcs.campaign_name
    LEFT JOIN td_yest ON td_yest.account_id=mcs.account_id AND td_yest.campaign_name=mcs.campaign_name
    LEFT JOIN s_today ON s_today.campaign_id = mcs.campaign_id
    WHERE (p_operation_id IS NULL OR mcs.operation_id = p_operation_id)
      AND COALESCE(mcs.effective_status, mcs.status, 'UNKNOWN') <> 'ARCHIVED'
      AND (
        mcs.status='ACTIVE'
        OR mcs.effective_status='ACTIVE'
        OR COALESCE(ls.spend, td_today.spend, 0) > 0
        OR (
          (mcs.status='PAUSED' OR mcs.effective_status='PAUSED')
          AND (
            COALESCE(td_yest.spend, 0) > 0
            OR mcs.updated_at >= now() - interval '48 hours'
          )
        )
      )
  ),
  mcs_dedup AS (SELECT * FROM mcs_scored WHERE rn = 1),
  base AS (
    SELECT
      mcs.campaign_id,
      mcs.campaign_name,
      mcs.account_id,
      aa.account_name,
      mcs.status,
      mcs.effective_status,
      COALESCE(NULLIF(mcs.daily_budget,0), mcs.lifetime_budget, 0) AS daily_budget,
      COALESCE(ls.spend, td_today.spend, 0) AS spend_today,
      COALESCE(td_yest.spend, 0) AS spend_yesterday,
      GREATEST(COALESCE(ls.impressions,0), COALESCE(td_today.impressions,0))::bigint AS impressions_today,
      GREATEST(COALESCE(ls.clicks,0), COALESCE(td_today.clicks,0))::bigint AS clicks_today,
      COALESCE(s_today.sales, 0) AS sales_today,
      COALESCE(s_today.revenue, 0) AS revenue_today,
      COALESCE(s_yest.sales, 0) AS sales_yesterday,
      COALESCE(s_yest.revenue, 0) AS revenue_yesterday
    FROM mcs_dedup mcs
    JOIN active_accounts aa ON aa.account_id = mcs.account_id
    LEFT JOIN latest_snapshots ls ON ls.account_id=mcs.account_id AND ls.campaign_id=mcs.campaign_id
    LEFT JOIN td_today ON td_today.account_id=mcs.account_id AND td_today.campaign_name=mcs.campaign_name
    LEFT JOIN td_yest ON td_yest.account_id=mcs.account_id AND td_yest.campaign_name=mcs.campaign_name
    LEFT JOIN s_today ON s_today.campaign_id = mcs.campaign_id
    LEFT JOIN s_yest ON s_yest.campaign_id = mcs.campaign_id
  ),
  snapshot_orphans AS (
    SELECT
      ls.campaign_id,
      ls.campaign_name,
      ls.account_id,
      aa.account_name,
      COALESCE(mcs.status, 'UNKNOWN')::text AS status,
      COALESCE(mcs.effective_status, mcs.status)::text AS effective_status,
      COALESCE(NULLIF(mcs.daily_budget,0), mcs.lifetime_budget, 0)::numeric AS daily_budget,
      ls.spend AS spend_today,
      COALESCE(td_yest.spend, 0) AS spend_yesterday,
      COALESCE(ls.impressions,0)::bigint AS impressions_today,
      COALESCE(ls.clicks,0)::bigint AS clicks_today,
      COALESCE(s_today.sales, 0)::bigint AS sales_today,
      COALESCE(ls.revenue, s_today.revenue, 0)::numeric AS revenue_today,
      COALESCE(s_yest.sales, 0)::bigint AS sales_yesterday,
      COALESCE(s_yest.revenue, 0)::numeric AS revenue_yesterday
    FROM latest_snapshots ls
    JOIN active_accounts aa ON aa.account_id = ls.account_id
    LEFT JOIN LATERAL (
      SELECT m.status, m.effective_status, m.daily_budget, m.lifetime_budget
      FROM public.meta_campaign_status m
      WHERE m.account_id = ls.account_id
        AND m.campaign_id = ls.campaign_id
        AND (p_operation_id IS NULL OR m.operation_id = p_operation_id)
      ORDER BY m.updated_at DESC NULLS LAST
      LIMIT 1
    ) mcs ON true
    LEFT JOIN td_yest ON td_yest.account_id=ls.account_id AND td_yest.campaign_name=ls.campaign_name
    LEFT JOIN s_today ON s_today.campaign_id = ls.campaign_id
    LEFT JOIN s_yest ON s_yest.campaign_id = ls.campaign_id
    WHERE ls.spend > 0
      AND COALESCE(mcs.effective_status, mcs.status, 'UNKNOWN') <> 'ARCHIVED'
      AND NOT EXISTS (SELECT 1 FROM base b WHERE b.campaign_id = ls.campaign_id)
  )
  SELECT * FROM base
  UNION ALL
  SELECT * FROM snapshot_orphans;
$function$;

GRANT EXECUTE ON FUNCTION public.get_live_pacing_campaigns(uuid) TO authenticated, service_role;