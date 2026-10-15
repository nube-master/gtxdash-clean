DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sandbox_exec') THEN
    EXECUTE 'GRANT authenticated TO sandbox_exec';
  END IF;
END $$;