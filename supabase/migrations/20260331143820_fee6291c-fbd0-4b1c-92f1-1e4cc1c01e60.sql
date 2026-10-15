
-- Update get_traffic_aggregated to accept optional operation_id
CREATE OR REPLACE FUNCTION public.get_traffic_aggregated(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL)
 RETURNS TABLE(account_id text, campaign_name text, adset_name text, ad_name text, status text, date date, total_spend numeric, total_clicks bigint, total_impressions bigint, total_video_3s_views bigint, total_video_25_percent bigint, total_video_50_percent bigint, total_video_75_percent bigint, total_video_100_percent bigint, total_thruplays bigint, avg_cpc numeric, avg_cpm numeric, avg_ctr numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    t.account_id, t.campaign_name, t.adset_name, t.ad_name, t.status, t.date,
    COALESCE(SUM(t.spend), 0) AS total_spend,
    COALESCE(SUM(t.clicks), 0) AS total_clicks,
    COALESCE(SUM(t.impressions), 0) AS total_impressions,
    COALESCE(SUM(t.video_3s_views), 0) AS total_video_3s_views,
    COALESCE(SUM(t.video_25_percent), 0) AS total_video_25_percent,
    COALESCE(SUM(t.video_50_percent), 0) AS total_video_50_percent,
    COALESCE(SUM(t.video_75_percent), 0) AS total_video_75_percent,
    COALESCE(SUM(t.video_100_percent), 0) AS total_video_100_percent,
    COALESCE(SUM(t.thruplays), 0) AS total_thruplays,
    CASE WHEN SUM(t.clicks) > 0 THEN SUM(t.spend) / SUM(t.clicks) ELSE 0 END AS avg_cpc,
    CASE WHEN SUM(t.impressions) > 0 THEN (SUM(t.spend) / SUM(t.impressions)) * 1000 ELSE 0 END AS avg_cpm,
    CASE WHEN SUM(t.impressions) > 0 THEN (SUM(t.clicks)::numeric / SUM(t.impressions)) * 100 ELSE 0 END AS avg_ctr
  FROM public.traffic_data t
  WHERE t.date >= p_start_date AND t.date <= p_end_date
    AND (p_operation_id IS NULL OR t.operation_id = p_operation_id)
  GROUP BY t.account_id, t.campaign_name, t.adset_name, t.ad_name, t.status, t.date;
$function$;

-- Update get_traffic_by_campaign
CREATE OR REPLACE FUNCTION public.get_traffic_by_campaign(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL)
 RETURNS TABLE(campaign_name text, date date, total_spend numeric, total_clicks bigint, total_impressions bigint, total_video_3s_views bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    t.campaign_name, t.date,
    COALESCE(SUM(t.spend), 0) AS total_spend,
    COALESCE(SUM(t.clicks), 0) AS total_clicks,
    COALESCE(SUM(t.impressions), 0) AS total_impressions,
    COALESCE(SUM(t.video_3s_views), 0) AS total_video_3s_views
  FROM public.traffic_data t
  WHERE t.date >= p_start_date AND t.date <= p_end_date
    AND (p_operation_id IS NULL OR t.operation_id = p_operation_id)
  GROUP BY t.campaign_name, t.date;
$function$;

-- Update get_creative_traffic_aggregated
CREATE OR REPLACE FUNCTION public.get_creative_traffic_aggregated(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL)
 RETURNS TABLE(account_id text, campaign_name text, ad_name text, status text, total_spend numeric, total_clicks bigint, total_impressions bigint, total_video_3s_views bigint, total_video_25_percent bigint, total_video_50_percent bigint, total_video_75_percent bigint, total_video_100_percent bigint, total_thruplays bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    t.account_id, t.campaign_name, t.ad_name,
    MAX(t.status) AS status,
    COALESCE(SUM(t.spend), 0) AS total_spend,
    COALESCE(SUM(t.clicks), 0) AS total_clicks,
    COALESCE(SUM(t.impressions), 0) AS total_impressions,
    COALESCE(SUM(t.video_3s_views), 0) AS total_video_3s_views,
    COALESCE(SUM(t.video_25_percent), 0) AS total_video_25_percent,
    COALESCE(SUM(t.video_50_percent), 0) AS total_video_50_percent,
    COALESCE(SUM(t.video_75_percent), 0) AS total_video_75_percent,
    COALESCE(SUM(t.video_100_percent), 0) AS total_video_100_percent,
    COALESCE(SUM(t.thruplays), 0) AS total_thruplays
  FROM public.traffic_data t
  WHERE t.date >= p_start_date AND t.date <= p_end_date
    AND (p_operation_id IS NULL OR t.operation_id = p_operation_id)
  GROUP BY t.account_id, t.campaign_name, t.ad_name;
$function$;

-- Update get_traffic_spend_total
CREATE OR REPLACE FUNCTION public.get_traffic_spend_total(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL)
 RETURNS TABLE(total_spend numeric)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT COALESCE(SUM(spend), 0)::NUMERIC
  FROM public.traffic_data
  WHERE date >= p_start_date AND date <= p_end_date
    AND (p_operation_id IS NULL OR operation_id = p_operation_id);
$function$;

-- Update get_traffic_spend_by_account
CREATE OR REPLACE FUNCTION public.get_traffic_spend_by_account(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL)
 RETURNS TABLE(account_id text, date date, total_spend numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    t.account_id, t.date,
    COALESCE(SUM(t.spend), 0) AS total_spend
  FROM public.traffic_data t
  WHERE t.date >= p_start_date AND t.date <= p_end_date
    AND (p_operation_id IS NULL OR t.operation_id = p_operation_id)
  GROUP BY t.account_id, t.date;
$function$;

-- Update get_leaderboard_traffic
CREATE OR REPLACE FUNCTION public.get_leaderboard_traffic(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL)
 RETURNS TABLE(campaign_name text, ad_name text, account_id text, total_spend numeric, total_impressions bigint, total_clicks bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    t.campaign_name, t.ad_name, t.account_id,
    COALESCE(SUM(t.spend), 0) AS total_spend,
    COALESCE(SUM(t.impressions), 0) AS total_impressions,
    COALESCE(SUM(t.clicks), 0) AS total_clicks
  FROM public.traffic_data t
  WHERE t.date >= p_start_date AND t.date <= p_end_date
    AND (p_operation_id IS NULL OR t.operation_id = p_operation_id)
  GROUP BY t.campaign_name, t.ad_name, t.account_id;
$function$;

-- Update get_leaderboard_sales
CREATE OR REPLACE FUNCTION public.get_leaderboard_sales(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL)
 RETURNS TABLE(utm_campaign text, total_revenue numeric, sale_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    s.utm_campaign,
    COALESCE(SUM(s.revenue), 0) AS total_revenue,
    COUNT(*) AS sale_count
  FROM public.sales_data s
  WHERE s.date >= p_start_date AND s.date <= p_end_date
    AND s.status = 'approved'
    AND (p_operation_id IS NULL OR s.operation_id = p_operation_id)
  GROUP BY s.utm_campaign;
$function$;

-- Update get_leaderboard_redtrack
CREATE OR REPLACE FUNCTION public.get_leaderboard_redtrack(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL)
 RETURNS TABLE(utm_campaign text, event_type text, total_revenue numeric, sale_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    r.utm_campaign, r.event_type,
    COALESCE(SUM(r.amount), 0) AS total_revenue,
    COUNT(*) AS sale_count
  FROM public.redtrack_events r
  WHERE r.event_type IN ('purchase', 'upsell')
    AND r.occurred_at >= (p_start_date::TEXT || 'T03:00:00Z')::TIMESTAMPTZ
    AND r.occurred_at < ((p_end_date + INTERVAL '1 day')::DATE::TEXT || 'T03:00:00Z')::TIMESTAMPTZ
    AND (p_operation_id IS NULL OR r.operation_id = p_operation_id)
  GROUP BY r.utm_campaign, r.event_type;
$function$;

-- Update get_leaderboard_cb_sales
CREATE OR REPLACE FUNCTION public.get_leaderboard_cb_sales(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL)
 RETURNS TABLE(campaign_name text, revenue_brl numeric, receipt text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    mcs.campaign_name, cb.amount_brl, cb.receipt
  FROM clickbank_audit cb
  JOIN meta_campaign_status mcs ON cb.aff_sub2 = mcs.campaign_id
  WHERE cb.date >= p_start_date AND cb.date <= p_end_date
    AND cb.transaction_type = 'SALE'
    AND cb.amount_usd BETWEEN 180 AND 250
    AND (p_operation_id IS NULL OR cb.operation_id = p_operation_id)
  ;
$function$;

-- Update get_cb_creative_sales
CREATE OR REPLACE FUNCTION public.get_cb_creative_sales(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL)
 RETURNS TABLE(campaign_name text, revenue_brl numeric, receipt text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    mcs.campaign_name, cb.amount_brl, cb.receipt
  FROM clickbank_audit cb
  JOIN meta_campaign_status mcs ON cb.aff_sub2 = mcs.campaign_id
  WHERE cb.date >= p_start_date AND cb.date <= p_end_date
    AND cb.transaction_type = 'SALE'
    AND cb.amount_usd BETWEEN 180 AND 250
    AND (p_operation_id IS NULL OR cb.operation_id = p_operation_id)
  ;
$function$;

-- Update get_traffic_by_campaign_day
CREATE OR REPLACE FUNCTION public.get_traffic_by_campaign_day(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL)
 RETURNS TABLE(campaign_name text, date date, spend numeric, clicks bigint, impressions bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    t.campaign_name, t.date,
    SUM(t.spend) as spend,
    SUM(t.clicks) as clicks,
    SUM(t.impressions) as impressions
  FROM traffic_data t
  WHERE t.date >= p_start_date AND t.date <= p_end_date
    AND (p_operation_id IS NULL OR t.operation_id = p_operation_id)
  GROUP BY t.campaign_name, t.date;
$function$;
