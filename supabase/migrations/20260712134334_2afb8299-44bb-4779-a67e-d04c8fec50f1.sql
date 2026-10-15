DO $$
DECLARE
  v_row RECORD;
  v_count INT := 0;
BEGIN
  FOR v_row IN
    SELECT tablename, policyname, cmd 
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'academy_playbooks','academy_courses','academy_modules',
        'academy_lessons','academy_knowledge','academy_lesson_attachments',
        'academy_comments'
      )
      AND policyname NOT LIKE '%_v2'
    ORDER BY tablename, policyname
  LOOP
    EXECUTE format('DROP POLICY %I ON %I', v_row.policyname, v_row.tablename);
    INSERT INTO _migration_log(phase, step, table_name, status, completed_at, metadata)
    VALUES ('F7.3.E.CLEANUP', 'drop_' || v_row.policyname, v_row.tablename, 
            'completed', NOW(),
            jsonb_build_object('cmd', v_row.cmd, 'reason', 'replaced by _v2', 'category', 'academy'));
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE 'Total dropped: %', v_count;
END $$;