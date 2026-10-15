UPDATE public.app_settings 
SET value = '{"token": "REDACTED_META_TOKEN"}'::jsonb
WHERE key = 'meta_ads_access_token' 
  AND operation_id = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a';