-- ============================================
-- TABELA: integration_logs
-- ============================================
CREATE POLICY "select_by_operation_v2" ON integration_logs
FOR SELECT USING (
  live_user_in_operation(operation_id)
  OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
);

CREATE POLICY "insert_by_operation_v2" ON integration_logs
FOR INSERT WITH CHECK (
  live_user_in_operation(operation_id)
  OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
);

CREATE POLICY "update_by_operation_v2" ON integration_logs
FOR UPDATE USING (
  live_user_in_operation(operation_id)
  OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
) WITH CHECK (
  live_user_in_operation(operation_id)
  OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
);

CREATE POLICY "delete_by_operation_v2" ON integration_logs
FOR DELETE USING (
  (live_user_in_operation(operation_id) AND has_role(auth.uid(),'admin'))
  OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
);

INSERT INTO _migration_log(phase, step, table_name, status, completed_at, metadata)
VALUES ('F7.3.B', 'create_v2_integration_logs', 'integration_logs',
        'completed', NOW(), jsonb_build_object('template','B1','policies',4));

-- ============================================
-- TABELA: user_activity_logs
-- ============================================
CREATE POLICY "select_by_operation_v2" ON user_activity_logs
FOR SELECT USING (
  live_user_in_operation(operation_id)
  OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
);

CREATE POLICY "insert_by_operation_v2" ON user_activity_logs
FOR INSERT WITH CHECK (
  live_user_in_operation(operation_id)
  OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
);

CREATE POLICY "update_by_operation_v2" ON user_activity_logs
FOR UPDATE USING (
  live_user_in_operation(operation_id)
  OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
) WITH CHECK (
  live_user_in_operation(operation_id)
  OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
);

CREATE POLICY "delete_by_operation_v2" ON user_activity_logs
FOR DELETE USING (
  (live_user_in_operation(operation_id) AND has_role(auth.uid(),'admin'))
  OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
);

INSERT INTO _migration_log(phase, step, table_name, status, completed_at, metadata)
VALUES ('F7.3.B', 'create_v2_user_activity_logs', 'user_activity_logs',
        'completed', NOW(), jsonb_build_object('template','B1','policies',4));

-- ============================================
-- TABELA: system_logs
-- ============================================
CREATE POLICY "select_by_operation_v2" ON system_logs
FOR SELECT USING (
  live_user_in_operation(operation_id)
  OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
);

CREATE POLICY "insert_by_operation_v2" ON system_logs
FOR INSERT WITH CHECK (
  live_user_in_operation(operation_id)
  OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
);

CREATE POLICY "update_by_operation_v2" ON system_logs
FOR UPDATE USING (
  live_user_in_operation(operation_id)
  OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
) WITH CHECK (
  live_user_in_operation(operation_id)
  OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
);

CREATE POLICY "delete_by_operation_v2" ON system_logs
FOR DELETE USING (
  (live_user_in_operation(operation_id) AND has_role(auth.uid(),'admin'))
  OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
);

INSERT INTO _migration_log(phase, step, table_name, status, completed_at, metadata)
VALUES ('F7.3.B', 'create_v2_system_logs', 'system_logs',
        'completed', NOW(), jsonb_build_object('template','B1','policies',4));

-- ============================================
-- TABELA: reconciliation_alerts
-- ============================================
CREATE POLICY "select_by_operation_v2" ON reconciliation_alerts
FOR SELECT USING (
  live_user_in_operation(operation_id)
  OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
);

CREATE POLICY "insert_by_operation_v2" ON reconciliation_alerts
FOR INSERT WITH CHECK (
  live_user_in_operation(operation_id)
  OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
);

CREATE POLICY "update_by_operation_v2" ON reconciliation_alerts
FOR UPDATE USING (
  live_user_in_operation(operation_id)
  OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
) WITH CHECK (
  live_user_in_operation(operation_id)
  OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
);

CREATE POLICY "delete_by_operation_v2" ON reconciliation_alerts
FOR DELETE USING (
  (live_user_in_operation(operation_id) AND has_role(auth.uid(),'admin'))
  OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
);

INSERT INTO _migration_log(phase, step, table_name, status, completed_at, metadata)
VALUES ('F7.3.B', 'create_v2_reconciliation_alerts', 'reconciliation_alerts',
        'completed', NOW(), jsonb_build_object('template','B1','policies',4));