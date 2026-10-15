-- 1) Contas cobertas pelos tokens novos → ativas e limpas
WITH covered AS (
  SELECT DISTINCT unnest(account_ids) AS aid
  FROM public.operation_credentials
  WHERE operation_id = '0b758a2b-1b92-4769-b47b-416c567e320d'
    AND provider = 'meta_ads'
    AND profile_key IN ('ads_by_gtx', 'ads_by_studio')
), changed_on AS (
  UPDATE public.meta_ad_accounts m
     SET is_active = true,
         1=1,
         disable_reason = NULL,
         updated_at = now()
    FROM covered c
   WHERE m.operation_id = '0b758a2b-1b92-4769-b47b-416c567e320d'
     AND m.account_id = c.aid
     AND (m.is_active IS DISTINCT FROM true
          OR m.account_status IS DISTINCT FROM 1
          OR m.disable_reason IS NOT NULL)
  RETURNING m.account_id, m.account_status
)
INSERT INTO public.account_status_log (operation_id, account_id, account_name, old_status, new_status, changed_at)
SELECT '0b758a2b-1b92-4769-b47b-416c567e320d', account_id, 'token_realignment_2026_07_28:enable_covered', NULL::integer, 1, now()
FROM changed_on;

-- 2) Contas GTX fora das listas dos novos tokens → desativar (não deletar histórico)
WITH covered AS (
  SELECT DISTINCT unnest(account_ids) AS aid
  FROM public.operation_credentials
  WHERE operation_id = '0b758a2b-1b92-4769-b47b-416c567e320d'
    AND provider = 'meta_ads'
    AND profile_key IN ('ads_by_gtx', 'ads_by_studio')
), changed_off AS (
  UPDATE public.meta_ad_accounts m
     SET is_active = false,
         disable_reason = COALESCE(NULLIF(m.disable_reason, ''), 'Fora do escopo dos tokens ativos (realinhamento 2026-07-28)'),
         updated_at = now()
   WHERE m.operation_id = '0b758a2b-1b92-4769-b47b-416c567e320d'
     AND m.is_active = true
     AND NOT EXISTS (SELECT 1 FROM covered c WHERE c.aid = m.account_id)
  RETURNING m.account_id, m.account_status
)
INSERT INTO public.account_status_log (operation_id, account_id, account_name, old_status, new_status, changed_at)
SELECT '0b758a2b-1b92-4769-b47b-416c567e320d', account_id, 'token_realignment_2026_07_28:deactivate_out_of_scope', account_status, account_status, now()
FROM changed_off;