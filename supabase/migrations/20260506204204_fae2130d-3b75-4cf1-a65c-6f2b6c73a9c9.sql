
-- Lightweight: today-only traffic
CREATE OR REPLACE FUNCTION public.get_offers_today_traffic(p_operation_id uuid DEFAULT NULL)
RETURNS TABLE(
  offer_id uuid,
  apelido_interno text,
  spend_today_brl numeric,
  accounts_count integer,
  active_campaigns_count integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH today_brt AS (
    SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d
  ),
  ot AS (
    SELECT o.id AS offer_id, o.apelido_interno, t.account_id, t.campaign_name, t.spend
    FROM public.offers o
    JOIN public.traffic_data t
      ON t.campaign_name ILIKE '%[' || o.apelido_interno || ']%'
    WHERE t.date = (SELECT d FROM today_brt)
      AND (p_operation_id IS NULL OR t.operation_id = p_operation_id)
  )
  SELECT
    ot.offer_id,
    ot.apelido_interno,
    COALESCE(SUM(ot.spend), 0)::numeric AS spend_today_brl,
    COUNT(DISTINCT ot.account_id)::int AS accounts_count,
    COUNT(DISTINCT CASE WHEN ot.spend > 0 THEN ot.campaign_name END)::int AS active_campaigns_count
  FROM ot
  GROUP BY ot.offer_id, ot.apelido_interno;
$$;

-- Lightweight: today-only revenue (Dual-Source MAX)
CREATE OR REPLACE FUNCTION public.get_offers_today_revenue(p_operation_id uuid DEFAULT NULL)
RETURNS TABLE(
  offer_id uuid,
  apelido_interno text,
  revenue_today_brl numeric,
  sales_today integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH today_brt AS (
    SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d
  ),
  fx AS (
    SELECT COALESCE(
      (SELECT rate FROM exchange_rate_log ORDER BY created_at DESC LIMIT 1),
      5.5
    )::numeric AS rate
  ),
  cp_sales AS (
    SELECT s.id AS sale_id, s.utm_campaign, s.utm_source, s.store, s.product_name,
           s.revenue::numeric AS revenue_brl
    FROM public.sales_data s
    WHERE s.date = (SELECT d FROM today_brt)
      AND s.status = 'approved'
      AND (p_operation_id IS NULL OR s.operation_id = p_operation_id)
  ),
  rt_sales AS (
    SELECT r.id AS sale_id, r.utm_campaign, r.utm_source,
           (r.amount * (SELECT rate FROM fx))::numeric AS revenue_brl
    FROM public.redtrack_events r
    WHERE r.event_type = 'purchase'
      AND (r.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date = (SELECT d FROM today_brt)
      AND (p_operation_id IS NULL OR r.operation_id = p_operation_id)
  ),
  cp_matched AS (
    SELECT DISTINCT ON (s.sale_id) s.sale_id, s.revenue_brl, o.id AS offer_id, o.apelido_interno
    FROM cp_sales s
    JOIN public.offers o ON (
      s.utm_campaign ILIKE '%[' || o.apelido_interno || ']%'
      OR ((s.store ILIKE '%newsbreak%' OR s.utm_source ILIKE '%newsbreak%') AND 'Newsbreak' = ANY(o.media_channels))
      OR EXISTS (SELECT 1 FROM unnest(o.vendors_clickbank) v WHERE s.product_name IS NOT NULL AND s.product_name ILIKE '%' || v || '%')
    )
    ORDER BY s.sale_id,
      CASE
        WHEN s.utm_campaign ILIKE '%[' || o.apelido_interno || ']%' THEN 1
        WHEN (s.store ILIKE '%newsbreak%' OR s.utm_source ILIKE '%newsbreak%') AND 'Newsbreak' = ANY(o.media_channels) THEN 2
        ELSE 3
      END
  ),
  rt_matched AS (
    SELECT DISTINCT ON (s.sale_id) s.sale_id, s.revenue_brl, o.id AS offer_id, o.apelido_interno
    FROM rt_sales s
    JOIN public.offers o ON (
      s.utm_campaign ILIKE '%[' || o.apelido_interno || ']%'
      OR (s.utm_source ILIKE '%newsbreak%' AND 'Newsbreak' = ANY(o.media_channels))
    )
    ORDER BY s.sale_id,
      CASE WHEN s.utm_campaign ILIKE '%[' || o.apelido_interno || ']%' THEN 1 ELSE 2 END
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
  FROM cp_agg cp
  FULL OUTER JOIN rt_agg rt ON rt.offer_id = cp.offer_id;
$$;

-- Orphan tags rodando hoje sem offer cadastrada
CREATE OR REPLACE FUNCTION public.get_orphan_campaign_tags_today(p_operation_id uuid DEFAULT NULL)
RETURNS TABLE(tag text, spend_brl numeric, campaigns_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH today_brt AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d),
  tagged AS (
    SELECT (regexp_matches(campaign_name, '\[([A-Za-z0-9_]+)\]'))[1] AS tag,
           campaign_name, spend
    FROM public.traffic_data
    WHERE date = (SELECT d FROM today_brt)
      AND (p_operation_id IS NULL OR operation_id = p_operation_id)
      AND campaign_name ~ '\[[A-Za-z0-9_]+\]'
  )
  SELECT t.tag,
         SUM(t.spend)::numeric AS spend_brl,
         COUNT(DISTINCT t.campaign_name)::int AS campaigns_count
  FROM tagged t
  WHERE NOT EXISTS (
    SELECT 1 FROM public.offers o WHERE upper(o.apelido_interno) = upper(t.tag)
  )
    AND t.spend > 0
  GROUP BY t.tag
  ORDER BY spend_brl DESC;
$$;
