-- O token para FAHTO e EDD estava como 'restored_from_env' ou nulo, o que falha na Edge Function.
-- Copiando o token real da operação GTX que é o token master configurado.

UPDATE public.app_settings 
SET value = (SELECT value FROM public.app_settings WHERE key = 'meta_ads_access_token' AND operation_id = '0b758a2b-1b92-4769-b47b-416c567e320d' LIMIT 1)
WHERE key = 'meta_ads_access_token' 
  AND operation_id IN ('8707b3f8-ab41-4a63-902c-9ab97fe50c8a', '1dd606e3-dac2-4064-b863-9784307c9e98');

-- Se por algum motivo não existia o registro para EDD/FAHTO, garantimos a inserção
INSERT INTO public.app_settings (key, value, operation_id)
SELECT 'meta_ads_access_token', value, '8707b3f8-ab41-4a63-902c-9ab97fe50c8a'
FROM public.app_settings
WHERE key = 'meta_ads_access_token' AND operation_id = '0b758a2b-1b92-4769-b47b-416c567e320d'
ON CONFLICT (key, operation_id) DO UPDATE SET value = EXCLUDED.value;

INSERT INTO public.app_settings (key, value, operation_id)
SELECT 'meta_ads_access_token', value, '1dd606e3-dac2-4064-b863-9784307c9e98'
FROM public.app_settings
WHERE key = 'meta_ads_access_token' AND operation_id = '0b758a2b-1b92-4769-b47b-416c567e320d'
ON CONFLICT (key, operation_id) DO UPDATE SET value = EXCLUDED.value;