INSERT INTO public.app_settings (key, value, operation_id)
SELECT 'meta_ads_access_token', value, '8707b3f8-ab41-4a63-902c-9ab97fe50c8a'
FROM public.app_settings
WHERE key = 'meta_ads_access_token' 
  AND (operation_id = '1dd606e3-dac2-4064-b863-9784307c9e98' OR operation_id IS NULL)
ON CONFLICT (key, operation_id) DO UPDATE SET value = EXCLUDED.value;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;