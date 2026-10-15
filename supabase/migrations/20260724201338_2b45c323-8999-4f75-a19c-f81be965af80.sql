
CREATE TABLE IF NOT EXISTS public.meta_adset_status (
  account_id text NOT NULL,
  adset_id text NOT NULL,
  campaign_id text NOT NULL,
  campaign_name text,
  adset_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'UNKNOWN',
  effective_status text NOT NULL DEFAULT 'UNKNOWN',
  daily_budget numeric NOT NULL DEFAULT 0,
  lifetime_budget numeric NOT NULL DEFAULT 0,
  bid_strategy text,
  bid_amount numeric,
  bid_amount_currency text,
  optimization_goal text,
  billing_event text,
  operation_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, adset_id)
);

CREATE INDEX IF NOT EXISTS idx_meta_adset_status_campaign ON public.meta_adset_status(campaign_id);
CREATE INDEX IF NOT EXISTS idx_meta_adset_status_operation ON public.meta_adset_status(operation_id);
CREATE INDEX IF NOT EXISTS idx_meta_adset_status_status ON public.meta_adset_status(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_adset_status TO authenticated;
GRANT ALL ON public.meta_adset_status TO service_role;

ALTER TABLE public.meta_adset_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "adset_strict_select" ON public.meta_adset_status
  FOR SELECT TO authenticated USING (public.strict_op_scope(operation_id));
CREATE POLICY "adset_strict_insert" ON public.meta_adset_status
  FOR INSERT TO authenticated WITH CHECK (public.strict_op_scope(operation_id));
CREATE POLICY "adset_strict_update" ON public.meta_adset_status
  FOR UPDATE TO authenticated USING (public.strict_op_scope(operation_id))
  WITH CHECK (public.strict_op_scope(operation_id));
CREATE POLICY "adset_strict_delete" ON public.meta_adset_status
  FOR DELETE TO authenticated USING (
    public.strict_op_scope(operation_id) AND (
      public.admin_da_op(operation_id) OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())
    )
  );
