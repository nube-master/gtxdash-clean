-- Backups
CREATE TABLE IF NOT EXISTS public.backup_20260826b_traffic_data AS
SELECT t.* FROM public.traffic_data t
JOIN public.meta_ad_accounts a ON replace(a.account_id,'act_','') = replace(t.account_id,'act_','')
WHERE a.currency <> 'BRL' AND t.created_at < '2026-08-21' AND COALESCE(t.fx_rate,0) > 1 AND COALESCE(t.spend,0) > 0
  AND NOT EXISTS (SELECT 1 FROM public.fx_fix_targets f
    WHERE f.date = t.date AND replace(f.account_id,'act_','') = replace(t.account_id,'act_',''));

CREATE TABLE IF NOT EXISTS public.backup_20260826b_traffic_hourly AS
SELECT t.* FROM public.traffic_data_hourly t
JOIN public.meta_ad_accounts a ON replace(a.account_id,'act_','') = replace(t.account_id,'act_','')
WHERE a.currency <> 'BRL' AND t.created_at < '2026-08-21' AND COALESCE(t.fx_rate,0) > 1 AND COALESCE(t.spend,0) > 0
  AND NOT EXISTS (SELECT 1 FROM public.fx_fix_targets f
    WHERE f.date = t.date AND replace(f.account_id,'act_','') = replace(t.account_id,'act_',''));

CREATE TABLE IF NOT EXISTS public.backup_20260826b_traffic_breakdowns AS
SELECT t.* FROM public.traffic_breakdowns t
JOIN public.meta_ad_accounts a ON replace(a.account_id,'act_','') = replace(t.account_id,'act_','')
WHERE a.currency <> 'BRL' AND t.created_at < '2026-08-21' AND COALESCE(t.fx_rate,0) > 1 AND COALESCE(t.spend,0) > 0
  AND NOT EXISTS (SELECT 1 FROM public.fx_fix_targets f
    WHERE f.date = t.date AND replace(f.account_id,'act_','') = replace(t.account_id,'act_',''));

-- Fix: spend guardava BRL => spend_brl recebe o BRL e spend volta pra moeda nativa
UPDATE public.traffic_data t
SET spend_brl = t.spend, spend = t.spend / t.fx_rate
FROM public.backup_20260826b_traffic_data b
WHERE b.id = t.id;

UPDATE public.traffic_data_hourly t
SET spend_brl = t.spend, spend = t.spend / t.fx_rate
FROM public.backup_20260826b_traffic_hourly b
WHERE b.id = t.id;

UPDATE public.traffic_breakdowns t
SET spend_brl = t.spend, spend = t.spend / t.fx_rate
FROM public.backup_20260826b_traffic_breakdowns b
WHERE b.id = t.id;