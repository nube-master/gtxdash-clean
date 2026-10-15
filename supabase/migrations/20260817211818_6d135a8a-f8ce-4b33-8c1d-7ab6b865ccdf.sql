BEGIN;

-- Enable RLS nas tabelas críticas (9 tabelas + orphan_orders)
ALTER TABLE public.traffic_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cod_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redtrack_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_ad_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_account_financials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pacing_action_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_logs ENABLE ROW LEVEL SECURITY;

-- 1. traffic_data
CREATE POLICY tenant_isolation ON public.traffic_data FOR ALL 
  TO authenticated
  USING (
    operation_id IN (
      SELECT operation_id FROM public.operation_members WHERE user_id = auth.uid()
    )
  );

-- 2. sales_data
CREATE POLICY tenant_isolation ON public.sales_data FOR ALL 
  TO authenticated
  USING (
    operation_id IN (
      SELECT operation_id FROM public.operation_members WHERE user_id = auth.uid()
    )
  );

-- 3. cod_orders
CREATE POLICY tenant_isolation ON public.cod_orders FOR ALL 
  TO authenticated
  USING (
    operation_id IN (
      SELECT operation_id FROM public.operation_members WHERE user_id = auth.uid()
    )
  );

-- 4. redtrack_events
CREATE POLICY tenant_isolation ON public.redtrack_events FOR ALL 
  TO authenticated
  USING (
    operation_id IN (
      SELECT operation_id FROM public.operation_members WHERE user_id = auth.uid()
    )
  );

-- 5. meta_ad_accounts
CREATE POLICY tenant_isolation ON public.meta_ad_accounts FOR ALL 
  TO authenticated
  USING (
    operation_id IN (
      SELECT operation_id FROM public.operation_members WHERE user_id = auth.uid()
    )
  );

-- 6. meta_account_financials
CREATE POLICY tenant_isolation ON public.meta_account_financials FOR ALL 
  TO authenticated
  USING (
    operation_id IN (
      SELECT operation_id FROM public.operation_members WHERE user_id = auth.uid()
    )
  );

-- 7. notification_recipients
CREATE POLICY tenant_isolation ON public.notification_recipients FOR ALL 
  TO authenticated
  USING (
    operation_id IN (
      SELECT operation_id FROM public.operation_members WHERE user_id = auth.uid()
    )
  );

-- 8. pacing_action_log
CREATE POLICY tenant_isolation ON public.pacing_action_log FOR ALL 
  TO authenticated
  USING (
    operation_id IN (
      SELECT operation_id FROM public.operation_members WHERE user_id = auth.uid()
    )
  );

-- 9. integration_logs
CREATE POLICY tenant_isolation ON public.integration_logs FOR ALL 
  TO authenticated
  USING (
    operation_id IN (
      SELECT operation_id FROM public.operation_members WHERE user_id = auth.uid()
    )
  );

-- Orphan Orders: Admin only
ALTER TABLE public.orphan_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_only ON public.orphan_orders FOR ALL 
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.operation_members 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'owner')
    )
  );

COMMIT;