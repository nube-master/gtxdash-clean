-- A tabela meta_accounts está vazia para GTX e EDD, o que impede a sync-meta-ads de encontrar os tokens.
-- Registrando as contas a partir do histórico de tráfego para restaurar a orquestração.

INSERT INTO public.meta_accounts (account_id, name, operation_id, status, active)
SELECT DISTINCT 
  CASE WHEN account_id LIKE 'act_%' THEN account_id ELSE 'act_' || account_id END as account_id,
  'Restored Account' as name,
  operation_id,
  'ACTIVE' as status,
  true as active
FROM public.traffic_data
WHERE date > NOW() - INTERVAL '30 days'
  AND operation_id IN ('0b758a2b-1b92-4769-b47b-416c567e320d', '1dd606e3-dac2-4064-b863-9784307c9e98')
ON CONFLICT (account_id) DO UPDATE SET 
  operation_id = EXCLUDED.operation_id,
  active = true;

-- Garantir que a sync-meta-fast use o token master para todas as operações ativas
UPDATE public.app_settings 
SET value = (SELECT value FROM public.app_settings WHERE key = 'meta_ads_access_token' AND operation_id = '0b758a2b-1b92-4769-b47b-416c567e320d' LIMIT 1)
WHERE key = 'meta_ads_access_token' 
  AND operation_id IN ('8707b3f8-ab41-4a63-902c-9ab97fe50c8a', '1dd606e3-dac2-4064-b863-9784307c9e98');