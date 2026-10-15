-- F7.3.F.1: talent_jobs (5 policies)
CREATE POLICY "select_public_active_v2" ON talent_jobs
FOR SELECT USING (is_active = true);

CREATE POLICY "select_by_operation_v2" ON talent_jobs
FOR SELECT USING (
  live_user_in_operation(operation_id)
  OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
);

CREATE POLICY "insert_by_operation_v2" ON talent_jobs
FOR INSERT WITH CHECK (
  live_user_in_operation(operation_id)
  OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
);

CREATE POLICY "update_by_operation_v2" ON talent_jobs
FOR UPDATE USING (
  live_user_in_operation(operation_id)
  OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
) WITH CHECK (
  live_user_in_operation(operation_id)
  OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
);

CREATE POLICY "delete_by_operation_v2" ON talent_jobs
FOR DELETE USING (
  (live_user_in_operation(operation_id) AND has_role(auth.uid(),'admin'))
  OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
);

INSERT INTO _migration_log(phase, step, table_name, status, completed_at, metadata)
VALUES ('F7.3.F', 'create_v2_talent_jobs', 'talent_jobs', 'completed', NOW(),
        jsonb_build_object('template','B1+public','policies',5,'category','talent',
                          'note','SELECT split em public (is_active) + operation'));

-- F7.3.F.2: talent_applications (4 policies) — OPÇÃO B
CREATE POLICY "select_by_operation_v2" ON talent_applications
FOR SELECT USING (
  live_user_in_operation(operation_id)
  OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
);

CREATE POLICY "insert_public_v2" ON talent_applications
FOR INSERT WITH CHECK (
  operation_id IN (SELECT operation_id FROM talent_jobs WHERE is_active = true)
);

CREATE POLICY "update_by_operation_v2" ON talent_applications
FOR UPDATE USING (
  live_user_in_operation(operation_id)
  OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
) WITH CHECK (
  live_user_in_operation(operation_id)
  OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
);

CREATE POLICY "delete_by_operation_v2" ON talent_applications
FOR DELETE USING (
  (live_user_in_operation(operation_id) AND has_role(auth.uid(),'admin'))
  OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
);

INSERT INTO _migration_log(phase, step, table_name, status, completed_at, metadata)
VALUES ('F7.3.F', 'create_v2_talent_applications', 'talent_applications', 'completed', NOW(),
        jsonb_build_object('template','B1+public','policies',4,'category','talent',
                          'note','INSERT public preservado (op precisa ter vaga ativa)',
                          'insert_check_style','B'));