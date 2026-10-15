DO $$
DECLARE
  v_tables TEXT[] := ARRAY[
    'treasury_topups','payoneer_transactions','meta_payment_transactions',
    'daily_card_charges','vturb_performance_daily'
  ];
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    EXECUTE format(
      $sql$CREATE POLICY %I ON %I FOR SELECT USING (
        live_user_in_operation(operation_id)
        OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
      )$sql$,
      'select_by_operation_v2', v_table
    );

    EXECUTE format(
      $sql$CREATE POLICY %I ON %I FOR INSERT WITH CHECK (
        live_user_in_operation(operation_id)
        OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
      )$sql$,
      'insert_by_operation_v2', v_table
    );

    EXECUTE format(
      $sql$CREATE POLICY %I ON %I FOR UPDATE USING (
        live_user_in_operation(operation_id)
        OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
      ) WITH CHECK (
        live_user_in_operation(operation_id)
        OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
      )$sql$,
      'update_by_operation_v2', v_table
    );

    EXECUTE format(
      $sql$CREATE POLICY %I ON %I FOR DELETE USING (
        (live_user_in_operation(operation_id) AND has_role(auth.uid(),'admin'))
        OR EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
      )$sql$,
      'delete_by_operation_v2', v_table
    );

    INSERT INTO _migration_log(phase, step, table_name, status, completed_at, metadata)
    VALUES ('F7.3.C', 'create_v2_' || v_table, v_table,
            'completed', NOW(),
            jsonb_build_object('template','B1','policies',4,'category','financial'));

    RAISE NOTICE 'Criadas 4 policies _v2 em %', v_table;
  END LOOP;
END $$;