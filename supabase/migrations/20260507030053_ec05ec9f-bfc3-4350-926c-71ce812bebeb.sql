
CREATE OR REPLACE FUNCTION public.get_offers_sales_intelligence(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(offer_id uuid, apelido_interno text, produto_real text, nicho text, geo text, sales_count integer, revenue_brl numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH fx AS (
    SELECT COALESCE((SELECT rate FROM exchange_rate_log ORDER BY created_at DESC LIMIT 1), 5.5)::numeric AS rate
  ),
  cp_sales AS (
    SELECT s.id AS sale_id, s.date AS d,
      s.utm_campaign, s.product_name,
      NULL::text AS rt_sub5, NULL::text AS rt_sub6,
      s.revenue::numeric AS revenue_brl, 'cp'::text AS src
    FROM public.sales_data s
    WHERE s.date >= p_start_date AND s.date <= p_end_date
      AND s.status = 'approved'
      AND (p_operation_id IS NULL OR s.operation_id = p_operation_id)
  ),
  rt_sales AS (
    SELECT r.id AS sale_id,
      (r.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date AS d,
      r.utm_campaign,
      NULL::text AS product_name,
      r.raw_payload->>'sub5' AS rt_sub5,
      r.raw_payload->>'sub6' AS rt_sub6,
      (r.amount * (SELECT rate FROM fx))::numeric AS revenue_brl, 'rt'::text AS src
    FROM public.redtrack_events r
    WHERE r.event_type = 'purchase'
      AND (r.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date >= p_start_date
      AND (r.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date <= p_end_date
      AND (p_operation_id IS NULL OR r.operation_id = p_operation_id)
      AND COALESCE(r.utm_campaign,'') NOT ILIKE '%[AUTO] Reconcile%'
  ),
  all_sales AS (SELECT * FROM cp_sales UNION ALL SELECT * FROM rt_sales),
  offer_aliases AS (
    SELECT o.id, alias
    FROM public.offers o
    CROSS JOIN LATERAL (
      SELECT unnest(ARRAY[o.apelido_interno] || COALESCE(o.tags, ARRAY[]::text[]) || COALESCE(o.aliases, ARRAY[]::text[])) AS alias
    ) a
    WHERE alias IS NOT NULL AND length(alias) >= 2
  ),
  matched AS (
    SELECT DISTINCT ON (s.sale_id)
      s.sale_id, s.d, s.revenue_brl, s.src, o.id AS offer_id
    FROM all_sales s
    LEFT JOIN public.offers o ON EXISTS (
      SELECT 1 FROM offer_aliases oa
      WHERE oa.id = o.id AND (
        s.utm_campaign ILIKE '%[' || oa.alias || ']%'
        OR s.rt_sub5    ILIKE '%[' || oa.alias || ']%'
        OR s.rt_sub6    ILIKE '%[' || oa.alias || ']%'
      )
    )
    ORDER BY s.sale_id,
      CASE
        WHEN o.id IS NULL THEN 99
        WHEN s.utm_campaign ILIKE ANY (ARRAY(SELECT '%[' || alias || ']%' FROM offer_aliases WHERE id = o.id)) THEN 1
        WHEN s.rt_sub5 ILIKE ANY (ARRAY(SELECT '%[' || alias || ']%' FROM offer_aliases WHERE id = o.id)) THEN 2
        WHEN s.rt_sub6 ILIKE ANY (ARRAY(SELECT '%[' || alias || ']%' FROM offer_aliases WHERE id = o.id)) THEN 2
        ELSE 9
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
    SELECT COALESCE(cp.offer_key, rt.offer_key) AS offer_key,
           COALESCE(cp.d, rt.d) AS d,
           GREATEST(COALESCE(cp.sales, 0), COALESCE(rt.sales, 0))::int AS sales,
           GREATEST(COALESCE(cp.revenue_brl, 0), COALESCE(rt.revenue_brl, 0))::numeric AS revenue_brl
    FROM cp_daily cp
    FULL OUTER JOIN rt_daily rt ON rt.offer_key = cp.offer_key AND rt.d = cp.d
  ),
  agg AS (
    SELECT offer_key, SUM(sales)::int AS sales_count, SUM(revenue_brl)::numeric AS revenue_brl
    FROM max_daily GROUP BY offer_key
  )
  SELECT
    CASE WHEN a.offer_key = '00000000-0000-0000-0000-000000000000'::uuid THEN NULL ELSE a.offer_key END AS offer_id,
    COALESCE(o.apelido_interno, 'Outros') AS apelido_interno,
    COALESCE(o.produto_real, 'Outros') AS produto_real,
    COALESCE(o.nicho::text, 'Outros') AS nicho,
    COALESCE(o.geo::text, '—') AS geo,
    a.sales_count, a.revenue_brl
  FROM agg a
  LEFT JOIN public.offers o ON o.id = a.offer_key
  WHERE a.sales_count > 0
  ORDER BY a.revenue_brl DESC;
$function$;
