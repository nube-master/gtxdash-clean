REVOKE ALL ON FUNCTION public.get_creative_traffic_normalized_sp(date, date, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_creative_traffic_normalized_sp(date, date, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_creative_traffic_normalized_sp(date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_creative_traffic_normalized_sp(date, date, uuid) TO service_role;