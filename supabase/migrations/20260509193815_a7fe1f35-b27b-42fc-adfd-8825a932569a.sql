CREATE OR REPLACE FUNCTION public.get_offers_sales_intelligence(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(offer_id uuid, apelido_interno text, produto_real text, nicho text, geo text, sales_count integer, revenue_brl numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH fx AS (
    SELECT COALESCE((SELECT rate FROM exchange_rate_log ORDER BY created_at DESC LIMIT 1), 5.5)::numeric AS rate
  ),
  -- 1) CB AUDIT (autoridade) — front-end $200-$260
  cb_sales AS (
    SELECT
      cb.receipt AS sale_id,
      cb.date AS d,
      mcs.campaign_name AS utm_campaign,
      cb.aff_sub2 AS sub5,
      cb.aff_sub3 AS sub6,
      cb.product_name,
      cb.item_name,
      cb.vendor,
      cb.amount_brl::numeric AS revenue_brl,
      'cb'::text AS src
    FROM public.clickbank_audit cb
    LEFT JOIN public.meta_campaign_status mcs ON mcs.campaign_id = cb.aff_sub2
    WHERE cb.transaction_type = 'SALE'
      AND cb.amount_usd BETWEEN 200 AND 260
      AND cb.date BETWEEN p_start_date AND p_end_date
      AND (p_operation_id IS NULL OR cb.operation_id = p_operation_id)
  ),
  cb_receipts AS (SELECT DISTINCT receipt AS rid FROM public.clickbank_audit WHERE receipt IS NOT NULL),
  -- 2) CartPanda non-CB (sales_data com order_id que NÃO bate em CB e não tem prefixo rt:)
  cp_sales AS (
    SELECT
      s.id::text AS sale_id,
      s.date AS d,
      s.utm_campaign,
      NULL::text AS sub5,
      NULL::text AS sub6,
      NULL::text AS product_name,
      NULL::text AS item_name,
      NULL::text AS vendor,
      s.revenue::numeric AS revenue_brl,
      'cp'::text AS src
    FROM public.sales_data s
    WHERE s.date BETWEEN p_start_date AND p_end_date
      AND s.status = 'approved'
      AND (p_operation_id IS NULL OR s.operation_id = p_operation_id)
      AND COALESCE(s.order_id,'') NOT LIKE 'rt:%'
      AND NOT EXISTS (
        SELECT 1 FROM cb_receipts r
        WHERE r.rid = s.order_id
           OR r.rid = REPLACE(COALESCE(s.order_id,''), 'rt:', '')
      )
  ),
  -- 3) RT-extra (purchases que não existem nem em CB nem em CP)
  cp_keys AS (
    SELECT DISTINCT order_id AS k FROM public.sales_data
    WHERE order_id IS NOT NULL
      AND date BETWEEN p_start_date AND p_end_date
      AND (p_operation_id IS NULL OR operation_id = p_operation_id)
  ),
  rt_sales AS (
    SELECT
      r.id::text AS sale_id,
      (r.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date AS d,
      r.utm_campaign,
      r.raw_payload->>'sub5' AS sub5,
      r.raw_payload->>'sub6' AS sub6,
      NULL::text AS product_name,
      NULL::text AS item_name,
      NULL::text AS vendor,
      CASE WHEN r.currency='BRL' THEN r.amount::numeric ELSE (r.amount * (SELECT rate FROM fx))::numeric END AS revenue_brl,
      'rt'::text AS src
    FROM public.redtrack_events r
    WHERE r.event_type = 'purchase'
      AND (r.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p_start_date AND p_end_date
      AND (p_operation_id IS NULL OR r.operation_id = p_operation_id)
      AND COALESCE(r.utm_campaign,'') NOT ILIKE '%[AUTO] Reconcile%'
      -- exclude if receipt/transaction/clickid already in CB
      AND NOT EXISTS (
        SELECT 1 FROM cb_receipts cr
        WHERE cr.rid = COALESCE(r.raw_payload->>'p_sub1', r.raw_payload->>'receipt', r.raw_payload->>'order', r.transaction_id, r.clickid)
      )
      -- exclude if same key already mirrored in sales_data (rt:<sub_id> or raw)
      AND NOT EXISTS (
        SELECT 1 FROM cp_keys ck
        WHERE ck.k = 'rt:' || COALESCE(r.raw_payload->>'sub_id', r.clickid, '')
           OR ck.k = COALESCE(r.transaction_id, r.clickid, '')
      )
  ),
  all_sales AS (
    SELECT * FROM cb_sales
    UNION ALL SELECT * FROM cp_sales
    UNION ALL SELECT * FROM rt_sales
  ),
  -- Atribuição: bracket no utm/sub5/sub6 > vendor > product_name/item_name
  offer_aliases AS (
    SELECT o.id, alias
    FROM public.offers o
    CROSS JOIN LATERAL (
      SELECT unnest(ARRAY[o.apelido_interno] || COALESCE(o.tags, ARRAY[]::text[]) || COALESCE(o.aliases, ARRAY[]::text[])) AS alias
    ) a
    WHERE o.status::text IS DISTINCT FROM 'morta'
      AND alias IS NOT NULL AND length(alias) >= 2
  ),
  matched AS (
    SELECT DISTINCT ON (s.sale_id)
      s.sale_id, s.d, s.revenue_brl, s.src, o.id AS offer_id
    FROM all_sales s
    LEFT JOIN public.offers o ON o.status::text IS DISTINCT FROM 'morta'
      AND EXISTS (
        SELECT 1 FROM offer_aliases oa
        WHERE oa.id = o.id AND (
          s.utm_campaign ILIKE '%[' || oa.alias || ']%'
          OR s.sub5         ILIKE '%[' || oa.alias || ']%'
          OR s.sub6         ILIKE '%[' || oa.alias || ']%'
          OR s.vendor       ILIKE '%' || oa.alias || '%'
          OR s.product_name ILIKE '%' || oa.alias || '%'
          OR s.item_name    ILIKE '%' || oa.alias || '%'
        )
      )
    ORDER BY s.sale_id,
      CASE
        WHEN o.id IS NULL THEN 99
        WHEN s.utm_campaign ILIKE ANY (ARRAY(SELECT '%[' || alias || ']%' FROM offer_aliases WHERE id = o.id)) THEN 1
        WHEN s.sub5 ILIKE ANY (ARRAY(SELECT '%[' || alias || ']%' FROM offer_aliases WHERE id = o.id)) THEN 2
        WHEN s.sub6 ILIKE ANY (ARRAY(SELECT '%[' || alias || ']%' FROM offer_aliases WHERE id = o.id)) THEN 2
        WHEN s.vendor ILIKE ANY (ARRAY(SELECT '%' || alias || '%' FROM offer_aliases WHERE id = o.id)) THEN 3
        WHEN s.product_name ILIKE ANY (ARRAY(SELECT '%' || alias || '%' FROM offer_aliases WHERE id = o.id)) THEN 4
        WHEN s.item_name ILIKE ANY (ARRAY(SELECT '%' || alias || '%' FROM offer_aliases WHERE id = o.id)) THEN 4
        ELSE 9
      END
  ),
  agg AS (
    SELECT COALESCE(offer_id,'00000000-0000-0000-0000-000000000000'::uuid) AS offer_key,
      COUNT(*)::int AS sales_count,
      SUM(revenue_brl)::numeric AS revenue_brl
    FROM matched
    GROUP BY COALESCE(offer_id,'00000000-0000-0000-0000-000000000000'::uuid)
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
  WHERE a.revenue_brl > 0
  ORDER BY a.revenue_brl DESC;
$function$;