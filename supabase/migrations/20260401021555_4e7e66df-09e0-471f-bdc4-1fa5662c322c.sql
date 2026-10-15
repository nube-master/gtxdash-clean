ALTER TABLE public.operations 
  ADD COLUMN IF NOT EXISTS max_meta_accounts integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS max_members integer DEFAULT NULL;