CREATE OR REPLACE FUNCTION public.get_offers_revenue_stats(p_operation_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(offer_id uuid, apelido_interno text, revenue_today_brl numeric, sales_today integer, revenue_7d_brl numeric, sales_7d integer, revenue_30d_brl numeric, sales_30d integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER SET search_path TO public
AS $FN$
BEGIN
  PERFORM public.require_op_access(p_operation_id);
  RETURN QUERY
WITH today_brt AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d),
  fx AS (SELECT COALESCE((SELECT rate FROM exchange_rate_log ORDER BY created_at DESC LIMIT 1), 5.5)::numeric AS rate),
  offer_tags AS (
    SELECT o.id, o.apelido_interno, o.media_channels, o.vendors_clickbank, tag
    FROM public.offers o
    CROSS JOIN LATERAL (SELECT unnest(ARRAY[o.apelido_interno] || COALESCE(o.aliases, ARRAY[]::text[])) AS tag) t
    WHERE o.status::text IS DISTINCT FROM 'morta' AND tag IS NOT NULL AND length(tag) >= 2
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
END;
$FN$;

CREATE OR REPLACE FUNCTION public.get_offers_sales_intelligence(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(offer_id uuid, apelido_interno text, produto_real text, nicho text, geo text, sales_count integer, revenue_brl numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER SET search_path TO public
AS $FN$
BEGIN
  PERFORM public.require_op_access(p_operation_id);
  RETURN QUERY
WITH fx AS (SELECT COALESCE((SELECT rate FROM exchange_rate_log ORDER BY created_at DESC LIMIT 1), 5.5)::numeric AS rate),
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
    SELECT DISTINCT ON (s.sale_id) s.sale_id, s.d, s.revenue_brl, s.src, o.id AS offer_id
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
      END,
      COALESCE((SELECT MAX(length(alias)) FROM offer_aliases
        WHERE id = o.id AND (
          s.utm_campaign ILIKE '%[' || alias || ']%'
          OR s.sub5 ILIKE '%[' || alias || ']%'
          OR s.sub6 ILIKE '%[' || alias || ']%'
        )), 0) DESC
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
  FROM agg a LEFT JOIN public.offers o ON o.id = a.offer_key;
END;
$FN$;

CREATE OR REPLACE FUNCTION public.get_offers_today_revenue(p_operation_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(offer_id uuid, apelido_interno text, revenue_today_brl numeric, sales_today integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER SET search_path TO public
AS $FN$
BEGIN
  PERFORM public.require_op_access(p_operation_id);
  RETURN QUERY
WITH today_brt AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d),
  fx AS (SELECT COALESCE((SELECT rate FROM exchange_rate_log ORDER BY created_at DESC LIMIT 1), 5.5)::numeric AS rate),
  offer_tags AS (
    SELECT o.id, o.apelido_interno, o.media_channels, o.vendors_clickbank, tag
    FROM public.offers o
    CROSS JOIN LATERAL (SELECT unnest(ARRAY[o.apelido_interno] || COALESCE(o.aliases, ARRAY[]::text[])) AS tag) t
    WHERE o.status::text IS DISTINCT FROM 'morta' AND tag IS NOT NULL AND length(tag) >= 3
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
      OR s.utm_campaign ~* ('\m' || ot.tag || '\M')
      OR ((s.store ILIKE '%newsbreak%' OR s.utm_source ILIKE '%newsbreak%') AND 'Newsbreak' = ANY(ot.media_channels))
      OR EXISTS (SELECT 1 FROM unnest(ot.vendors_clickbank) v WHERE s.product_name IS NOT NULL AND s.product_name ILIKE '%' || v || '%')
    )
    ORDER BY s.sale_id,
      CASE
        WHEN s.utm_campaign ILIKE '%[' || ot.tag || ']%' THEN 1
        WHEN s.utm_campaign ~* ('\m' || ot.tag || '\M') THEN 2
        WHEN (s.store ILIKE '%newsbreak%' OR s.utm_source ILIKE '%newsbreak%') AND 'Newsbreak' = ANY(ot.media_channels) THEN 3
        ELSE 4
      END
  ),
  rt_matched AS (
    SELECT DISTINCT ON (s.sale_id) s.sale_id, s.revenue_brl, ot.id AS offer_id, ot.apelido_interno
    FROM rt_sales s
    JOIN offer_tags ot ON (
      s.utm_campaign ILIKE '%[' || ot.tag || ']%'
      OR s.utm_campaign ~* ('\m' || ot.tag || '\M')
      OR (s.utm_source ILIKE '%newsbreak%' AND 'Newsbreak' = ANY(ot.media_channels))
    )
    ORDER BY s.sale_id,
      CASE
        WHEN s.utm_campaign ILIKE '%[' || ot.tag || ']%' THEN 1
        WHEN s.utm_campaign ~* ('\m' || ot.tag || '\M') THEN 2
        ELSE 3
      END
  ),
  cp_agg AS (SELECT offer_id, apelido_interno, COUNT(*)::int sales, SUM(revenue_brl)::numeric revenue FROM cp_matched GROUP BY offer_id, apelido_interno),
  rt_agg AS (SELECT offer_id, apelido_interno, COUNT(*)::int sales, SUM(revenue_brl)::numeric revenue FROM rt_matched GROUP BY offer_id, apelido_interno)
  SELECT
    COALESCE(cp.offer_id, rt.offer_id) AS offer_id,
    COALESCE(cp.apelido_interno, rt.apelido_interno) AS apelido_interno,
    GREATEST(COALESCE(cp.revenue, 0), COALESCE(rt.revenue, 0))::numeric AS revenue_today_brl,
    GREATEST(COALESCE(cp.sales, 0), COALESCE(rt.sales, 0))::int AS sales_today
  FROM cp_agg cp FULL OUTER JOIN rt_agg rt ON rt.offer_id = cp.offer_id;
END;
$FN$;

CREATE OR REPLACE FUNCTION public.get_offers_today_traffic(p_operation_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(offer_id uuid, apelido_interno text, spend_today_brl numeric, accounts_count integer, active_campaigns_count integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER SET search_path TO public
AS $FN$
BEGIN
  PERFORM public.require_op_access(p_operation_id);
  RETURN QUERY
WITH today_brt AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d),
  ot AS (
    SELECT o.id AS offer_id, o.apelido_interno, t.account_id, t.campaign_name, t.spend
    FROM public.offers o
    JOIN public.traffic_data t ON t.campaign_name ILIKE '%[' || o.apelido_interno || ']%'
    WHERE t.date = (SELECT d FROM today_brt)
      AND (p_operation_id IS NULL OR t.operation_id = p_operation_id)
  )
  SELECT ot.offer_id, ot.apelido_interno,
    COALESCE(SUM(ot.spend), 0)::numeric AS spend_today_brl,
    COUNT(DISTINCT ot.account_id)::int AS accounts_count,
    COUNT(DISTINCT CASE WHEN ot.spend > 0 THEN ot.campaign_name END)::int AS active_campaigns_count
  FROM ot GROUP BY ot.offer_id, ot.apelido_interno;
END;
$FN$;

CREATE OR REPLACE FUNCTION public.get_offers_traffic_stats(p_operation_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(offer_id uuid, apelido_interno text, spend_today_brl numeric, spend_7d_brl numeric, spend_30d_brl numeric, accounts_count integer, active_campaigns_count integer, last_spend_date date)
LANGUAGE plpgsql
STABLE SECURITY DEFINER SET search_path TO public
AS $FN$
BEGIN
  PERFORM public.require_op_access(p_operation_id);
  RETURN QUERY
WITH today_brt AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d),
  traffic_recent AS (
    SELECT t.id, t.account_id, t.campaign_name, t.date, t.spend
    FROM public.traffic_data t
    WHERE t.date >= ((now() AT TIME ZONE 'America/Sao_Paulo')::date - INTERVAL '30 days')
      AND t.spend > 0
      AND (p_operation_id IS NULL OR t.operation_id = p_operation_id)
  ),
  traffic_tagged AS (
    SELECT tr.id, tr.account_id, tr.campaign_name, tr.date, tr.spend, upper(m[1]) AS tag
    FROM traffic_recent tr, LATERAL regexp_matches(tr.campaign_name, '\[([^\]]+)\]', 'g') AS m
  ),
  offer_traffic AS (
    SELECT DISTINCT ON (o.id, tt.id)
      o.id AS offer_id, o.apelido_interno,
      tt.id, tt.account_id, tt.campaign_name, tt.date, tt.spend
    FROM public.offers o
    JOIN traffic_tagged tt ON tt.tag = upper(o.apelido_interno)
  ),
  active_now AS (
    SELECT offer_id,
      COUNT(DISTINCT campaign_name)::int AS active_now_count,
      COUNT(DISTINCT account_id)::int AS accounts_now_count
    FROM offer_traffic
    WHERE date >= (SELECT d FROM today_brt) - 1
    GROUP BY offer_id
  )
  SELECT ot.offer_id, ot.apelido_interno,
    COALESCE(SUM(CASE WHEN ot.date = (SELECT d FROM today_brt) THEN ot.spend END), 0)::numeric,
    COALESCE(SUM(CASE WHEN ot.date >= (SELECT d FROM today_brt) - 6 THEN ot.spend END), 0)::numeric,
    COALESCE(SUM(ot.spend), 0)::numeric,
    COALESCE((SELECT accounts_now_count FROM active_now an WHERE an.offer_id = ot.offer_id), 0)::int,
    COALESCE((SELECT active_now_count FROM active_now an WHERE an.offer_id = ot.offer_id), 0)::int,
    MAX(ot.date)
  FROM offer_traffic ot
  GROUP BY ot.offer_id, ot.apelido_interno;
END;
$FN$;

CREATE OR REPLACE FUNCTION public.get_offers_vsl_counts(p_operation_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(offer_id uuid, apelido_interno text, vsl_count bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER SET search_path TO public
AS $FN$
BEGIN
  PERFORM public.require_op_access(p_operation_id);
  RETURN QUERY
SELECT o.id, o.apelido_interno, COALESCE(COUNT(DISTINCT v.video_id), 0)::bigint
  FROM public.offers o
  LEFT JOIN public.vsl_data v
    ON v.video_name ~* ('\m' || o.apelido_interno || '\M')
   AND (p_operation_id IS NULL OR v.operation_id = p_operation_id)
  GROUP BY o.id, o.apelido_interno;
END;
$FN$;

CREATE OR REPLACE FUNCTION public.get_orphan_campaign_tags_today(p_operation_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(tag text, spend_brl numeric, campaigns_count integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER SET search_path TO public
AS $FN$
BEGIN
  PERFORM public.require_op_access(p_operation_id);
  RETURN QUERY
WITH today_brt AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d),
  tagged AS (
    SELECT (regexp_matches(campaign_name, '\[([A-Za-z0-9_]+)\]'))[1] AS tag, campaign_name, spend
    FROM public.traffic_data
    WHERE date = (SELECT d FROM today_brt)
      AND (p_operation_id IS NULL OR operation_id = p_operation_id)
      AND campaign_name ~ '\[[A-Za-z0-9_]+\]'
  )
  SELECT t.tag, SUM(t.spend)::numeric AS spend_brl, COUNT(DISTINCT t.campaign_name)::int AS campaigns_count
  FROM tagged t
  WHERE NOT EXISTS (SELECT 1 FROM public.offers o WHERE upper(o.apelido_interno) = upper(t.tag))
    AND t.spend > 0
  GROUP BY t.tag ORDER BY spend_brl DESC;
END;
$FN$;

CREATE OR REPLACE FUNCTION public.get_spend_normalized_sp(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(sp_date date, total_spend numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER SET search_path TO public
AS $FN$
BEGIN
  PERFORM public.require_op_access(p_operation_id);
  RETURN QUERY
SELECT t.date AS sp_date, COALESCE(SUM(t.spend), 0)::numeric AS total_spend
  FROM public.traffic_data t
  JOIN public.meta_ad_accounts a
    ON a.account_id = t.account_id AND a.is_active = true AND a.1=1
  WHERE t.date >= p_start_date AND t.date <= p_end_date
    AND (p_operation_id IS NULL OR t.operation_id = p_operation_id)
    AND (p_operation_id IS NULL OR a.operation_id = p_operation_id)
  GROUP BY t.date;
END;
$FN$;

CREATE OR REPLACE FUNCTION public.get_total_link_clicks(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(total_link_clicks bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER SET search_path TO public
AS $FN$
BEGIN
  PERFORM public.require_op_access(p_operation_id);
  RETURN QUERY
SELECT COALESCE(SUM(t.inline_link_clicks), 0)::bigint AS total_link_clicks
  FROM public.traffic_data t
  WHERE t.date >= p_start_date AND t.date <= p_end_date
    AND (p_operation_id IS NULL OR t.operation_id = p_operation_id);
END;
$FN$;