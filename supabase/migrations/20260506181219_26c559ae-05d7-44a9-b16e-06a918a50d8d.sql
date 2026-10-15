CREATE OR REPLACE FUNCTION public.get_offers_revenue_stats(p_operation_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(offer_id uuid, apelido_interno text, revenue_today_brl numeric, sales_today integer, revenue_7d_brl numeric, sales_7d integer, revenue_30d_brl numeric, sales_30d integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH today_brt AS (
    SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d
  ),
  fx AS (
    SELECT COALESCE(
      (SELECT rate FROM exchange_rate_log ORDER BY created_at DESC LIMIT 1),
      5.5
    )::numeric AS rate
  ),
  -- CartPanda sales (last 30 days, approved)
  cp_sales AS (
    SELECT
      s.id AS sale_id,
      s.date AS d,
      s.utm_campaign,
      s.utm_source,
      s.store,
      s.product_name,
      s.revenue::numeric AS revenue_brl,
      s.operation_id
    FROM public.sales_data s
    WHERE s.date >= (SELECT d FROM today_brt) - INTERVAL '30 days'
      AND s.status = 'approved'
      AND (p_operation_id IS NULL OR s.operation_id = p_operation_id)
  ),
  -- RedTrack purchases (last 30 days)
  rt_sales AS (
    SELECT
      r.id AS sale_id,
      (r.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date AS d,
      r.utm_campaign,
      r.utm_source,
      NULL::text AS store,
      NULL::text AS product_name,
      (r.amount * (SELECT rate FROM fx))::numeric AS revenue_brl,
      r.operation_id
    FROM public.redtrack_events r
    WHERE r.event_type = 'purchase'
      AND (r.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date >= (SELECT d FROM today_brt) - INTERVAL '30 days'
      AND (p_operation_id IS NULL OR r.operation_id = p_operation_id)
  ),
  -- Match each sale to its best offer (priority: bracket > newsbreak override > vendors_clickbank)
  cp_matched AS (
    SELECT DISTINCT ON (s.sale_id)
      s.sale_id, s.d, s.revenue_brl, o.id AS offer_id, o.apelido_interno
    FROM cp_sales s
    JOIN public.offers o ON (
      s.utm_campaign ILIKE '%[' || o.apelido_interno || ']%'
      OR (
        (s.store ILIKE '%newsbreak%' OR s.utm_source ILIKE '%newsbreak%')
        AND 'Newsbreak' = ANY(o.media_channels)
      )
      OR EXISTS (
        SELECT 1 FROM unnest(o.vendors_clickbank) v
        WHERE s.product_name IS NOT NULL AND s.product_name ILIKE '%' || v || '%'
      )
    )
    ORDER BY s.sale_id,
      CASE
        WHEN s.utm_campaign ILIKE '%[' || o.apelido_interno || ']%' THEN 1
        WHEN (s.store ILIKE '%newsbreak%' OR s.utm_source ILIKE '%newsbreak%') AND 'Newsbreak' = ANY(o.media_channels) THEN 2
        ELSE 3
      END
  ),
  rt_matched AS (
    SELECT DISTINCT ON (s.sale_id)
      s.sale_id, s.d, s.revenue_brl, o.id AS offer_id, o.apelido_interno
    FROM rt_sales s
    JOIN public.offers o ON (
      s.utm_campaign ILIKE '%[' || o.apelido_interno || ']%'
      OR (
        s.utm_source ILIKE '%newsbreak%'
        AND 'Newsbreak' = ANY(o.media_channels)
      )
    )
    ORDER BY s.sale_id,
      CASE
        WHEN s.utm_campaign ILIKE '%[' || o.apelido_interno || ']%' THEN 1
        ELSE 2
      END
  ),
  cp_daily AS (
    SELECT offer_id, apelido_interno, d, COUNT(*)::int AS sales, SUM(revenue_brl)::numeric AS revenue_brl
    FROM cp_matched GROUP BY offer_id, apelido_interno, d
  ),
  rt_daily AS (
    SELECT offer_id, apelido_interno, d, COUNT(*)::int AS sales, SUM(revenue_brl)::numeric AS revenue_brl
    FROM rt_matched GROUP BY offer_id, apelido_interno, d
  ),
  -- Dual-Source MAX por dia
  max_daily AS (
    SELECT
      COALESCE(cp.offer_id, rt.offer_id) AS offer_id,
      COALESCE(cp.apelido_interno, rt.apelido_interno) AS apelido_interno,
      COALESCE(cp.d, rt.d) AS d,
      GREATEST(COALESCE(cp.sales, 0), COALESCE(rt.sales, 0))::int AS sales,
      GREATEST(COALESCE(cp.revenue_brl, 0), COALESCE(rt.revenue_brl, 0))::numeric AS revenue_brl
    FROM cp_daily cp
    FULL OUTER JOIN rt_daily rt
      ON rt.offer_id = cp.offer_id AND rt.d = cp.d
  )
  SELECT
    md.offer_id,
    md.apelido_interno,
    COALESCE(SUM(CASE WHEN md.d = (SELECT d FROM today_brt) THEN md.revenue_brl END), 0)::numeric AS revenue_today_brl,
    COALESCE(SUM(CASE WHEN md.d = (SELECT d FROM today_brt) THEN md.sales END), 0)::int AS sales_today,
    COALESCE(SUM(CASE WHEN md.d >= (SELECT d FROM today_brt) - 6 THEN md.revenue_brl END), 0)::numeric AS revenue_7d_brl,
    COALESCE(SUM(CASE WHEN md.d >= (SELECT d FROM today_brt) - 6 THEN md.sales END), 0)::int AS sales_7d,
    COALESCE(SUM(md.revenue_brl), 0)::numeric AS revenue_30d_brl,
    COALESCE(SUM(md.sales), 0)::int AS sales_30d
  FROM max_daily md
  GROUP BY md.offer_id, md.apelido_interno;
$function$;