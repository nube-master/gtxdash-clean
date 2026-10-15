-- Recria policies cmd=ALL que tinham só USING (sem WITH CHECK), o que bloqueava INSERT/UPDATE.
-- WITH CHECK passa a usar a mesma expressão do USING de cada policy.

DO $$
DECLARE
  t text;
  member_expr text := '(operation_id IN (SELECT operation_id FROM public.operation_members WHERE user_id = auth.uid()))';
BEGIN
  -- 8 tabelas com tenant_isolation por membership
  FOREACH t IN ARRAY ARRAY['traffic_data','sales_data','cod_orders','redtrack_events','meta_account_financials','notification_recipients','pacing_action_log','integration_logs'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON public.%I FOR ALL TO authenticated USING %s WITH CHECK %s', t, member_expr, member_expr);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Users can manage their operation taboola accounts" ON public.taboola_ad_accounts;
CREATE POLICY "Users can manage their operation taboola accounts" ON public.taboola_ad_accounts
FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Operation isolation" ON public.meta_accounts;
CREATE POLICY "Operation isolation" ON public.meta_accounts
FOR ALL TO authenticated
USING (strict_op_scope(operation_id))
WITH CHECK (strict_op_scope(operation_id));

DROP POLICY IF EXISTS "Operation isolation" ON public.meta_pacing_audit;
CREATE POLICY "Operation isolation" ON public.meta_pacing_audit
FOR ALL TO authenticated
USING (strict_op_scope(operation_id))
WITH CHECK (strict_op_scope(operation_id));

DROP POLICY IF EXISTS admin_only ON public.orphan_orders;
CREATE POLICY admin_only ON public.orphan_orders
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.operation_members WHERE user_id = auth.uid() AND role = ANY (ARRAY['admin'::text, 'owner'::text])))
WITH CHECK (EXISTS (SELECT 1 FROM public.operation_members WHERE user_id = auth.uid() AND role = ANY (ARRAY['admin'::text, 'owner'::text])));

DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.redtrack_conversions;
CREATE POLICY "Enable all for authenticated users" ON public.redtrack_conversions
FOR ALL TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can manage operations" ON public.operations;
CREATE POLICY "Admins can manage operations" ON public.operations
FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Super admins can manage super_admins" ON public.super_admins;
CREATE POLICY "Super admins can manage super_admins" ON public.super_admins
FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));