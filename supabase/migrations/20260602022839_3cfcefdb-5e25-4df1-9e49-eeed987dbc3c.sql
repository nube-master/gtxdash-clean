CREATE OR REPLACE FUNCTION public.get_offers_sales_intelligence(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(offer_id uuid, apelido_interno text, produto_real text, nicho text, geo text, sales_count integer, revenue_brl numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH fx AS (
    SELECT COALESCE((SELECT rate FROM exchange_rate_log ORDER BY created_at DESC LIMIT 1), 5.5)::numeric AS rate
  ),
  cb_sales AS (
    SELECT cb.receipt AS sale_id, cb.receipt AS dedup_key, cb.date AS d,
      mcs.campaign_name AS utm_campaign, cb.aff_sub2 AS sub5, cb.aff_sub3 AS sub6,
      cb.product_name, cb.item_name, cb.vendor, cb.amount_brl::numeric AS revenue_brl, 'cb'::text AS src
    FROM public.clickbank_audit cb
    LEFT JOIN public.meta_campaign_status mcs ON mcs.campaign_id = cb.aff_sub2
    WHERE cb.transaction_type='SALE' AND cb.amount_usd BETWEEN 200 AND 260
      AND cb.date BETWEEN p_start_date AND p_end_date
      AND (p_operation_id IS NULL OR cb.operation_id = p_operation_id)
  ),
  cb_keys AS (SELECT DISTINCT receipt AS k FROM public.clickbank_audit WHERE receipt IS NOT NULL),
  cp_sales AS (
    SELECT s.id::text AS sale_id, COALESCE(s.order_id, s.id::text) AS dedup_key, s.date AS d,
      s.utm_campaign, NULL::text AS sub5, NULL::text AS sub6,
      NULL::text AS product_name, NULL::text AS item_name, NULL::text AS vendor,
      s.revenue::numeric AS revenue_brl, 'cp'::text AS src
    FROM public.sales_data s
    WHERE s.date BETWEEN p_start_date AND p_end_date AND s.status='approved'
      AND NOT EXISTS (SELECT 1 FROM cb_keys k WHERE k.k = s.order_id)
      AND (p_operation_id IS NULL OR s.operation_id = p_operation_id)
  ),
  rt_canonical AS (
    SELECT r.id, (r.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date AS d, r.utm_campaign,
      r.raw_payload->>'sub5' AS sub5, r.raw_payload->>'sub6' AS sub6,
      COALESCE(NULLIF(r.raw_payload->>'p_sub1',''),NULLIF(r.raw_payload->>'receipt',''),NULLIF(r.raw_payload->>'order',''),r.transaction_id,r.clickid) AS canon_key,
      CASE WHEN r.currency='BRL' THEN r.amount::numeric ELSE (r.amount * (SELECT rate FROM fx))::numeric END AS revenue_brl
    FROM public.redtrack_events r
    WHERE r.event_type='purchase'
      AND (r.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p_start_date AND p_end_date
      AND (p_operation_id IS NULL OR r.operation_id = p_operation_id)
      AND COALESCE(r.utm_campaign,'') NOT ILIKE '%[AUTO] Reconcile%'
  ),
  rt_sales AS (
    SELECT rc.id::text AS sale_id, rc.canon_key AS dedup_key, rc.d, rc.utm_campaign,
      rc.sub5, rc.sub6, NULL::text AS product_name, NULL::text AS item_name, NULL::text AS vendor,
      rc.revenue_brl, 'rt'::text AS src
    FROM rt_canonical rc
    WHERE rc.canon_key IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM cb_keys k WHERE k.k = rc.canon_key)
      AND NOT EXISTS (
        SELECT 1 FROM public.sales_data sd
        WHERE sd.date BETWEEN p_start_date AND p_end_date
          AND (p_operation_id IS NULL OR sd.operation_id = p_operation_id)
          AND (sd.order_id = 'rt:' || rc.canon_key OR sd.order_id = rc.canon_key)
      )
  ),
  all_sales AS (SELECT * FROM cb_sales UNION ALL SELECT * FROM cp_sales UNION ALL SELECT * FROM rt_sales),
  ranked_sales AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY dedup_key ORDER BY CASE src WHEN 'cb' THEN 1 WHEN 'cp' THEN 2 ELSE 3 END) AS rn
    FROM all_sales WHERE dedup_key IS NOT NULL
  ),
  dedup_sales AS (SELECT sale_id, dedup_key, d, utm_campaign, sub5, sub6, product_name, item_name, vendor, revenue_brl, src FROM ranked_sales WHERE rn=1),
  offer_aliases AS (
    SELECT o.id, alias FROM public.offers o
    CROSS JOIN LATERAL (SELECT unnest(ARRAY[o.apelido_interno] || COALESCE(o.tags, ARRAY[]::text[]) || COALESCE(o.aliases, ARRAY[]::text[])) AS alias) a
    WHERE o.status::text IS DISTINCT FROM 'morta' AND alias IS NOT NULL AND length(alias) >= 2
  ),
  matched AS (
    SELECT DISTINCT ON (s.sale_id)
      s.sale_id, s.d, s.revenue_brl, s.src, o.id AS offer_id
    FROM dedup_sales s
    LEFT JOIN public.offers o ON o.status::text IS DISTINCT FROM 'morta'
      AND EXISTS (
        SELECT 1 FROM offer_aliases oa
        WHERE oa.id = o.id AND (
          s.utm_campaign ILIKE '%[' || oa.alias || ']%'
          OR s.sub5         ILIKE '%[' || oa.alias || ']%'
          OR s.sub6         ILIKE '%[' || oa.alias || ']%'
          OR s.vendor       ~* ('\m' || oa.alias || '\M')
          OR s.product_name ~* ('\m' || oa.alias || '\M')
          OR s.item_name    ~* ('\m' || oa.alias || '\M')
        )
      )
    ORDER BY s.sale_id,
      CASE
        WHEN o.id IS NULL THEN 99
        WHEN s.utm_campaign ILIKE ANY (ARRAY(SELECT '%[' || alias || ']%' FROM offer_aliases WHERE id = o.id)) THEN 1
        WHEN s.sub5 ILIKE ANY (ARRAY(SELECT '%[' || alias || ']%' FROM offer_aliases WHERE id = o.id)) THEN 2
        WHEN s.sub6 ILIKE ANY (ARRAY(SELECT '%[' || alias || ']%' FROM offer_aliases WHERE id = o.id)) THEN 2
        WHEN EXISTS (SELECT 1 FROM offer_aliases WHERE id = o.id AND s.vendor ~* ('\m'||alias||'\M')) THEN 3
        WHEN EXISTS (SELECT 1 FROM offer_aliases WHERE id = o.id AND s.product_name ~* ('\m'||alias||'\M')) THEN 4
        WHEN EXISTS (SELECT 1 FROM offer_aliases WHERE id = o.id AND s.item_name ~* ('\m'||alias||'\M')) THEN 4
        ELSE 9
      END
  ),
  agg AS (
    SELECT COALESCE(offer_id,'00000000-0000-0000-0000-000000000000'::uuid) AS offer_key,
      COUNT(*)::int AS sales_count, SUM(revenue_brl)::numeric AS revenue_brl
    FROM matched GROUP BY COALESCE(offer_id,'00000000-0000-0000-0000-000000000000'::uuid)
  )
  SELECT
    CASE WHEN a.offer_key='00000000-0000-0000-0000-000000000000'::uuid THEN NULL ELSE a.offer_key END AS offer_id,
    COALESCE(o.apelido_interno,'Outros') AS apelido_interno,
    COALESCE(o.produto_real,'Outros') AS produto_real,
    COALESCE(o.nicho::text,'Outros') AS nicho,
    COALESCE(o.geo::text,'—') AS geo,
    a.sales_count, a.revenue_brl
  FROM agg a LEFT JOIN public.offers o ON o.id = a.offer_key
  WHERE a.revenue_brl > 0
  ORDER BY a.revenue_brl DESC;
$function$;