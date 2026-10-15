-- Remove PK antiga (só em key) e cria constraint composta que o onConflict enxerga
ALTER TABLE public.app_settings DROP CONSTRAINT IF EXISTS app_settings_pkey;

ALTER TABLE public.app_settings ALTER COLUMN operation_id SET NOT NULL;

ALTER TABLE public.app_settings
  ADD CONSTRAINT app_settings_key_operation_key UNIQUE (key, operation_id);