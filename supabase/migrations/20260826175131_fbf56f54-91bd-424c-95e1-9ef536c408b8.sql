CREATE OR REPLACE FUNCTION public.get_spend_normalized_sp(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL)
RETURNS TABLE(sp_date date, total_spend numeric, impressions bigint, clicks bigint, landing_page_views bigint, initiated_checkouts bigint, vsl_plays bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH h AS (
    SELECT t.date,
           COALESCE(SUM(t.spend_brl),0)::numeric AS spend,
           COALESCE(SUM(t.impressions),0)::bigint AS impressions,
           COALESCE(SUM(t.clicks),0)::bigint AS clicks,
           COALESCE(SUM(t.landing_page_views),0)::bigint AS lpv,
           COALESCE(SUM(t.initiated_checkouts),0)::bigint AS ics,
           COALESCE(SUM(t.vsl_plays),0)::bigint AS vsl
    FROM public.traffic_data_hourly t
    WHERE t.date BETWEEN p_start_date AND p_end_date
      AND (p_operation_id IS NULL OR t.operation_id = p_operation_id)
    GROUP BY t.date
  ),
  d AS (
    SELECT t.date,
           COALESCE(SUM(t.spend_brl),0)::numeric AS spend,
           COALESCE(SUM(t.impressions),0)::bigint AS impressions,
           COALESCE(SUM(t.clicks),0)::bigint AS clicks,
           COALESCE(SUM(t.landing_page_views),0)::bigint AS lpv,
           COALESCE(SUM(t.initiate_checkout),0)::bigint AS ics,
           COALESCE(SUM(t.video_plays),0)::bigint AS vsl
    FROM public.traffic_data t
    WHERE t.date BETWEEN p_start_date AND p_end_date
      AND (p_operation_id IS NULL OR t.operation_id = p_operation_id)
    GROUP BY t.date
  )
  SELECT
    COALESCE(h.date, d.date) AS sp_date,
    CASE WHEN COALESCE(h.spend,0) < 0.5 * COALESCE(d.spend,0)
         THEN COALESCE(d.spend,0) ELSE COALESCE(h.spend,0) END,
    CASE WHEN COALESCE(h.spend,0) < 0.5 * COALESCE(d.spend,0)
         THEN COALESCE(d.impressions,0) ELSE COALESCE(h.impressions,0) END,
    CASE WHEN COALESCE(h.spend,0) < 0.5 * COALESCE(d.spend,0)
         THEN COALESCE(d.clicks,0) ELSE COALESCE(h.clicks,0) END,
    CASE WHEN COALESCE(h.spend,0) < 0.5 * COALESCE(d.spend,0)
         THEN COALESCE(d.lpv,0) ELSE COALESCE(h.lpv,0) END,
    CASE WHEN COALESCE(h.spend,0) < 0.5 * COALESCE(d.spend,0)
         THEN COALESCE(d.ics,0) ELSE COALESCE(h.ics,0) END,
    CASE WHEN COALESCE(h.spend,0) < 0.5 * COALESCE(d.spend,0)
         THEN COALESCE(d.vsl,0) ELSE COALESCE(h.vsl,0) END
  FROM h
  FULL OUTER JOIN d ON d.date = h.date
  ORDER BY 1;
END;
$$;