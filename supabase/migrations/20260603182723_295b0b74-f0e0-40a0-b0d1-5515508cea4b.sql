
CREATE OR REPLACE FUNCTION public.get_live_viewers_heatmap(
  p_since timestamptz,
  p_player_id text DEFAULT NULL,
  p_product text DEFAULT NULL,
  p_ad_id text DEFAULT NULL,
  p_operation_id uuid DEFAULT NULL,
  p_operation_ids uuid[] DEFAULT NULL
)
RETURNS TABLE(dow int, hour int, viewers bigint, samples bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      session_id,
      (started_at AT TIME ZONE 'America/Sao_Paulo') AS brt_ts
    FROM public.live_viewers
    WHERE started_at >= p_since
      AND (p_player_id IS NULL OR player_id = p_player_id)
      AND (p_product IS NULL OR product = p_product)
      AND (p_ad_id IS NULL OR ad_id = p_ad_id)
      AND (
        p_operation_id IS NOT NULL AND operation_id = p_operation_id
        OR p_operation_id IS NULL AND (p_operation_ids IS NULL OR operation_id = ANY(p_operation_ids))
      )
  )
  SELECT
    EXTRACT(DOW FROM brt_ts)::int AS dow,
    EXTRACT(HOUR FROM brt_ts)::int AS hour,
    COUNT(DISTINCT session_id)::bigint AS viewers,
    COUNT(*)::bigint AS samples
  FROM base
  GROUP BY 1, 2;
$$;

GRANT EXECUTE ON FUNCTION public.get_live_viewers_heatmap(timestamptz, text, text, text, uuid, uuid[]) TO authenticated, service_role;
