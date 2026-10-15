CREATE TABLE IF NOT EXISTS public.backup_20260826c_traffic_breakdowns AS
WITH h AS (
  SELECT replace(account_id,'act_','') acc, date, SUM(spend) s
  FROM public.traffic_data_hourly GROUP BY 1,2
), bd AS (
  SELECT t.date, replace(t.account_id,'act_','') acc, SUM(t.spend) s
  FROM public.traffic_breakdowns t
  JOIN public.fx_fix_targets f ON f.date=t.date AND replace(f.account_id,'act_','')=replace(t.account_id,'act_','')
  GROUP BY 1,2
), bad AS (
  SELECT bd.acc, bd.date FROM bd JOIN h ON h.acc=bd.acc AND h.date=bd.date
  WHERE h.s > 0 AND bd.s/h.s BETWEEN 4 AND 7
)
SELECT t.* FROM public.traffic_breakdowns t
JOIN bad ON bad.date=t.date AND bad.acc=replace(t.account_id,'act_','')
WHERE COALESCE(t.fx_rate,0) > 1 AND COALESCE(t.spend,0) > 0;

UPDATE public.traffic_breakdowns t
SET spend_brl = t.spend, spend = t.spend / t.fx_rate
FROM public.backup_20260826c_traffic_breakdowns b
WHERE b.id = t.id;

ALTER TABLE public.backup_20260826c_traffic_breakdowns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.backup_20260826c_traffic_breakdowns FROM anon, authenticated;
GRANT ALL ON public.backup_20260826c_traffic_breakdowns TO service_role;