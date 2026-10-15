-- Campaign performance RPC
CREATE OR REPLACE FUNCTION public.get_campaign_performance_metrics(
  p_days integer,
  p_campaign_id text DEFAULT NULL
)
RETURNS TABLE (
  campaign_id text,
  campaign_name text,
  spend numeric,
  ic bigint,
  purchase bigint,
  revenue numeric,
  roas numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH daily_stats AS (
    -- Link traffic_data (names) with meta_campaign_status (IDs)
    -- This is a bit tricky if names change, but it's the best link we have
    SELECT 
      cs.campaign_id,
      td.campaign_name,
      SUM(td.spend) as spend,
      SUM(td.initiate_checkout) as ic,
      SUM(td.purchase_count) as purchase,
      SUM(CASE WHEN td.purchase_count > 0 THEN td.purchase_count * 235 ELSE 0 END) as estimated_revenue -- Fallback estimation or join with sales
    FROM traffic_data td
    JOIN meta_campaign_status cs ON td.campaign_name = cs.campaign_name AND td.account_id = cs.account_id
    WHERE td.date >= (CURRENT_DATE - p_days)
      AND (p_campaign_id IS NULL OR cs.campaign_id = p_campaign_id)
      AND strict_op_scope(td.operation_id)
    GROUP BY cs.campaign_id, td.campaign_name
  )
  SELECT 
    ds.campaign_id,
    ds.campaign_name,
    ds.spend,
    ds.ic,
    ds.purchase,
    ds.estimated_revenue as revenue,
    CASE WHEN ds.spend > 0 THEN ds.estimated_revenue / ds.spend ELSE 0 END as roas
  FROM daily_stats ds;
END;
$$;

-- Ad performance RPC
CREATE OR REPLACE FUNCTION public.get_ad_performance_metrics(
  p_days integer,
  p_ad_id text DEFAULT NULL
)
RETURNS TABLE (
  ad_id text,
  ad_name text,
  spend numeric,
  ic bigint,
  purchase bigint,
  revenue numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH daily_stats AS (
    SELECT 
      ads.ad_id,
      td.ad_name,
      SUM(td.spend) as spend,
      SUM(td.initiate_checkout) as ic,
      SUM(td.purchase_count) as purchase,
      SUM(CASE WHEN td.purchase_count > 0 THEN td.purchase_count * 235 ELSE 0 END) as estimated_revenue
    FROM traffic_data td
    JOIN meta_ad_status ads ON td.ad_name = ads.name AND td.account_id = ads.account_id
    WHERE td.date >= (CURRENT_DATE - p_days)
      AND (p_ad_id IS NULL OR ads.ad_id = p_ad_id)
      AND strict_op_scope(td.operation_id)
    GROUP BY ads.ad_id, td.ad_name
  )
  SELECT 
    ds.ad_id,
    ds.ad_name,
    ds.spend,
    ds.ic,
    ds.purchase,
    ds.estimated_revenue
  FROM daily_stats ds;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_campaign_performance_metrics TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ad_performance_metrics TO authenticated;
