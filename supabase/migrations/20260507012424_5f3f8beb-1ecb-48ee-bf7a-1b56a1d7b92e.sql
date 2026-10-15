
ALTER TABLE public.offers ADD COLUMN IF NOT EXISTS aliases text[] DEFAULT ARRAY[]::text[];

UPDATE public.offers
SET aliases = ARRAY['NDM','MEMO','MEMOPRYL','NDN']
WHERE apelido_interno = 'MMP';

CREATE OR REPLACE FUNCTION public.get_offers_revenue_stats(p_operation_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(offer_id uuid, apelido_interno text, revenue_today_brl numeric, sales_today integer, revenue_7d_brl numeric, sales_7d integer, revenue_30d_brl numeric, sales_30d integer)
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
    SELECT s.id AS sale_id, s.date AS d, s.utm_campaign, s.utm_source, s.store, s.product_name, s.revenue::numeric AS revenue_brl
    FROM public.sales_data s
    WHERE s.date >= (SELECT d FROM today_brt) - INTERVAL '30 days'
      AND s.status = 'approved'
      AND (p_operation_id IS NULL OR s.operation_id = p_operation_id)
  ),
  rt_sales AS (
    SELECT r.id AS sale_id, (r.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date AS d,
           r.utm_campaign, r.utm_source, NULL::text AS store, NULL::text AS product_name,
           (r.amount * (SELECT rate FROM fx))::numeric AS revenue_brl
    FROM public.redtrack_events r
    WHERE r.event_type = 'purchase'
      AND (r.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date >= (SELECT d FROM today_brt) - INTERVAL '30 days'
      AND (p_operation_id IS NULL OR r.operation_id = p_operation_id)
  ),
  cp_matched AS (
    SELECT DISTINCT ON (s.sale_id) s.sale_id, s.d, s.revenue_brl, ot.id AS offer_id, ot.apelido_interno
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
    SELECT DISTINCT ON (s.sale_id) s.sale_id, s.d, s.revenue_brl, ot.id AS offer_id, ot.apelido_interno
    FROM rt_sales s
    JOIN offer_tags ot ON (
      s.utm_campaign ILIKE '%[' || ot.tag || ']%'
      OR (s.utm_source ILIKE '%newsbreak%' AND 'Newsbreak' = ANY(ot.media_channels))
    )
    ORDER BY s.sale_id, CASE WHEN s.utm_campaign ILIKE '%[' || ot.tag || ']%' THEN 1 ELSE 2 END
  ),
  cp_daily AS (
    SELECT offer_id, apelido_interno, d, COUNT(*)::int AS sales, SUM(revenue_brl)::numeric AS revenue_brl
    FROM cp_matched GROUP BY offer_id, apelido_interno, d
  ),
  rt_daily AS (
    SELECT offer_id, apelido_interno, d, COUNT(*)::int AS sales, SUM(revenue_brl)::numeric AS revenue_brl
    FROM rt_matched GROUP BY offer_id, apelido_interno, d
  ),
  max_daily AS (
    SELECT COALESCE(cp.offer_id, rt.offer_id) AS offer_id,
           COALESCE(cp.apelido_interno, rt.apelido_interno) AS apelido_interno,
           COALESCE(cp.d, rt.d) AS d,
           GREATEST(COALESCE(cp.sales, 0), COALESCE(rt.sales, 0))::int AS sales,
           GREATEST(COALESCE(cp.revenue_brl, 0), COALESCE(rt.revenue_brl, 0))::numeric AS revenue_brl
    FROM cp_daily cp FULL OUTER JOIN rt_daily rt ON rt.offer_id = cp.offer_id AND rt.d = cp.d
  )
  SELECT md.offer_id, md.apelido_interno,
    COALESCE(SUM(CASE WHEN md.d = (SELECT d FROM today_brt) THEN md.revenue_brl END), 0)::numeric,
    COALESCE(SUM(CASE WHEN md.d = (SELECT d FROM today_brt) THEN md.sales END), 0)::int,
    COALESCE(SUM(CASE WHEN md.d >= (SELECT d FROM today_brt) - 6 THEN md.revenue_brl END), 0)::numeric,
    COALESCE(SUM(CASE WHEN md.d >= (SELECT d FROM today_brt) - 6 THEN md.sales END), 0)::int,
    COALESCE(SUM(md.revenue_brl), 0)::numeric,
    COALESCE(SUM(md.sales), 0)::int
  FROM max_daily md GROUP BY md.offer_id, md.apelido_interno;
$function$;

CREATE OR REPLACE FUNCTION public.get_offers_revenue_range(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(offer_id uuid, apelido_interno text, revenue_brl numeric, sales integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH fx AS (SELECT COALESCE((SELECT rate FROM exchange_rate_log ORDER BY created_at DESC LIMIT 1), 5.5)::numeric AS rate),
  offer_tags AS (
    SELECT o.id, o.apelido_interno, o.vendors_clickbank, tag
    FROM public.offers o
    CROSS JOIN LATERAL (
      SELECT unnest(ARRAY[o.apelido_interno] || COALESCE(o.aliases, ARRAY[]::text[])) AS tag
    ) t
    WHERE o.status::text IS DISTINCT FROM 'morta'
      AND tag IS NOT NULL AND length(tag) >= 2
  ),
  cp_daily AS (
    SELECT ot.id AS offer_id, ot.apelido_interno, s.date AS d,
      COUNT(*) AS sales, COALESCE(SUM(s.revenue), 0)::numeric AS revenue_brl
    FROM offer_tags ot
    JOIN public.sales_data s ON s.utm_campaign ILIKE '%[' || ot.tag || ']%'
    WHERE s.date BETWEEN p_start_date AND p_end_date
      AND s.status = 'approved'
      AND (p_operation_id IS NULL OR s.operation_id = p_operation_id)
    GROUP BY ot.id, ot.apelido_interno, s.date
  ),
  rt_daily AS (
    SELECT ot.id AS offer_id, ot.apelido_interno,
      (r.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date AS d,
      COUNT(*) AS sales,
      COALESCE(SUM(r.amount * (SELECT rate FROM fx)), 0)::numeric AS revenue_brl
    FROM offer_tags ot
    JOIN public.redtrack_events r ON r.utm_campaign ILIKE '%[' || ot.tag || ']%'
    WHERE r.event_type = 'purchase'
      AND (r.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p_start_date AND p_end_date
      AND (p_operation_id IS NULL OR r.operation_id = p_operation_id)
    GROUP BY ot.id, ot.apelido_interno, (r.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date
  ),
  cb_vendor_daily AS (
    SELECT o.id AS offer_id, o.apelido_interno, cb.date AS d,
      COUNT(*) AS sales, COALESCE(SUM(cb.amount_brl), 0)::numeric AS revenue_brl
    FROM public.offers o
    JOIN public.clickbank_audit cb 
      ON LOWER(cb.vendor) = ANY(SELECT LOWER(unnest(o.vendors_clickbank)))
    WHERE cb.date BETWEEN p_start_date AND p_end_date
      AND cb.transaction_type = 'SALE'
      AND cb.amount_usd BETWEEN 180 AND 260
      AND COALESCE(array_length(o.vendors_clickbank, 1), 0) > 0
      AND o.status::text IS DISTINCT FROM 'morta'
      AND (p_operation_id IS NULL OR cb.operation_id = p_operation_id)
    GROUP BY o.id, o.apelido_interno, cb.date
  ),
  max_daily AS (
    SELECT offer_id, apelido_interno, d,
      GREATEST(COALESCE(MAX(cp_sales),0), COALESCE(MAX(rt_sales),0), COALESCE(MAX(cb_sales),0))::int AS sales,
      GREATEST(COALESCE(MAX(cp_rev),0), COALESCE(MAX(rt_rev),0), COALESCE(MAX(cb_rev),0))::numeric AS revenue_brl
    FROM (
      SELECT offer_id, apelido_interno, d, sales AS cp_sales, revenue_brl AS cp_rev,
             NULL::bigint AS rt_sales, NULL::numeric AS rt_rev,
             NULL::bigint AS cb_sales, NULL::numeric AS cb_rev FROM cp_daily
      UNION ALL
      SELECT offer_id, apelido_interno, d, NULL, NULL, sales, revenue_brl, NULL, NULL FROM rt_daily
      UNION ALL
      SELECT offer_id, apelido_interno, d, NULL, NULL, NULL, NULL, sales, revenue_brl FROM cb_vendor_daily
    ) u
    GROUP BY offer_id, apelido_interno, d
  )
  SELECT offer_id, apelido_interno,
    COALESCE(SUM(revenue_brl), 0)::numeric,
    COALESCE(SUM(sales), 0)::int
  FROM max_daily GROUP BY offer_id, apelido_interno;
$function$;
