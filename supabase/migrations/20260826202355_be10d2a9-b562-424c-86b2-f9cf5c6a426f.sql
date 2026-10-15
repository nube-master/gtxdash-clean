CREATE TABLE IF NOT EXISTS public.backup_20260826_traffic_data AS
SELECT * FROM public.traffic_data WHERE COALESCE(currency,'BRL') <> 'BRL' AND date >= '2026-02-01';

CREATE TABLE IF NOT EXISTS public.backup_20260826_traffic_data_hourly AS
SELECT * FROM public.traffic_data_hourly WHERE COALESCE(currency,'BRL') <> 'BRL' AND date >= '2026-02-01';

CREATE TABLE IF NOT EXISTS public.backup_20260826_traffic_breakdowns AS
SELECT * FROM public.traffic_breakdowns WHERE COALESCE(currency,'BRL') <> 'BRL' AND date >= '2026-02-01';

CREATE TABLE IF NOT EXISTS public.fx_fix_targets (
  operation_id uuid NOT NULL,
  account_id text NOT NULL,
  date date NOT NULL,
  api_spend numeric,
  sys_spend numeric,
  ratio numeric,
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (operation_id, account_id, date)
);

GRANT SELECT ON public.fx_fix_targets TO authenticated;
GRANT ALL ON public.fx_fix_targets TO service_role;
ALTER TABLE public.fx_fix_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fx_fix_targets_admin_read" ON public.fx_fix_targets
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));