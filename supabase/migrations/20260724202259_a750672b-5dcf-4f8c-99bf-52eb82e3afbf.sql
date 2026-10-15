CREATE TABLE IF NOT EXISTS public.meta_ad_status (
  ad_id TEXT PRIMARY KEY,
  adset_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  operation_id UUID NOT NULL,
  name TEXT,
  status TEXT,
  effective_status TEXT,
  creative_id TEXT,
  preview_url TEXT,
  thumbnail_url TEXT,
  spend_brl NUMERIC(14,2) DEFAULT 0,
  impressions BIGINT DEFAULT 0,
  clicks BIGINT DEFAULT 0,
  purchases INTEGER DEFAULT 0,
  revenue_brl NUMERIC(14,2) DEFAULT 0,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meta_ad_status_adset ON public.meta_ad_status(adset_id);
CREATE INDEX IF NOT EXISTS idx_meta_ad_status_campaign ON public.meta_ad_status(campaign_id);
CREATE INDEX IF NOT EXISTS idx_meta_ad_status_account ON public.meta_ad_status(account_id);
CREATE INDEX IF NOT EXISTS idx_meta_ad_status_operation ON public.meta_ad_status(operation_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_ad_status TO authenticated;
GRANT ALL ON public.meta_ad_status TO service_role;

ALTER TABLE public.meta_ad_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meta_ad_status_op_scope_select" ON public.meta_ad_status
  FOR SELECT TO authenticated
  USING (public._op_scope_check(operation_id));

CREATE POLICY "meta_ad_status_op_scope_insert" ON public.meta_ad_status
  FOR INSERT TO authenticated
  WITH CHECK (public._op_scope_check(operation_id));

CREATE POLICY "meta_ad_status_op_scope_update" ON public.meta_ad_status
  FOR UPDATE TO authenticated
  USING (public._op_scope_check(operation_id))
  WITH CHECK (public._op_scope_check(operation_id));

CREATE POLICY "meta_ad_status_op_scope_delete" ON public.meta_ad_status
  FOR DELETE TO authenticated
  USING (public._op_scope_check(operation_id));

CREATE TRIGGER trg_meta_ad_status_updated
  BEFORE UPDATE ON public.meta_ad_status
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();