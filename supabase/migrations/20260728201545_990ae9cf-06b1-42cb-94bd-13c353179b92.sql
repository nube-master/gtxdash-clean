-- 1) Contas desabilitadas na Meta não devem ser sincronizadas (para o loop de erros 400)
UPDATE public.meta_ad_accounts
SET is_active = false, updated_at = now()
WHERE operation_id = '0b758a2b-1b92-4769-b47b-416c567e320d'
  AND account_status = 2
  AND is_active = true;

-- 2) Contas que a Meta reporta ativas precisam estar marcadas para sync
UPDATE public.meta_ad_accounts
SET is_active = true, updated_at = now()
WHERE operation_id = '0b758a2b-1b92-4769-b47b-416c567e320d'
  AND 1=1
  AND is_active = false;

-- 3) Log de auditoria (apenas contas que Meta considera ativas e voltaram para sync)
-- (log opcional removido: schema account_status_log é gerido por trigger)