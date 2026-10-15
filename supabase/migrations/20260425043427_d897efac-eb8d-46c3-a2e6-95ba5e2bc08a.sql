
-- ============================================
-- TABLE 1: newsbreak_ad_accounts
-- ============================================
CREATE TABLE public.newsbreak_ad_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id TEXT NOT NULL,
  account_name TEXT NOT NULL,
  access_token TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT,
  last_sync_error TEXT,
  operation_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, operation_id)
);

CREATE INDEX idx_newsbreak_accounts_operation ON public.newsbreak_ad_accounts(operation_id);
CREATE INDEX idx_newsbreak_accounts_active ON public.newsbreak_ad_accounts(is_active) WHERE is_active = true;

ALTER TABLE public.newsbreak_ad_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see accounts of their operation"
  ON public.newsbreak_ad_accounts FOR SELECT
  USING (operation_id IN (
    SELECT om.operation_id FROM public.operation_members om
    WHERE om.user_id = auth.uid()
  ));

CREATE POLICY "Users manage accounts of their operation"
  ON public.newsbreak_ad_accounts FOR ALL
  USING (operation_id IN (
    SELECT om.operation_id FROM public.operation_members om
    WHERE om.user_id = auth.uid()
  ))
  WITH CHECK (operation_id IN (
    SELECT om.operation_id FROM public.operation_members om
    WHERE om.user_id = auth.uid()
  ));

CREATE POLICY "Service role full access on newsbreak_ad_accounts"
  ON public.newsbreak_ad_accounts FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER update_newsbreak_accounts_updated_at
  BEFORE UPDATE ON public.newsbreak_ad_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- TABLE 2: newsbreak_traffic_data
-- ============================================
CREATE TABLE public.newsbreak_traffic_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL,
  account_id TEXT NOT NULL,
  campaign_id TEXT,
  campaign_name TEXT,
  ad_set_id TEXT,
  ad_set_name TEXT,
  ad_id TEXT,
  ad_name TEXT,
  status TEXT,
  spend NUMERIC NOT NULL DEFAULT 0,
  impressions BIGINT NOT NULL DEFAULT 0,
  clicks BIGINT NOT NULL DEFAULT 0,
  ctr NUMERIC NOT NULL DEFAULT 0,
  cpc NUMERIC NOT NULL DEFAULT 0,
  cpm NUMERIC NOT NULL DEFAULT 0,
  conversions BIGINT NOT NULL DEFAULT 0,
  operation_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (date, account_id, campaign_id, ad_id, operation_id)
);

CREATE INDEX idx_newsbreak_traffic_date ON public.newsbreak_traffic_data(date DESC);
CREATE INDEX idx_newsbreak_traffic_account ON public.newsbreak_traffic_data(account_id, date DESC);
CREATE INDEX idx_newsbreak_traffic_campaign ON public.newsbreak_traffic_data(campaign_id);
CREATE INDEX idx_newsbreak_traffic_operation ON public.newsbreak_traffic_data(operation_id, date DESC);

ALTER TABLE public.newsbreak_traffic_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see traffic of their operation"
  ON public.newsbreak_traffic_data FOR SELECT
  USING (operation_id IN (
    SELECT om.operation_id FROM public.operation_members om
    WHERE om.user_id = auth.uid()
  ));

CREATE POLICY "Service role full access on newsbreak_traffic_data"
  ON public.newsbreak_traffic_data FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER update_newsbreak_traffic_updated_at
  BEFORE UPDATE ON public.newsbreak_traffic_data
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- TABLE 3: newsbreak_campaign_status
-- ============================================
CREATE TABLE public.newsbreak_campaign_status (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  campaign_name TEXT NOT NULL,
  account_id TEXT NOT NULL,
  status TEXT,
  online_status TEXT,
  objective TEXT,
  budget NUMERIC,
  operation_id UUID NOT NULL,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, operation_id)
);

CREATE INDEX idx_newsbreak_campaign_account ON public.newsbreak_campaign_status(account_id);
CREATE INDEX idx_newsbreak_campaign_operation ON public.newsbreak_campaign_status(operation_id);

ALTER TABLE public.newsbreak_campaign_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see campaigns of their operation"
  ON public.newsbreak_campaign_status FOR SELECT
  USING (operation_id IN (
    SELECT om.operation_id FROM public.operation_members om
    WHERE om.user_id = auth.uid()
  ));

CREATE POLICY "Service role full access on newsbreak_campaign_status"
  ON public.newsbreak_campaign_status FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER update_newsbreak_campaign_updated_at
  BEFORE UPDATE ON public.newsbreak_campaign_status
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
