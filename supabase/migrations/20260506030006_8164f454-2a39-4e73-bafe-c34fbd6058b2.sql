CREATE OR REPLACE FUNCTION public.get_offers_revenue_range(
  p_start_date date,
  p_end_date date,
  p_operation_id uuid DEFAULT NULL
)
RETURNS TABLE(
  offer_id uuid,
  apelido_interno text,
  revenue_brl numeric,
  sales int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH fx AS (
    SELECT COALESCE(
      (SELECT rate FROM exchange_rate_log ORDER BY created_at DESC LIMIT 1),
      5.5
    )::numeric AS rate
  ),
  cp_daily AS (
    SELECT o.id AS offer_id, o.apelido_interno, s.date AS d,
      COUNT(*) AS sales,
      COALESCE(SUM(s.revenue), 0)::numeric AS revenue_brl
    FROM public.offers o
    JOIN public.sales_data s ON s.utm_campaign ILIKE '%[' || o.apelido_interno || ']%'
    WHERE s.date >= p_start_date AND s.date <= p_end_date
      AND s.status = 'approved'
      AND (p_operation_id IS NULL OR s.operation_id = p_operation_id)
    GROUP BY o.id, o.apelido_interno, s.date
  ),
  rt_daily AS (
    SELECT o.id AS offer_id, o.apelido_interno,
      (r.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date AS d,
      COUNT(*) AS sales,
      COALESCE(SUM(r.amount * (SELECT rate FROM fx)), 0)::numeric AS revenue_brl
    FROM public.offers o
    JOIN public.redtrack_events r ON r.utm_campaign ILIKE '%[' || o.apelido_interno || ']%'
    WHERE r.event_type = 'purchase'
      AND (r.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date >= p_start_date
      AND (r.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date <= p_end_date
      AND (p_operation_id IS NULL OR r.operation_id = p_operation_id)
    GROUP BY o.id, o.apelido_interno, (r.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date
  ),
  max_daily AS (
    SELECT
      COALESCE(cp.offer_id, rt.offer_id) AS offer_id,
      COALESCE(cp.apelido_interno, rt.apelido_interno) AS apelido_interno,
      GREATEST(COALESCE(cp.sales, 0), COALESCE(rt.sales, 0))::int AS sales,
      GREATEST(COALESCE(cp.revenue_brl, 0), COALESCE(rt.revenue_brl, 0))::numeric AS revenue_brl
    FROM cp_daily cp
    FULL OUTER JOIN rt_daily rt ON rt.offer_id = cp.offer_id AND rt.d = cp.d
  )
  SELECT offer_id, apelido_interno,
    COALESCE(SUM(revenue_brl), 0)::numeric,
    COALESCE(SUM(sales), 0)::int
  FROM max_daily
  GROUP BY offer_id, apelido_interno;
$$;