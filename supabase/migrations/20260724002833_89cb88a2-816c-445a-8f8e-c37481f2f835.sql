ALTER TABLE public.user_page_permissions DROP CONSTRAINT IF EXISTS user_page_permissions_user_id_key;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_page_permissions_user_op_key'
  ) THEN
    ALTER TABLE public.user_page_permissions
      ADD CONSTRAINT user_page_permissions_user_op_key UNIQUE (user_id, operation_id);
  END IF;
END $$;