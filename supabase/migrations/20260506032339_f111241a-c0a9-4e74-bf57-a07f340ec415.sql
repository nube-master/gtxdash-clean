-- Aceita variações de apelido com sufixo: [GLH] OU [GLH_OIL] etc.
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
      ON t.campaign_name ~* ('\[' || o.apelido_interno || '(_[^\]]+)?\]')
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
      ON r.utm_campaign ~* ('\[' || o.apelido_interno || '(_[^\]]+)?\]')
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
      ON v.utm_campaign ~* ('\[' || o.apelido_interno || '(_[^\]]+)?\]')
     AND v.date >= p_start_date
     AND v.date <= p_end_date
     AND (p_operation_id IS NULL OR v.operation_id = p_operation_id)
    GROUP BY o.id
  )
  SELECT
    ot.offer_id, ot.apelido_interno, ot.spend_brl, ot.impressions, ot.link_clicks,
    COALESCE(oi.ic_count, 0), COALESCE(oi.sales_count, 0), op.pitch_retention_pct,
    CASE WHEN ot.link_clicks > 0 THEN ot.spend_brl / ot.link_clicks ELSE NULL END,
    CASE WHEN ot.impressions > 0 THEN (ot.spend_brl / ot.impressions) * 1000 ELSE NULL END,
    CASE WHEN ot.impressions > 0 THEN (ot.link_clicks::numeric / ot.impressions) * 100 ELSE NULL END,
    CASE WHEN COALESCE(oi.ic_count, 0) > 0 THEN ot.spend_brl / oi.ic_count ELSE NULL END,
    CASE WHEN ot.link_clicks > 0 THEN (COALESCE(oi.sales_count, 0)::numeric / ot.link_clicks) * 100 ELSE NULL END
  FROM offer_traffic ot
  LEFT JOIN offer_ic oi ON oi.offer_id = ot.offer_id
  LEFT JOIN offer_pitch op ON op.offer_id = ot.offer_id;
$$;