DROP FUNCTION IF EXISTS public.get_vsl_advanced_metrics(date, date, uuid);

CREATE FUNCTION public.get_vsl_advanced_metrics(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(
  vsl_id text,
  pitch_pct_weighted numeric,
  plays_total bigint,
  hook_rate_pct numeric,
  impressions_total bigint,
  video_3s_total bigint,
  offer_id uuid,
  offer_apelido text,
  offer_nicho text,
  bench_cpi_brl numeric,
  bench_conversion_pct numeric,
  bench_pitch_pct numeric,
  views_total bigint,
  unique_views_total bigint,
  play_rate_pct numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER SET search_path TO public
AS $FN$
BEGIN
  PERFORM public.require_op_access(p_operation_id);
  RETURN QUERY
  WITH pitch AS (
    SELECT
      v.vsl_id,
      SUM(v.plays)::bigint AS plays_total,
      SUM(v.views)::bigint AS views_total,
      SUM(v.unique_views)::bigint AS unique_views_total,
      CASE WHEN SUM(v.plays) > 0 THEN SUM(v.pitch_pct * v.plays) / NULLIF(SUM(v.plays), 0) END AS pitch_pct_weighted,
      CASE WHEN SUM(v.views) > 0 THEN (SUM(v.plays)::numeric / NULLIF(SUM(v.views), 0)) * 100 END AS play_rate_pct
    FROM vturb_performance_daily v
    WHERE v.date >= p_start_date AND v.date <= p_end_date
      AND (p_operation_id IS NULL OR v.operation_id = p_operation_id)
    GROUP BY v.vsl_id
  ),
  vsl_camps AS (
    SELECT DISTINCT v.vsl_id, v.meta_campaign_id
    FROM vturb_performance_daily v
    WHERE v.date >= p_start_date AND v.date <= p_end_date
      AND v.meta_campaign_id IS NOT NULL
      AND (p_operation_id IS NULL OR v.operation_id = p_operation_id)
  ),
  cstatus AS (
    SELECT campaign_id, campaign_name FROM meta_campaign_status
    WHERE p_operation_id IS NULL OR operation_id = p_operation_id
  ),
  hook AS (
    SELECT vc.vsl_id, SUM(t.video_3s_views)::bigint AS v3s, SUM(t.impressions)::bigint AS imps
    FROM vsl_camps vc
    JOIN cstatus cs ON cs.campaign_id = vc.meta_campaign_id
    JOIN traffic_data t ON t.campaign_name = cs.campaign_name
      AND t.date >= p_start_date AND t.date <= p_end_date
      AND (p_operation_id IS NULL OR t.operation_id = p_operation_id)
    GROUP BY vc.vsl_id
  ),
  vsl_offer AS (
    SELECT DISTINCT ON (v.vsl_id)
      v.vsl_id, o.id AS offer_id, o.apelido_interno, o.nicho::text AS nicho
    FROM vturb_performance_daily v
    JOIN offers o ON v.vsl_name ILIKE '%[' || o.apelido_interno || ']%'
    WHERE v.date >= p_start_date AND v.date <= p_end_date
      AND (p_operation_id IS NULL OR v.operation_id = p_operation_id)
    ORDER BY v.vsl_id, length(o.apelido_interno) DESC
  ),
  bench AS (
    SELECT nicho::text AS nicho, cpi_brl, conversion_pct, pitch_retention_pct
    FROM offer_benchmarks
  )
  SELECT
    p.vsl_id,
    p.pitch_pct_weighted,
    p.plays_total,
    CASE WHEN COALESCE(h.imps,0) > 0 THEN (h.v3s::numeric / h.imps) * 100 END,
    COALESCE(h.imps, 0),
    COALESCE(h.v3s, 0),
    vo.offer_id,
    vo.apelido_interno,
    vo.nicho,
    b.cpi_brl,
    b.conversion_pct,
    b.pitch_retention_pct,
    p.views_total,
    p.unique_views_total,
    p.play_rate_pct
  FROM pitch p
  LEFT JOIN hook h ON h.vsl_id = p.vsl_id
  LEFT JOIN vsl_offer vo ON vo.vsl_id = p.vsl_id
  LEFT JOIN bench b ON b.nicho = vo.nicho;
END;
$FN$;

REVOKE EXECUTE ON FUNCTION public.get_vsl_advanced_metrics(date, date, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_vsl_advanced_metrics(date, date, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_vsl_advanced_metrics(date, date, uuid) TO authenticated, service_role;