CREATE OR REPLACE FUNCTION public.get_offers_sales_intelligence(
  p_start_date date,
  p_end_date date,
  p_operation_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  offer_id uuid,
  apelido_interno text,
  produto_real text,
  nicho text,
  geo text,
  sales_count integer,
  revenue_brl numeric
)
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
      (r.amount * (SELECT rate FROM fx))::numeric AS revenue_brl
    FROM public.redtrack_events r
    WHERE r.event_type = 'purchase'
      AND (r.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date >= p_start_date
      AND (r.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date <= p_end_date
      AND (p_operation_id IS NULL OR r.operation_id = p_operation_id)
  ),
  cp_matched AS (
    SELECT DISTINCT ON (s.sale_id)
      s.sale_id, s.d, s.revenue_brl, o.id AS offer_id
    FROM cp_sales s
    LEFT JOIN public.offers o ON (
      s.utm_campaign ILIKE '%[' || o.apelido_interno || ']%'
      OR (
        (s.store ILIKE '%newsbreak%' OR s.utm_source ILIKE '%newsbreak%')
        AND 'Newsbreak' = ANY(o.media_channels)
      )
      OR EXISTS (
        SELECT 1 FROM unnest(o.vendors_clickbank) v
        WHERE s.product_name IS NOT NULL AND s.product_name ILIKE '%' || v || '%'
      )
      OR (s.product_name IS NOT NULL AND s.product_name ILIKE '%' || o.apelido_interno || '%')
    )
    ORDER BY s.sale_id,
      CASE
        WHEN o.id IS NULL THEN 9
        WHEN s.utm_campaign ILIKE '%[' || o.apelido_interno || ']%' THEN 1
        WHEN (s.store ILIKE '%newsbreak%' OR s.utm_source ILIKE '%newsbreak%') AND 'Newsbreak' = ANY(o.media_channels) THEN 2
        WHEN EXISTS (SELECT 1 FROM unnest(o.vendors_clickbank) v WHERE s.product_name ILIKE '%' || v || '%') THEN 3
        ELSE 4
      END
  ),
  rt_matched AS (
    SELECT DISTINCT ON (s.sale_id)
      s.sale_id, s.d, s.revenue_brl, o.id AS offer_id
    FROM rt_sales s
    LEFT JOIN public.offers o ON (
      s.utm_campaign ILIKE '%[' || o.apelido_interno || ']%'
      OR (s.utm_source ILIKE '%newsbreak%' AND 'Newsbreak' = ANY(o.media_channels))
    )
    ORDER BY s.sale_id,
      CASE
        WHEN o.id IS NULL THEN 9
        WHEN s.utm_campaign ILIKE '%[' || o.apelido_interno || ']%' THEN 1
        ELSE 2
      END
  ),
  -- Aggregate per (offer_id, day) for each source
  cp_daily AS (
    SELECT COALESCE(offer_id, '00000000-0000-0000-0000-000000000000'::uuid) AS offer_key,
           d, COUNT(*)::int AS sales, SUM(revenue_brl)::numeric AS revenue_brl
    FROM cp_matched GROUP BY 1, d
  ),
  rt_daily AS (
    SELECT COALESCE(offer_id, '00000000-0000-0000-0000-000000000000'::uuid) AS offer_key,
           d, COUNT(*)::int AS sales, SUM(revenue_brl)::numeric AS revenue_brl
    FROM rt_matched GROUP BY 1, d
  ),
  -- Dual-Source MAX por (offer, dia)
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