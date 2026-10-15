-- 1. Propagar o token mestre para todas as operações ativas na app_settings
-- Já fizemos isso mas vamos garantir
UPDATE public.app_settings 
SET value = jsonb_build_object('token', 'REDACTED_META_TOKEN')
WHERE key = 'meta_ads_access_token' 
  AND operation_id IN ('8707b3f8-ab41-4a63-902c-9ab97fe50c8a', '1dd606e3-dac2-4064-b863-9784307c9e98', '0b758a2b-1b92-4769-b47b-416c567e320d');

-- 2. Corrigir permissões na meta_token_permissions para as contas da FAHTO
-- Garantir que can_read=true para todas as contas de todas as operações ativas
UPDATE public.meta_token_permissions
SET can_read = true, last_error = NULL
WHERE account_id IN (
  SELECT REPLACE(account_id, 'act_', '') 
  FROM public.meta_accounts 
  WHERE operation_id IN ('8707b3f8-ab41-4a63-902c-9ab97fe50c8a', '1dd606e3-dac2-4064-b863-9784307c9e98', '0b758a2b-1b92-4769-b47b-416c567e320d')
);

-- 3. Trigger manual de sync-meta-fast para limpar estados
SELECT net.http_post(
    url:='https://taeduxiandktefcwgspx.supabase.co/functions/v1/sync-meta-fast',
    headers:='{"Content-Type": "application/json", "apikey": "REDACTED_JWT"}'::jsonb,
    body:='{"force": true}'::jsonb
);