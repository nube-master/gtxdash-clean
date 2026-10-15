
-- Aggregated traffic by campaign/ad/account for leaderboard (avoids 50k+ row fetch)
CREATE OR REPLACE FUNCTION public.get_leaderboard_traffic(
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  campaign_name TEXT,
  ad_name TEXT,
  account_id TEXT,
  total_spend NUMERIC,
  total_impressions BIGINT,
  total_clicks BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    t.campaign_name,
    t.ad_name,
    t.account_id,
    COALESCE(SUM(t.spend), 0) AS total_spend,
    COALESCE(SUM(t.impressions), 0) AS total_impressions,
    COALESCE(SUM(t.clicks), 0) AS total_clicks
  FROM public.traffic_data t
  WHERE t.date >= p_start_date
    AND t.date <= p_end_date
  GROUP BY t.campaign_name, t.ad_name, t.account_id;
$$;

-- Aggregated sales by utm_campaign for leaderboard
CREATE OR REPLACE FUNCTION public.get_leaderboard_sales(
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  utm_campaign TEXT,
  total_revenue NUMERIC,
  sale_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    s.utm_campaign,
    COALESCE(SUM(s.revenue), 0) AS total_revenue,
    COUNT(*) AS sale_count
  FROM public.sales_data s
  WHERE s.date >= p_start_date
    AND s.date <= p_end_date
    AND s.status = 'approved'
  GROUP BY s.utm_campaign;
$$;

-- Aggregated redtrack sales by utm_campaign for leaderboard
CREATE OR REPLACE FUNCTION public.get_leaderboard_redtrack(
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  utm_campaign TEXT,
  event_type TEXT,
  total_revenue NUMERIC,
  sale_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    r.utm_campaign,
    r.event_type,
    COALESCE(SUM(r.amount), 0) AS total_revenue,
    COUNT(*) AS sale_count
  FROM public.redtrack_events r
  WHERE r.event_type IN ('purchase', 'upsell')
    AND r.occurred_at >= (p_start_date::TEXT || 'T03:00:00Z')::TIMESTAMPTZ
    AND r.occurred_at < ((p_end_date + INTERVAL '1 day')::DATE::TEXT || 'T03:00:00Z')::TIMESTAMPTZ
  GROUP BY r.utm_campaign, r.event_type;
$$;
