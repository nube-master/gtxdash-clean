DROP POLICY IF EXISTS tenant_isolation ON public.meta_ad_accounts;

CREATE POLICY tenant_isolation ON public.meta_ad_accounts
FOR ALL TO authenticated
USING (operation_id IN (SELECT operation_id FROM public.operation_members WHERE user_id = auth.uid()))
WITH CHECK (operation_id IN (SELECT operation_id FROM public.operation_members WHERE user_id = auth.uid()));