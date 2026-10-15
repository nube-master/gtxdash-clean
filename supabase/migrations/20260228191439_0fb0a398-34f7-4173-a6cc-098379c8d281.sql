
-- Create a function to get traffic aggregated by campaign_name + date for a date range
-- This avoids the 1000 row default limit by aggregating server-side
CREATE OR REPLACE FUNCTION public.get_traffic_by_campaign_day(p_start_date date, p_end_date date)
RETURNS TABLE(
  campaign_name text,
  date date,
  spend numeric,
  clicks bigint,
  impressions bigint
) AS $$
  SELECT 
    t.campaign_name,
    t.date,
    SUM(t.spend) as spend,
    SUM(t.clicks) as clicks,
    SUM(t.impressions) as impressions
  FROM traffic_data t
  WHERE t.date >= p_start_date AND t.date <= p_end_date
  GROUP BY t.campaign_name, t.date;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
