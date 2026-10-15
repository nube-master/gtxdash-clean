-- F7.3.G: user_page_permissions (Caso A — B1 + own_select)

CREATE POLICY "select_own_v2" ON public.user_page_permissions
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "select_by_operation_v2" ON public.user_page_permissions
FOR SELECT USING (
  live_user_in_operation(operation_id)
  OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
);

CREATE POLICY "insert_by_operation_v2" ON public.user_page_permissions
FOR INSERT WITH CHECK (
  live_user_in_operation(operation_id)
  OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
);

CREATE POLICY "update_by_operation_v2" ON public.user_page_permissions
FOR UPDATE USING (
  live_user_in_operation(operation_id)
  OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
) WITH CHECK (
  live_user_in_operation(operation_id)
  OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
);

CREATE POLICY "delete_by_operation_v2" ON public.user_page_permissions
FOR DELETE USING (
  (live_user_in_operation(operation_id) AND has_role(auth.uid(),'admin'))
  OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
);

INSERT INTO _migration_log(phase, step, table_name, status, completed_at, metadata)
VALUES ('F7.3.G', 'create_v2_user_page_permissions',
  'user_page_permissions', 'completed', NOW(),
  jsonb_build_object('template','B1+own_select','policies',5,
                    'category','permissions',
                    'note','SELECT split — user vê próprias + op vê todas'));
