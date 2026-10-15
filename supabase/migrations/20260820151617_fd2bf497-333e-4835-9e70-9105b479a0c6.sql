BEGIN;

-- 1. Deduplicar traffic_data: preferir rows COM "act_" (padrão Meta)
-- Se não houver com "act_", normalizar a sem "act_"
DELETE FROM public.traffic_data td_sem
WHERE td_sem.account_id NOT LIKE 'act_%'
  AND EXISTS (
    SELECT 1 FROM public.traffic_data td_com
    WHERE td_com.operation_id = td_sem.operation_id
      AND td_com.account_id = 'act_' || td_sem.account_id
      AND td_com.date = td_sem.date
  );

UPDATE public.traffic_data
SET account_id = 'act_' || account_id
WHERE account_id NOT LIKE 'act_%';

-- 2. Mesmo para meta_ad_accounts
DELETE FROM public.meta_ad_accounts ma_sem
WHERE ma_sem.account_id NOT LIKE 'act_%'
  AND EXISTS (
    SELECT 1 FROM public.meta_ad_accounts ma_com
    WHERE ma_com.operation_id = ma_sem.operation_id
      AND ma_com.account_id = 'act_' || ma_sem.account_id
  );

UPDATE public.meta_ad_accounts
SET account_id = 'act_' || account_id
WHERE account_id NOT LIKE 'act_%';

-- 3. Limpar snapshots FAHTO para forçar recálculo
DELETE FROM public.daily_totals_snapshot
WHERE operation_id = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a'
  AND date >= '2026-08-01';

-- 4. Adicionar CHECK constraints para evitar regressão
ALTER TABLE public.traffic_data ADD CONSTRAINT traffic_data_account_id_format_check CHECK (account_id LIKE 'act_%');
ALTER TABLE public.meta_ad_accounts ADD CONSTRAINT meta_ad_accounts_account_id_format_check CHECK (account_id LIKE 'act_%');

COMMIT;