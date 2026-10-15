
CREATE OR REPLACE FUNCTION public.refresh_mv_traffic_spend()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_traffic_spend_by_account;
END;
$$;
