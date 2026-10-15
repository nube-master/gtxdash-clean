GRANT SELECT, INSERT, UPDATE, DELETE ON public.traffic_data TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.traffic_data_hourly TO service_role;
GRANT SELECT ON public.meta_ad_accounts TO authenticated;
GRANT SELECT ON public.traffic_data TO authenticated;
GRANT SELECT ON public.traffic_data_hourly TO authenticated;