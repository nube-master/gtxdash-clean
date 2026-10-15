
-- Traffic data from Meta Ads
CREATE TABLE public.traffic_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id TEXT NOT NULL,
  campaign_name TEXT NOT NULL,
  adset_name TEXT NOT NULL,
  ad_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  spend NUMERIC NOT NULL DEFAULT 0,
  impressions BIGINT NOT NULL DEFAULT 0,
  clicks BIGINT NOT NULL DEFAULT 0,
  cpc NUMERIC NOT NULL DEFAULT 0,
  cpm NUMERIC NOT NULL DEFAULT 0,
  ctr NUMERIC NOT NULL DEFAULT 0,
  video_3s_views BIGINT NOT NULL DEFAULT 0,
  video_25_percent BIGINT NOT NULL DEFAULT 0,
  video_50_percent BIGINT NOT NULL DEFAULT 0,
  video_75_percent BIGINT NOT NULL DEFAULT 0,
  video_100_percent BIGINT NOT NULL DEFAULT 0,
  thruplays BIGINT NOT NULL DEFAULT 0,
  date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(date, campaign_name, ad_name)
);

-- Sales data from CartPanda
CREATE TABLE public.sales_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE,
  date DATE NOT NULL,
  revenue NUMERIC NOT NULL DEFAULT 0,
  product_name TEXT,
  utm_source TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  status TEXT NOT NULL DEFAULT 'approved',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- VSL data from Vturb
CREATE TABLE public.vsl_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  video_id TEXT NOT NULL,
  video_name TEXT NOT NULL,
  total_views BIGINT NOT NULL DEFAULT 0,
  unique_views BIGINT NOT NULL DEFAULT 0,
  average_watch_time NUMERIC NOT NULL DEFAULT 0,
  retention_rate NUMERIC NOT NULL DEFAULT 0,
  button_clicks BIGINT NOT NULL DEFAULT 0,
  checkout_clicks BIGINT NOT NULL DEFAULT 0,
  date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(video_id, date)
);

-- Integration logs
CREATE TABLE public.integration_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  integration TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'success',
  message TEXT,
  records_processed INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.traffic_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vsl_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_logs ENABLE ROW LEVEL SECURITY;

-- Allow public read for dashboard (internal tool, no auth required for reads)
CREATE POLICY "Allow public read traffic_data" ON public.traffic_data FOR SELECT USING (true);
CREATE POLICY "Allow public read sales_data" ON public.sales_data FOR SELECT USING (true);
CREATE POLICY "Allow public read vsl_data" ON public.vsl_data FOR SELECT USING (true);
CREATE POLICY "Allow public read integration_logs" ON public.integration_logs FOR SELECT USING (true);

-- Allow service role inserts (edge functions use service role)
CREATE POLICY "Allow service insert traffic_data" ON public.traffic_data FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service insert sales_data" ON public.sales_data FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service insert vsl_data" ON public.vsl_data FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service insert integration_logs" ON public.integration_logs FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow service update traffic_data" ON public.traffic_data FOR UPDATE USING (true);
CREATE POLICY "Allow service update sales_data" ON public.sales_data FOR UPDATE USING (true);
CREATE POLICY "Allow service update vsl_data" ON public.vsl_data FOR UPDATE USING (true);

-- Indexes for performance
CREATE INDEX idx_traffic_data_date ON public.traffic_data(date);
CREATE INDEX idx_traffic_data_campaign ON public.traffic_data(campaign_name);
CREATE INDEX idx_traffic_data_ad ON public.traffic_data(ad_name);
CREATE INDEX idx_sales_data_date ON public.sales_data(date);
CREATE INDEX idx_sales_data_utm_campaign ON public.sales_data(utm_campaign);
CREATE INDEX idx_sales_data_utm_content ON public.sales_data(utm_content);
CREATE INDEX idx_vsl_data_date ON public.vsl_data(date);
CREATE INDEX idx_vsl_data_video ON public.vsl_data(video_id);

-- Updated_at trigger for traffic_data
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_traffic_data_updated_at
  BEFORE UPDATE ON public.traffic_data
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Materialized views for aggregation
CREATE MATERIALIZED VIEW public.campaign_aggregated AS
SELECT
  t.campaign_name,
  t.date,
  SUM(t.spend) as total_spend,
  SUM(t.impressions) as total_impressions,
  SUM(t.clicks) as total_clicks,
  SUM(t.video_3s_views) as total_3s_views,
  COALESCE(SUM(s.revenue), 0) as total_revenue,
  COUNT(DISTINCT s.order_id) as total_sales,
  CASE WHEN SUM(t.spend) > 0 THEN COALESCE(SUM(s.revenue), 0) / SUM(t.spend) ELSE 0 END as roas,
  CASE WHEN COUNT(DISTINCT s.order_id) > 0 THEN SUM(t.spend) / COUNT(DISTINCT s.order_id) ELSE 0 END as cac,
  CASE WHEN SUM(t.clicks) > 0 THEN (COUNT(DISTINCT s.order_id)::NUMERIC / SUM(t.clicks)) * 100 ELSE 0 END as conversion_rate,
  CASE WHEN COUNT(DISTINCT s.order_id) > 0 THEN COALESCE(SUM(s.revenue), 0) / COUNT(DISTINCT s.order_id) ELSE 0 END as avg_ticket
