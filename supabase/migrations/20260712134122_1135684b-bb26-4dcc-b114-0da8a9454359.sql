-- F7.3.E.1: 6 tabelas de conteúdo (Template B1)
DO $$
DECLARE
  v_tables TEXT[] := ARRAY[
    'academy_playbooks','academy_courses','academy_modules',
    'academy_lessons','academy_knowledge','academy_lesson_attachments'
  ];
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    EXECUTE format(
      $sql$CREATE POLICY %I ON %I FOR SELECT USING (
        live_user_in_operation(operation_id)
        OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
      )$sql$, 'select_by_operation_v2', v_table);
    EXECUTE format(
      $sql$CREATE POLICY %I ON %I FOR INSERT WITH CHECK (
        live_user_in_operation(operation_id)
        OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
      )$sql$, 'insert_by_operation_v2', v_table);
    EXECUTE format(
      $sql$CREATE POLICY %I ON %I FOR UPDATE USING (
        live_user_in_operation(operation_id)
        OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
      ) WITH CHECK (
        live_user_in_operation(operation_id)
        OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
      )$sql$, 'update_by_operation_v2', v_table);
    EXECUTE format(
      $sql$CREATE POLICY %I ON %I FOR DELETE USING (
        (live_user_in_operation(operation_id) AND has_role(auth.uid(),'admin'))
        OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
      )$sql$, 'delete_by_operation_v2', v_table);
    INSERT INTO _migration_log(phase, step, table_name, status, completed_at, metadata)
    VALUES ('F7.3.E', 'create_v2_' || v_table, v_table, 'completed', NOW(),
            jsonb_build_object('template','B1','policies',4,'category','academy_content'));
  END LOOP;
END $$;

-- F7.3.E.2: academy_comments (Template B2 — owner-delete + insert-as-self)
CREATE POLICY "select_by_operation_v2" ON academy_comments
FOR SELECT USING (
  live_user_in_operation(operation_id)
  OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
);

CREATE POLICY "insert_by_operation_v2" ON academy_comments
FOR INSERT WITH CHECK (
  (live_user_in_operation(operation_id) AND auth.uid() = user_id)
  OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
);

CREATE POLICY "update_by_operation_v2" ON academy_comments
FOR UPDATE USING (
  (live_user_in_operation(operation_id) AND auth.uid() = user_id)
  OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
) WITH CHECK (
  (live_user_in_operation(operation_id) AND auth.uid() = user_id)
  OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
);

CREATE POLICY "delete_by_operation_v2" ON academy_comments
FOR DELETE USING (
  (live_user_in_operation(operation_id) AND (auth.uid() = user_id OR has_role(auth.uid(),'admin')))
  OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
);

INSERT INTO _migration_log(phase, step, table_name, status, completed_at, metadata)
VALUES ('F7.3.E', 'create_v2_academy_comments', 'academy_comments', 'completed', NOW(),
        jsonb_build_object('template','B2','policies',4,'category','academy_comments',
                           'owner_delete_via','user_id','insert_as_self',true));