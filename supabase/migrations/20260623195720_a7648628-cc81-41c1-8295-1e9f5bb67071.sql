
DROP FUNCTION IF EXISTS public.get_pacing_sales_match_stats();

CREATE FUNCTION public.get_pacing_sales_match_stats()
RETURNS TABLE(total_sales bigint, matched_sales bigint, unmatched_sales bigint, unmatched_revenue numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH t AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date d),
  s AS (
    SELECT public.normalize_campaign_key(utm_campaign) k, revenue
      FROM sales_data, t
     WHERE date=t.d AND utm_campaign IS NOT NULL
       AND revenue BETWEEN 200 AND 1600
       AND COALESCE(product_name,'') !~* '(upsell|upgrade|last\s*chance|bump|order\s*bump|downsell)'
  ),
  active_keys AS (
    SELECT DISTINCT public.normalize_campaign_key(campaign_name) k
      FROM meta_campaign_status WHERE status='ACTIVE'
  )
  SELECT
    COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE s.k IN (SELECT k FROM active_keys))::bigint,
    COUNT(*) FILTER (WHERE s.k NOT IN (SELECT k FROM active_keys))::bigint,
    COALESCE(SUM(revenue) FILTER (WHERE s.k NOT IN (SELECT k FROM active_keys)), 0)::numeric
  FROM s;
$$;

GRANT EXECUTE ON FUNCTION public.get_pacing_sales_match_stats() TO authenticated, service_role;
