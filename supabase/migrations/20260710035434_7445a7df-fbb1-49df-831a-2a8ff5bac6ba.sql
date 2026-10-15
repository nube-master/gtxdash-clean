-- notification_recipients (B1)
CREATE POLICY "select_by_operation_v2" ON notification_recipients
FOR SELECT USING (
  live_user_in_operation(operation_id)
  OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
);
CREATE POLICY "insert_by_operation_v2" ON notification_recipients
FOR INSERT WITH CHECK (
  live_user_in_operation(operation_id)
  OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
);
CREATE POLICY "update_by_operation_v2" ON notification_recipients
FOR UPDATE USING (
  live_user_in_operation(operation_id)
  OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
) WITH CHECK (
  live_user_in_operation(operation_id)
  OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
);
CREATE POLICY "delete_by_operation_v2" ON notification_recipients
FOR DELETE USING (
  (live_user_in_operation(operation_id) AND has_role(auth.uid(),'admin'))
  OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
);
INSERT INTO _migration_log(phase, step, table_name, status, completed_at, metadata)
VALUES ('F7.3.A', 'create_v2_notification_recipients', 'notification_recipients',
        'completed', NOW(),
        jsonb_build_object('template','B1','policies_created',4,'old_had_true_select',true));

-- recipient_notification_prefs (B1)
CREATE POLICY "select_by_operation_v2" ON recipient_notification_prefs
FOR SELECT USING (
  live_user_in_operation(operation_id)
  OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
);
CREATE POLICY "insert_by_operation_v2" ON recipient_notification_prefs
FOR INSERT WITH CHECK (
  live_user_in_operation(operation_id)
  OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
);
CREATE POLICY "update_by_operation_v2" ON recipient_notification_prefs
FOR UPDATE USING (
  live_user_in_operation(operation_id)
  OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
) WITH CHECK (
  live_user_in_operation(operation_id)
  OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
);
CREATE POLICY "delete_by_operation_v2" ON recipient_notification_prefs
FOR DELETE USING (
  (live_user_in_operation(operation_id) AND has_role(auth.uid(),'admin'))
  OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
);
INSERT INTO _migration_log(phase, step, table_name, status, completed_at, metadata)
VALUES ('F7.3.A', 'create_v2_recipient_notification_prefs', 'recipient_notification_prefs',
        'completed', NOW(),
        jsonb_build_object('template','B1','policies_created',4,'old_had_true_select',true,
                          'known_debt','op_id não validado contra recipient.op_id — F8'));