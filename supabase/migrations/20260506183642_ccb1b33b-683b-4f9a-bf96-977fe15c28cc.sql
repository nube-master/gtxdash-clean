CREATE OR REPLACE FUNCTION public.get_offers_sales_intelligence(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(offer_id uuid, apelido_interno text, produto_real text, nicho text, geo text, sales_count integer, revenue_brl numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH fx AS (
    SELECT COALESCE(
      (SELECT rate FROM exchange_rate_log ORDER BY created_at DESC LIMIT 1),
      5.5
    )::numeric AS rate
  ),
  cp_sales AS (
    SELECT
      s.id AS sale_id, s.date AS d,
      s.utm_campaign, s.utm_source, s.store, s.product_name,
      NULL::text AS rt_campaign, NULL::text AS rt_site,
      NULL::text AS rt_sub5, NULL::text AS rt_sub6,
      s.revenue::numeric AS revenue_brl
    FROM public.sales_data s
    WHERE s.date >= p_start_date AND s.date <= p_end_date
      AND s.status = 'approved'
      AND (p_operation_id IS NULL OR s.operation_id = p_operation_id)
  ),
  rt_sales AS (
    SELECT
      r.id AS sale_id,
      (r.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date AS d,
      r.utm_campaign, r.utm_source,
      NULL::text AS store, NULL::text AS product_name,
      r.raw_payload->>'campaign' AS rt_campaign,
      r.raw_payload->>'site' AS rt_site,
      r.raw_payload->>'sub5' AS rt_sub5,
      r.raw_payload->>'sub6' AS rt_sub6,
      (r.amount * (SELECT rate FROM fx))::numeric AS revenue_brl
    FROM public.redtrack_events r
    WHERE r.event_type = 'purchase'
      AND (r.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date >= p_start_date
      AND (r.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date <= p_end_date
      AND (p_operation_id IS NULL OR r.operation_id = p_operation_id)
  ),
  all_sales AS (
    SELECT * FROM cp_sales
    UNION ALL
    SELECT * FROM rt_sales
  ),
  matched AS (
    SELECT DISTINCT ON (s.sale_id)
      s.sale_id, s.d, s.revenue_brl,
      CASE WHEN s.sale_id IN (SELECT sale_id FROM rt_sales) THEN 'rt' ELSE 'cp' END AS src,
      o.id AS offer_id
    FROM all_sales s
    LEFT JOIN public.offers o ON (
      -- 1) Bracket exato no utm_campaign
      s.utm_campaign ILIKE '%[' || o.apelido_interno || ']%'
      -- 2) Bracket exato em qualquer campo do raw_payload (sub5/sub6/campaign/site)
      OR s.rt_sub5 ILIKE '%[' || o.apelido_interno || ']%'
      OR s.rt_sub6 ILIKE '%[' || o.apelido_interno || ']%'
      OR s.rt_campaign ILIKE '%[' || o.apelido_interno || ']%'
      OR s.rt_site ILIKE '%[' || o.apelido_interno || ']%'
      -- 3) Apelido como palavra no rt_campaign (ex: "Clickbank | MMP | Scale")
      OR s.rt_campaign ~* ('\m' || o.apelido_interno || '\M')
      -- 4) Newsbreak: utm_source/store newsbreak + offer com canal Newsbreak
      OR (
        (s.store ILIKE '%newsbreak%' OR s.utm_source ILIKE '%newsbreak%' OR s.utm_source ILIKE 'ntv%')
        AND 'Newsbreak' = ANY(o.media_channels)
      )
      -- 5) Vendor/produto bate com vendors_clickbank (memopryl, crstrenght, etc)
      OR EXISTS (
        SELECT 1 FROM unnest(o.vendors_clickbank) v
        WHERE (s.product_name IS NOT NULL AND s.product_name ILIKE '%' || v || '%')
           OR (s.rt_campaign IS NOT NULL AND s.rt_campaign ILIKE '%' || v || '%')
           OR (s.rt_site IS NOT NULL AND s.rt_site ILIKE '%' || v || '%')
      )
      -- 6) Apelido aparece no product_name
      OR (s.product_name IS NOT NULL AND s.product_name ILIKE '%' || o.apelido_interno || '%')
    )
    ORDER BY s.sale_id,
      CASE
        WHEN o.id IS NULL THEN 99
        WHEN s.utm_campaign ILIKE '%[' || o.apelido_interno || ']%' THEN 1
        WHEN s.rt_sub5 ILIKE '%[' || o.apelido_interno || ']%' THEN 2
        WHEN s.rt_sub6 ILIKE '%[' || o.apelido_interno || ']%' THEN 2
        WHEN s.rt_campaign ILIKE '%[' || o.apelido_interno || ']%' THEN 2
        WHEN s.rt_site ILIKE '%[' || o.apelido_interno || ']%' THEN 2
        WHEN s.rt_campaign ~* ('\m' || o.apelido_interno || '\M') THEN 3
        WHEN (s.store ILIKE '%newsbreak%' OR s.utm_source ILIKE '%newsbreak%' OR s.utm_source ILIKE 'ntv%')
             AND 'Newsbreak' = ANY(o.media_channels) THEN 4
        WHEN EXISTS (SELECT 1 FROM unnest(o.vendors_clickbank) v WHERE s.product_name ILIKE '%' || v || '%') THEN 5
        WHEN EXISTS (SELECT 1 FROM unnest(o.vendors_clickbank) v WHERE s.rt_campaign ILIKE '%' || v || '%' OR s.rt_site ILIKE '%' || v || '%') THEN 6
        ELSE 7
      END
  ),
  cp_daily AS (
    SELECT COALESCE(offer_id, '00000000-0000-0000-0000-000000000000'::uuid) AS offer_key,
           d, COUNT(*)::int AS sales, SUM(revenue_brl)::numeric AS revenue_brl
    FROM matched WHERE src='cp' GROUP BY 1, d
  ),
  rt_daily AS (
    SELECT COALESCE(offer_id, '00000000-0000-0000-0000-000000000000'::uuid) AS offer_key,
           d, COUNT(*)::int AS sales, SUM(revenue_brl)::numeric AS revenue_brl
    FROM matched WHERE src='rt' GROUP BY 1, d
  ),
  max_daily AS (
    SELECT
      COALESCE(cp.offer_key, rt.offer_key) AS offer_key,
      COALESCE(cp.d, rt.d) AS d,
      GREATEST(COALESCE(cp.sales, 0), COALESCE(rt.sales, 0))::int AS sales,
      GREATEST(COALESCE(cp.revenue_brl, 0), COALESCE(rt.revenue_brl, 0))::numeric AS revenue_brl
    FROM cp_daily cp
    FULL OUTER JOIN rt_daily rt ON rt.offer_key = cp.offer_key AND rt.d = cp.d
  ),
  agg AS (
    SELECT offer_key,
           SUM(sales)::int AS sales_count,
           SUM(revenue_brl)::numeric AS revenue_brl
    FROM max_daily
    GROUP BY offer_key
  )
  SELECT
    CASE WHEN a.offer_key = '00000000-0000-0000-0000-000000000000'::uuid THEN NULL ELSE a.offer_key END AS offer_id,
    COALESCE(o.apelido_interno, 'Outros') AS apelido_interno,
    COALESCE(o.produto_real, 'Outros') AS produto_real,
    COALESCE(o.nicho::text, 'Outros') AS nicho,
    COALESCE(o.geo::text, '—') AS geo,
    a.sales_count,
    a.revenue_brl
  FROM agg a
  LEFT JOIN public.offers o ON o.id = a.offer_key
  WHERE a.sales_count > 0
  ORDER BY a.revenue_brl DESC;
$function$;