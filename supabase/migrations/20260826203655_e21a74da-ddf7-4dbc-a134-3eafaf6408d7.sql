ALTER TABLE public.backup_20260826b_traffic_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_20260826b_traffic_hourly ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_20260826b_traffic_breakdowns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.backup_20260826b_traffic_data FROM anon, authenticated;
REVOKE ALL ON public.backup_20260826b_traffic_hourly FROM anon, authenticated;
REVOKE ALL ON public.backup_20260826b_traffic_breakdowns FROM anon, authenticated;
GRANT ALL ON public.backup_20260826b_traffic_data TO service_role;
GRANT ALL ON public.backup_20260826b_traffic_hourly TO service_role;
GRANT ALL ON public.backup_20260826b_traffic_breakdowns TO service_role;