CREATE OR REPLACE FUNCTION public.normalize_campaign_key(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT NULLIF(
    trim(regexp_replace(
      lower(regexp_replace(
        COALESCE(p,''),
        '\s*-\s*(top|xxx|new|old|kill|test|teste)\M.*$',
        '', 'i'
      )),
      '\s+', ' ', 'g'
    )),
    ''
  );
$$;

-- Diagnostic: now uses ANY status (not only ACTIVE) so renamed/paused campaigns still attribute
CREATE OR REPLACE FUNCTION public.get_pacing_sales_match_stats()
RETURNS TABLE(total_sales bigint, matched_sales bigint, unmatched_sales bigint, unmatched_revenue numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH t AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date d),
  s AS (
    SELECT public.normalize_campaign_key(utm_campaign) k, revenue
      FROM sales_data, t
     WHERE date=t.d AND utm_campaign IS NOT NULL
       AND revenue BETWEEN 900 AND 1600
       AND COALESCE(product_name,'') !~* '(upsell|upgrade|last\s*chance|bump|order\s*bump)'
  ),
  any_keys AS (
    SELECT DISTINCT public.normalize_campaign_key(campaign_name) k
      FROM meta_campaign_status
  )
  SELECT
    COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE s.k IN (SELECT k FROM any_keys))::bigint,
    COUNT(*) FILTER (WHERE s.k NOT IN (SELECT k FROM any_keys))::bigint,
    COALESCE(SUM(revenue) FILTER (WHERE s.k NOT IN (SELECT k FROM any_keys)), 0)::numeric
  FROM s;
$$;