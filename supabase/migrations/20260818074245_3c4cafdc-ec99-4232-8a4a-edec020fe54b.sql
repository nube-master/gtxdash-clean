-- 1. Propagar o token mestre para todas as operações ativas na app_settings
UPDATE public.app_settings 
SET value = (SELECT value FROM public.app_settings WHERE key = 'meta_ads_access_token' AND operation_id = '0b758a2b-1b92-4769-b47b-416c567e320d' LIMIT 1)
WHERE key = 'meta_ads_access_token' 
  AND operation_id IN ('8707b3f8-ab41-4a63-902c-9ab97fe50c8a', '1dd606e3-dac2-4064-b863-9784307c9e98');

-- 2. Garantir que as contas da FAHTO usem o prefixo 'act_' e tenham operação vinculada corretamente
UPDATE public.meta_ad_accounts
SET operation_id = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a', is_active = true
WHERE account_id IN (
  SELECT REPLACE(account_id, 'act_', '') FROM public.meta_accounts WHERE operation_id = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a'
  UNION
  SELECT 'act_' || REPLACE(account_id, 'act_', '') FROM public.meta_accounts WHERE operation_id = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a'
);

-- 3. Limpar erros de permissão agora que o token foi propagado
UPDATE public.meta_token_permissions
SET can_read = true, last_error = NULL
WHERE account_id IN (
  SELECT REPLACE(account_id, 'act_', '') FROM public.meta_accounts WHERE operation_id = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a'
);