
CREATE OR REPLACE FUNCTION public.admin_da_op(_op_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.operation_members
    WHERE operation_id = _op_id AND user_id = auth.uid()
      AND status = 'active' AND role = 'admin'
  )
$$;

CREATE OR REPLACE FUNCTION public.cross_op_intent()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(current_setting('app.cross_op_intent', true) = 'on', false)
     AND EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())
$$;

GRANT EXECUTE ON FUNCTION public.admin_da_op(uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.cross_op_intent() TO authenticated, anon, service_role;

DROP POLICY IF EXISTS "Authenticated can read operation_members" ON public.operation_members;
DROP POLICY IF EXISTS "Admins can manage operation_members"      ON public.operation_members;

CREATE POLICY om_select_own_or_admin ON public.operation_members FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.admin_da_op(operation_id)
    OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())
  );

CREATE POLICY om_insert_admin ON public.operation_members FOR INSERT TO authenticated
  WITH CHECK (
    public.admin_da_op(operation_id)
    OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())
  );

CREATE POLICY om_update_admin ON public.operation_members FOR UPDATE TO authenticated
  USING (
    public.admin_da_op(operation_id)
    OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())
  )
  WITH CHECK (
    public.admin_da_op(operation_id)
    OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())
  );

CREATE POLICY om_delete_admin ON public.operation_members FOR DELETE TO authenticated
  USING (
    public.admin_da_op(operation_id)
    OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.operation_members TO authenticated;
GRANT ALL ON public.operation_members TO service_role;

INSERT INTO public._migration_log (phase, step, status, completed_at, metadata)
VALUES ('F9.DIA1C.0','operation_members_own_or_admin','completed', now(),
  jsonb_build_object(
    'risk_before', 'A — 4 global admins podiam gerenciar cross-op; SELECT wide-open',
    'legacy_policies_dumped', jsonb_build_object(
      'select_wide_open', 'FOR SELECT TO authenticated USING (true)',
      'all_global_admin', 'FOR ALL TO authenticated USING (has_role(auth.uid(),admin::app_role))'
    ),
    'new_policies', jsonb_build_array('om_select_own_or_admin','om_insert_admin','om_update_admin','om_delete_admin'),
    'new_helpers', jsonb_build_array('admin_da_op(uuid)','cross_op_intent()'),
    'global_admins_count', 4
  )
);
