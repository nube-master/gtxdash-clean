DROP POLICY IF EXISTS tenant_isolation ON public.meta_ad_accounts;
CREATE POLICY tenant_isolation ON public.meta_ad_accounts
  FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR operation_id IN (SELECT om.operation_id FROM public.operation_members om WHERE om.user_id = auth.uid())
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR operation_id IN (SELECT om.operation_id FROM public.operation_members om WHERE om.user_id = auth.uid())
  );