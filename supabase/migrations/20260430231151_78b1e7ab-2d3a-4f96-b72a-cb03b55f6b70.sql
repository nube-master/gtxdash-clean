
CREATE OR REPLACE FUNCTION public.get_offers_revenue_stats(p_operation_id uuid DEFAULT NULL)
RETURNS TABLE(
  offer_id uuid,
  apelido_interno text,
  revenue_today_brl numeric,
  sales_today integer,
  revenue_7d_brl numeric,
  sales_7d integer,
  revenue_30d_brl numeric,
  sales_30d integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
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
  -- Per-day CartPanda revenue per offer
  cp_daily AS (
    SELECT
      o.id AS offer_id,
      o.apelido_interno,
      s.date AS d,
      COUNT(*) AS sales,
      COALESCE(SUM(s.revenue), 0)::numeric AS revenue_brl
    FROM public.offers o
    JOIN public.sales_data s
      ON s.utm_campaign ILIKE '%[' || o.apelido_interno || ']%'
    WHERE s.date >= (SELECT d FROM today_brt) - INTERVAL '30 days'
      AND s.status = 'approved'
      AND (p_operation_id IS NULL OR s.operation_id = p_operation_id)
    GROUP BY o.id, o.apelido_interno, s.date
  ),
  -- Per-day RedTrack revenue per offer (BRT date, USD→BRL)
  rt_daily AS (
    SELECT
      o.id AS offer_id,
      o.apelido_interno,
      (r.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date AS d,
      COUNT(*) AS sales,
      COALESCE(SUM(r.amount * (SELECT rate FROM fx)), 0)::numeric AS revenue_brl
    FROM public.offers o
    JOIN public.redtrack_events r
      ON r.utm_campaign ILIKE '%[' || o.apelido_interno || ']%'
    WHERE r.event_type = 'purchase'
      AND (r.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date >= (SELECT d FROM today_brt) - INTERVAL '30 days'
      AND (p_operation_id IS NULL OR r.operation_id = p_operation_id)
    GROUP BY o.id, o.apelido_interno, (r.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date
  ),
  -- Dual-Source MAX por dia: pega o MAIOR entre CP e RT (nunca soma)
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
$$;
