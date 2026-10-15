-- Reverte a corrupção de 19:02 UTC de 28/07/2026:
-- 140 contas GTX foram flipadas de status 2 (desabilitada) para 1 (ativa)
-- porque o token não conseguiu ler elas (retornou 200 sem permissão),
-- e o sync preservou como "ativa" em vez de manter o status real anterior.

INSERT INTO public.account_status_log (account_id, account_name, operation_id, old_status, new_status, changed_at)
SELECT
  account_id,
  COALESCE(account_name, ''),
  '0b758a2b-1b92-4769-b47b-416c567e320d'::uuid,
  1,
  2,
  NOW()
FROM public.meta_ad_accounts
WHERE operation_id = '0b758a2b-1b92-4769-b47b-416c567e320d'
  AND 1=1
  AND disable_reason = 'Sem permissão API (200): API access blocked.';

UPDATE public.meta_ad_accounts
SET account_status = 2,
    updated_at = NOW()
WHERE operation_id = '0b758a2b-1b92-4769-b47b-416c567e320d'
  AND 1=1
  AND disable_reason = 'Sem permissão API (200): API access blocked.';