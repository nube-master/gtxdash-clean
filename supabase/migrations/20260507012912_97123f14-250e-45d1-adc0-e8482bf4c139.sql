
CREATE OR REPLACE FUNCTION public.get_offers_today_revenue(p_operation_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(offer_id uuid, apelido_interno text, revenue_today_brl numeric, sales_today integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH today_brt AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d),
  fx AS (SELECT COALESCE((SELECT rate FROM exchange_rate_log ORDER BY created_at DESC LIMIT 1), 5.5)::numeric AS rate),
  offer_tags AS (
    SELECT o.id, o.apelido_interno, o.media_channels, o.vendors_clickbank, tag
    FROM public.offers o
    CROSS JOIN LATERAL (
      SELECT unnest(ARRAY[o.apelido_interno] || COALESCE(o.aliases, ARRAY[]::text[])) AS tag
    ) t
    WHERE o.status::text IS DISTINCT FROM 'morta'
      AND tag IS NOT NULL AND length(tag) >= 2
  ),
  cp_sales AS (
    SELECT s.id AS sale_id, s.utm_campaign, s.utm_source, s.store, s.product_name, s.revenue::numeric AS revenue_brl
    FROM public.sales_data s
    WHERE s.date = (SELECT d FROM today_brt)
      AND s.status = 'approved'
      AND (p_operation_id IS NULL OR s.operation_id = p_operation_id)
  ),
  rt_sales AS (
    SELECT r.id AS sale_id, r.utm_campaign, r.utm_source, (r.amount * (SELECT rate FROM fx))::numeric AS revenue_brl
    FROM public.redtrack_events r
    WHERE r.event_type = 'purchase'
      AND (r.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date = (SELECT d FROM today_brt)
      AND (p_operation_id IS NULL OR r.operation_id = p_operation_id)
  ),
  cp_matched AS (
    SELECT DISTINCT ON (s.sale_id) s.sale_id, s.revenue_brl, ot.id AS offer_id, ot.apelido_interno
    FROM cp_sales s
    JOIN offer_tags ot ON (
      s.utm_campaign ILIKE '%[' || ot.tag || ']%'
      OR ((s.store ILIKE '%newsbreak%' OR s.utm_source ILIKE '%newsbreak%') AND 'Newsbreak' = ANY(ot.media_channels))
      OR EXISTS (SELECT 1 FROM unnest(ot.vendors_clickbank) v WHERE s.product_name IS NOT NULL AND s.product_name ILIKE '%' || v || '%')
    )
    ORDER BY s.sale_id,
      CASE
        WHEN s.utm_campaign ILIKE '%[' || ot.tag || ']%' THEN 1
        WHEN (s.store ILIKE '%newsbreak%' OR s.utm_source ILIKE '%newsbreak%') AND 'Newsbreak' = ANY(ot.media_channels) THEN 2
        ELSE 3
      END
  ),
  rt_matched AS (
    SELECT DISTINCT ON (s.sale_id) s.sale_id, s.revenue_brl, ot.id AS offer_id, ot.apelido_interno
    FROM rt_sales s
    JOIN offer_tags ot ON (
      s.utm_campaign ILIKE '%[' || ot.tag || ']%'
      OR (s.utm_source ILIKE '%newsbreak%' AND 'Newsbreak' = ANY(ot.media_channels))
    )
    ORDER BY s.sale_id, CASE WHEN s.utm_campaign ILIKE '%[' || ot.tag || ']%' THEN 1 ELSE 2 END
  ),
  cp_agg AS (
    SELECT offer_id, apelido_interno, COUNT(*)::int sales, SUM(revenue_brl)::numeric revenue
    FROM cp_matched GROUP BY offer_id, apelido_interno
  ),
  rt_agg AS (
    SELECT offer_id, apelido_interno, COUNT(*)::int sales, SUM(revenue_brl)::numeric revenue
    FROM rt_matched GROUP BY offer_id, apelido_interno
  )
  SELECT
    COALESCE(cp.offer_id, rt.offer_id) AS offer_id,
    COALESCE(cp.apelido_interno, rt.apelido_interno) AS apelido_interno,
    GREATEST(COALESCE(cp.revenue, 0), COALESCE(rt.revenue, 0))::numeric AS revenue_today_brl,
    GREATEST(COALESCE(cp.sales, 0), COALESCE(rt.sales, 0))::int AS sales_today
  FROM cp_agg cp FULL OUTER JOIN rt_agg rt ON rt.offer_id = cp.offer_id;
$function$;
