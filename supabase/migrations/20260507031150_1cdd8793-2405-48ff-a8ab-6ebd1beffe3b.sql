
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
    SELECT s.id::text AS sale_id, s.date AS d, s.utm_campaign,
      NULL::text AS rt_sub5, NULL::text AS rt_sub6,
      s.revenue::numeric AS revenue_brl, 'cp'::text AS src
    FROM public.sales_data s
    WHERE s.date BETWEEN p_start_date AND p_end_date
      AND s.status = 'approved'
      AND (p_operation_id IS NULL OR s.operation_id = p_operation_id)
  ),
  rt_sales AS (
    SELECT r.id::text AS sale_id,
      (r.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date AS d,
      r.utm_campaign,
      r.raw_payload->>'sub5' AS rt_sub5,
      r.raw_payload->>'sub6' AS rt_sub6,
      CASE WHEN r.currency='BRL' THEN r.amount::numeric ELSE (r.amount * (SELECT rate FROM fx))::numeric END AS revenue_brl,
      'rt'::text AS src
    FROM public.redtrack_events r
    WHERE r.event_type = 'purchase'
      AND (r.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p_start_date AND p_end_date
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
  -- Totais por dia/fonte (mesma lógica do dashboard-totals: MAX por dia)
  per_day_src AS (
    SELECT d, src, COUNT(*)::int AS cnt, SUM(revenue_brl)::numeric AS rev
    FROM matched GROUP BY d, src
  ),
  per_day AS (
    SELECT d,
      MAX(CASE WHEN src='cp' THEN cnt ELSE 0 END) AS cp_cnt,
      MAX(CASE WHEN src='cp' THEN rev ELSE 0 END) AS cp_rev,
      MAX(CASE WHEN src='rt' THEN cnt ELSE 0 END) AS rt_cnt,
      MAX(CASE WHEN src='rt' THEN rev ELSE 0 END) AS rt_rev
    FROM per_day_src GROUP BY d
  ),
  winner AS (
    SELECT d,
      CASE WHEN rt_rev >= cp_rev THEN 'rt' ELSE 'cp' END AS win_src,
      GREATEST(cp_rev, rt_rev) AS day_rev,
      GREATEST(cp_cnt, rt_cnt) AS day_cnt
    FROM per_day
  ),
  -- Composição por offer dentro da fonte vencedora
  per_offer_winner AS (
    SELECT m.d, COALESCE(m.offer_id,'00000000-0000-0000-0000-000000000000'::uuid) AS offer_key,
      COUNT(*)::int AS off_cnt, SUM(m.revenue_brl)::numeric AS off_rev
    FROM matched m
    JOIN winner w ON w.d = m.d AND w.win_src = m.src
    GROUP BY m.d, COALESCE(m.offer_id,'00000000-0000-0000-0000-000000000000'::uuid)
  ),
  per_day_winner_total AS (
    SELECT d, SUM(off_cnt)::int AS tot_cnt, SUM(off_rev)::numeric AS tot_rev
    FROM per_offer_winner GROUP BY d
  ),
  -- Atribui share da MAX do dia proporcional à composição da fonte vencedora
  per_offer_day AS (
    SELECT p.d, p.offer_key,
      CASE WHEN t.tot_rev > 0 THEN (p.off_rev / t.tot_rev) * w.day_rev ELSE 0 END AS rev_share,
      CASE WHEN t.tot_cnt > 0 THEN ROUND((p.off_cnt::numeric / t.tot_cnt) * w.day_cnt) ELSE 0 END AS cnt_share
    FROM per_offer_winner p
    JOIN per_day_winner_total t ON t.d = p.d
    JOIN winner w ON w.d = p.d
  ),
  agg AS (
    SELECT offer_key, SUM(cnt_share)::int AS sales_count, SUM(rev_share)::numeric AS revenue_brl
    FROM per_offer_day GROUP BY offer_key
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
