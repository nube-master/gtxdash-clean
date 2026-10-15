-- ============================================================
-- Offers: métricas com filtro de período + VSL aggregation
-- ============================================================

-- 1) KPI metrics com período arbitrário (substitui 7d fixo)
CREATE OR REPLACE FUNCTION public.get_offers_kpi_metrics_range(
  p_start_date date,
  p_end_date date,
  p_operation_id uuid DEFAULT NULL
)
RETURNS TABLE(
  offer_id uuid,
  apelido_interno text,
  spend_brl numeric,
  impressions bigint,
  link_clicks bigint,
  ic_count bigint,
  sales_count bigint,
  pitch_retention_pct numeric,
  cpc_brl numeric,
  cpm_brl numeric,
  ctr_pct numeric,
  cpi_brl numeric,
  conversion_pct numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH offer_traffic AS (
    SELECT
      o.id AS offer_id,
      o.apelido_interno,
      COALESCE(SUM(t.spend), 0)::numeric AS spend_brl,
      COALESCE(SUM(t.impressions), 0)::bigint AS impressions,
      COALESCE(SUM(t.inline_link_clicks), 0)::bigint AS link_clicks
    FROM public.offers o
    LEFT JOIN public.traffic_data t
      ON t.campaign_name ILIKE '%[' || o.apelido_interno || ']%'
     AND t.date >= p_start_date
     AND t.date <= p_end_date
     AND (p_operation_id IS NULL OR t.operation_id = p_operation_id)
    GROUP BY o.id, o.apelido_interno
  ),
  offer_ic AS (
    SELECT
      o.id AS offer_id,
      COUNT(*) FILTER (WHERE r.event_type = 'initiate_checkout')::bigint AS ic_count,
      COUNT(*) FILTER (WHERE r.event_type = 'purchase')::bigint AS sales_count
    FROM public.offers o
    LEFT JOIN public.redtrack_events r
      ON r.utm_campaign ILIKE '%[' || o.apelido_interno || ']%'
     AND r.occurred_at >= (p_start_date)::timestamp AT TIME ZONE 'America/Sao_Paulo'
     AND r.occurred_at <  (p_end_date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo'
     AND (p_operation_id IS NULL OR r.operation_id = p_operation_id)
    GROUP BY o.id
  ),
  offer_pitch AS (
    SELECT
      o.id AS offer_id,
      CASE
        WHEN SUM(v.plays) > 0
        THEN (SUM(v.pitch_pct * v.plays) / NULLIF(SUM(v.plays), 0))::numeric
        ELSE NULL
      END AS pitch_retention_pct
    FROM public.offers o
    LEFT JOIN public.vturb_performance_daily v
      ON v.utm_campaign ILIKE '%[' || o.apelido_interno || ']%'
     AND v.date >= p_start_date
     AND v.date <= p_end_date
     AND (p_operation_id IS NULL OR v.operation_id = p_operation_id)
    GROUP BY o.id
  )
  SELECT
    ot.offer_id,
    ot.apelido_interno,
    ot.spend_brl,
    ot.impressions,
    ot.link_clicks,
    COALESCE(oi.ic_count, 0),
    COALESCE(oi.sales_count, 0),
    op.pitch_retention_pct,
    CASE WHEN ot.link_clicks > 0 THEN ot.spend_brl / ot.link_clicks ELSE NULL END,
    CASE WHEN ot.impressions > 0 THEN (ot.spend_brl / ot.impressions) * 1000 ELSE NULL END,
    CASE WHEN ot.impressions > 0 THEN (ot.link_clicks::numeric / ot.impressions) * 100 ELSE NULL END,
    CASE WHEN COALESCE(oi.ic_count, 0) > 0 THEN ot.spend_brl / oi.ic_count ELSE NULL END,
    CASE WHEN ot.link_clicks > 0 THEN (COALESCE(oi.sales_count, 0)::numeric / ot.link_clicks) * 100 ELSE NULL END
  FROM offer_traffic ot
  LEFT JOIN offer_ic oi ON oi.offer_id = ot.offer_id
  LEFT JOIN offer_pitch op ON op.offer_id = ot.offer_id;
$$;

-- 2) Contagem e métricas de VSL agregadas por oferta (match EXATO da sigla via word boundary)
CREATE OR REPLACE FUNCTION public.get_offer_vsl_metrics(
  p_apelido text,
  p_start_date date,
  p_end_date date,
  p_operation_id uuid DEFAULT NULL
)
RETURNS TABLE(
  vsl_count_total bigint,
  vsl_count_period bigint,
  total_views bigint,
  unique_views bigint,
  button_clicks bigint,
  checkout_clicks bigint,
  revenue numeric,
  avg_retention numeric,
  conversion_rate numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH matched AS (
    SELECT *
    FROM public.vsl_data
    WHERE video_name ~* ('\m' || p_apelido || '\M')
      AND (p_operation_id IS NULL OR operation_id = p_operation_id)
  ),
  in_period AS (
    SELECT * FROM matched
    WHERE date >= p_start_date AND date <= p_end_date
  )
  SELECT
    (SELECT COUNT(DISTINCT video_id) FROM matched)::bigint AS vsl_count_total,
    (SELECT COUNT(DISTINCT video_id) FROM in_period)::bigint AS vsl_count_period,
    COALESCE(SUM(total_views), 0)::bigint,
    COALESCE(SUM(unique_views), 0)::bigint,
    COALESCE(SUM(button_clicks), 0)::bigint,
    COALESCE(SUM(checkout_clicks), 0)::bigint,
    COALESCE(SUM(revenue), 0)::numeric,
    CASE WHEN SUM(total_views) > 0
      THEN (SUM(retention_rate * total_views) / SUM(total_views))::numeric
      ELSE NULL END,
    CASE WHEN SUM(button_clicks) > 0
      THEN (SUM(checkout_clicks)::numeric / SUM(button_clicks)) * 100
      ELSE NULL END
  FROM in_period;
$$;

-- 3) VSL count global por oferta (lista de todas as ofertas pra coluna na tabela)
CREATE OR REPLACE FUNCTION public.get_offers_vsl_counts(
  p_operation_id uuid DEFAULT NULL
)
RETURNS TABLE(
  offer_id uuid,
  apelido_interno text,
  vsl_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    o.id,
    o.apelido_interno,
    COALESCE(COUNT(DISTINCT v.video_id), 0)::bigint
  FROM public.offers o
  LEFT JOIN public.vsl_data v
    ON v.video_name ~* ('\m' || o.apelido_interno || '\M')
   AND (p_operation_id IS NULL OR v.operation_id = p_operation_id)
  GROUP BY o.id, o.apelido_interno;
$$;