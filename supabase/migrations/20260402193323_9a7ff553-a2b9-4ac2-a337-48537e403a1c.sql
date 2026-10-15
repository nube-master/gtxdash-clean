
-- Fix: Reatribuir registros redtrack_events da ESCALIFY (que não tem configuração)
-- para a operação correta baseado no account_id da conta Meta
-- Registros cujo utm_source (FB_<account_id>) pertence à GTX MIDIA devem voltar para GTX MIDIA
UPDATE public.redtrack_events r
SET operation_id = a.operation_id
FROM public.meta_ad_accounts a
WHERE r.operation_id = '6a26a6dd-d083-4e76-926c-6b4f282f673b'
  AND r.utm_source IS NOT NULL
  AND r.utm_source LIKE 'FB_%'
  AND a.account_id = REPLACE(r.utm_source, 'FB_', '')
  AND a.operation_id IS NOT NULL
  AND a.operation_id != '6a26a6dd-d083-4e76-926c-6b4f282f673b';

-- For any remaining with utm_source = 'facebook' (no account), reassign to GTX MIDIA
UPDATE public.redtrack_events
SET operation_id = '0b758a2b-1b92-4769-b47b-416c567e320d'
WHERE operation_id = '6a26a6dd-d083-4e76-926c-6b4f282f673b';
