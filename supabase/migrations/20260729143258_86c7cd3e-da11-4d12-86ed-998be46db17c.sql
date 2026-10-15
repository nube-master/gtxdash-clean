-- 1) Ad Accounts
CREATE TABLE public.mgid_ad_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL,
  account_id text NOT NULL,
  account_name text NOT NULL,
  api_token text NOT NULL,
  timezone text,
  currency text DEFAULT 'usd',
  wallet_balance numeric(14,4),
  wallet_credit numeric(14,4),
  is_active boolean NOT NULL DEFAULT true,
  last_sync_at timestamptz,
  last_sync_status text,
  last_sync_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(operation_id, account_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mgid_ad_accounts TO authenticated;
GRANT ALL ON public.mgid_ad_accounts TO service_role;
ALTER TABLE public.mgid_ad_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "strict_op_scope_select" ON public.mgid_ad_accounts FOR SELECT TO authenticated USING (strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_insert" ON public.mgid_ad_accounts FOR INSERT TO authenticated WITH CHECK (strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_update" ON public.mgid_ad_accounts FOR UPDATE TO authenticated USING (strict_op_scope(operation_id)) WITH CHECK (strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_delete" ON public.mgid_ad_accounts FOR DELETE TO authenticated USING (strict_op_scope(operation_id) AND (admin_da_op(operation_id) OR (EXISTS (SELECT 1 FROM super_admins WHERE super_admins.user_id = auth.uid()))));
CREATE TRIGGER trg_mgid_ad_accounts_updated BEFORE UPDATE ON public.mgid_ad_accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Campaign Status
CREATE TABLE public.mgid_campaign_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL,
  account_id text NOT NULL,
  campaign_id text NOT NULL,
  campaign_name text,
  status text,
  status_reason text,
  campaign_type text,
  daily_limit_cents bigint,
  overall_limit_cents bigint,
  limit_type text,
  language text,
  utm_source text,
  utm_campaign text,
  utm_medium text,
  when_add timestamptz,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(operation_id, campaign_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mgid_campaign_status TO authenticated;
GRANT ALL ON public.mgid_campaign_status TO service_role;
ALTER TABLE public.mgid_campaign_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "strict_op_scope_select" ON public.mgid_campaign_status FOR SELECT TO authenticated USING (strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_insert" ON public.mgid_campaign_status FOR INSERT TO authenticated WITH CHECK (strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_update" ON public.mgid_campaign_status FOR UPDATE TO authenticated USING (strict_op_scope(operation_id)) WITH CHECK (strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_delete" ON public.mgid_campaign_status FOR DELETE TO authenticated USING (strict_op_scope(operation_id) AND (admin_da_op(operation_id) OR (EXISTS (SELECT 1 FROM super_admins WHERE super_admins.user_id = auth.uid()))));
CREATE INDEX idx_mgid_campaign_status_op ON public.mgid_campaign_status(operation_id);
CREATE INDEX idx_mgid_campaign_status_account ON public.mgid_campaign_status(account_id);
CREATE TRIGGER trg_mgid_campaign_status_updated BEFORE UPDATE ON public.mgid_campaign_status FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Traffic Data (USD)
CREATE TABLE public.mgid_traffic_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL,
  date date NOT NULL,
  account_id text NOT NULL,
  campaign_id text NOT NULL,
  campaign_name text,
  spend numeric(14,4) NOT NULL DEFAULT 0,
  impressions bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  avg_cpc numeric(10,4) NOT NULL DEFAULT 0,
  conversions_decision bigint NOT NULL DEFAULT 0,
  conversions_buying bigint NOT NULL DEFAULT 0,
  conversion_cost numeric(14,4) NOT NULL DEFAULT 0,
  revenue numeric(14,4) NOT NULL DEFAULT 0,
  profit numeric(14,4) NOT NULL DEFAULT 0,
  epc numeric(10,4) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(operation_id, date, account_id, campaign_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mgid_traffic_data TO authenticated;
GRANT ALL ON public.mgid_traffic_data TO service_role;
ALTER TABLE public.mgid_traffic_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "strict_op_scope_select" ON public.mgid_traffic_data FOR SELECT TO authenticated USING (strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_insert" ON public.mgid_traffic_data FOR INSERT TO authenticated WITH CHECK (strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_update" ON public.mgid_traffic_data FOR UPDATE TO authenticated USING (strict_op_scope(operation_id)) WITH CHECK (strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_delete" ON public.mgid_traffic_data FOR DELETE TO authenticated USING (strict_op_scope(operation_id) AND (admin_da_op(operation_id) OR (EXISTS (SELECT 1 FROM super_admins WHERE super_admins.user_id = auth.uid()))));
CREATE INDEX idx_mgid_traffic_date ON public.mgid_traffic_data(date DESC);
CREATE INDEX idx_mgid_traffic_op_date ON public.mgid_traffic_data(operation_id, date DESC);
CREATE INDEX idx_mgid_traffic_campaign ON public.mgid_traffic_data(campaign_id);
CREATE TRIGGER trg_mgid_traffic_data_updated BEFORE UPDATE ON public.mgid_traffic_data FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Canal MGID em media_channels (uma linha por operação)
INSERT INTO public.media_channels (operation_id, slug, name, icon, color, spend_source, is_active, sort_order)
SELECT o.id, 'mgid', 'MGID Ads', 'Megaphone', '#FF6B35', 'mgid_api', true,
       COALESCE((SELECT MAX(sort_order) FROM public.media_channels mc WHERE mc.operation_id = o.id), 0) + 10
FROM public.operations o
ON CONFLICT (operation_id, slug) DO UPDATE SET spend_source = EXCLUDED.spend_source, is_active = true;