FROM public.traffic_data t
LEFT JOIN public.sales_data s ON s.utm_campaign = t.campaign_name AND s.date = t.date
GROUP BY t.campaign_name, t.date;

CREATE MATERIALIZED VIEW public.creative_aggregated AS
SELECT
  t.ad_name,
  t.campaign_name,
  SUM(t.spend) as total_spend,
  SUM(t.impressions) as total_impressions,
  SUM(t.clicks) as total_clicks,
  CASE WHEN SUM(t.clicks) > 0 THEN SUM(t.spend) / SUM(t.clicks) ELSE 0 END as cpc,
  CASE WHEN SUM(t.impressions) > 0 THEN (SUM(t.spend) / SUM(t.impressions)) * 1000 ELSE 0 END as cpm,
  CASE WHEN SUM(t.impressions) > 0 THEN (SUM(t.clicks)::NUMERIC / SUM(t.impressions)) * 100 ELSE 0 END as ctr,
  SUM(t.video_3s_views) as total_3s_views,
  SUM(t.video_25_percent) as total_25_pct,
  SUM(t.video_50_percent) as total_50_pct,
  SUM(t.video_75_percent) as total_75_pct,
  SUM(t.video_100_percent) as total_100_pct,
  CASE WHEN SUM(t.impressions) > 0 THEN (SUM(t.video_3s_views)::NUMERIC / SUM(t.impressions)) * 100 ELSE 0 END as hook_rate,
  CASE WHEN SUM(t.video_3s_views) > 0 THEN (SUM(t.video_25_percent)::NUMERIC / SUM(t.video_3s_views)) * 100 ELSE 0 END as hold_rate,
  COALESCE(SUM(s.revenue), 0) as total_revenue,
  COUNT(DISTINCT s.order_id) as total_sales,
  CASE WHEN SUM(t.spend) > 0 THEN COALESCE(SUM(s.revenue), 0) / SUM(t.spend) ELSE 0 END as roas,
  CASE WHEN COUNT(DISTINCT s.order_id) > 0 THEN SUM(t.spend) / COUNT(DISTINCT s.order_id) ELSE 0 END as cac
FROM public.traffic_data t
LEFT JOIN public.sales_data s ON s.utm_content = t.ad_name AND s.date = t.date
GROUP BY t.ad_name, t.campaign_name;

CREATE MATERIALIZED VIEW public.vsl_aggregated AS
SELECT
  v.video_id,
  v.video_name,
  SUM(v.total_views) as total_views,
  SUM(v.unique_views) as total_unique_views,
  AVG(v.average_watch_time) as avg_watch_time,
  AVG(v.retention_rate) as avg_retention,
  SUM(v.button_clicks) as total_button_clicks,
  SUM(v.checkout_clicks) as total_checkout_clicks,
  CASE WHEN SUM(v.total_views) > 0 THEN (SUM(v.button_clicks)::NUMERIC / SUM(v.total_views)) * 100 ELSE 0 END as button_ctr
FROM public.vsl_data v
GROUP BY v.video_id, v.video_name;

CREATE MATERIALIZED VIEW public.structure_aggregated AS
SELECT
  CASE
    WHEN t.campaign_name ~ '\[BAIANO\]\[([^\]]+)\]' THEN (regexp_match(t.campaign_name, '\[BAIANO\]\[([^\]]+)\]'))[1]
    ELSE 'OUTRO'
  END as structure_type,
  COUNT(DISTINCT t.campaign_name) as campaign_count,
  COUNT(DISTINCT CASE WHEN t.status = 'ACTIVE' THEN t.campaign_name END) as active_campaigns,
  COUNT(DISTINCT CASE WHEN t.status = 'PAUSED' THEN t.campaign_name END) as paused_campaigns,
  SUM(t.spend) as total_spend,
  COALESCE(SUM(s.revenue), 0) as total_revenue,
  CASE WHEN SUM(t.spend) > 0 THEN COALESCE(SUM(s.revenue), 0) / SUM(t.spend) ELSE 0 END as roas
FROM public.traffic_data t
LEFT JOIN public.sales_data s ON s.utm_campaign = t.campaign_name AND s.date = t.date
GROUP BY structure_type;

-- Indexes on materialized views
CREATE UNIQUE INDEX idx_campaign_agg ON public.campaign_aggregated(campaign_name, date);
CREATE UNIQUE INDEX idx_creative_agg ON public.creative_aggregated(ad_name, campaign_name);
CREATE UNIQUE INDEX idx_vsl_agg ON public.vsl_aggregated(video_id);
CREATE UNIQUE INDEX idx_structure_agg ON public.structure_aggregated(structure_type);

-- Function to refresh all materialized views
CREATE OR REPLACE FUNCTION public.refresh_aggregated_views()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.campaign_aggregated;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.creative_aggregated;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.vsl_aggregated;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.structure_aggregated;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
