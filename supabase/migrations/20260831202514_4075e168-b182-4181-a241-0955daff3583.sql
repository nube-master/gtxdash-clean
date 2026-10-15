CREATE OR REPLACE FUNCTION public.get_live_viewers_heatmap(
  p_since timestamp with time zone,
  p_player_id text DEFAULT NULL,
  p_product text DEFAULT NULL,
  p_ad_id text DEFAULT NULL,
  p_operation_id uuid DEFAULT NULL,
  p_operation_ids uuid[] DEFAULT NULL
)
RETURNS TABLE(dow integer, hour integer, viewers bigint, samples bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '25s'
AS $function$
DECLARE
  v_ops uuid[] := COALESCE(p_operation_ids, CASE WHEN p_operation_id IS NULL THEN NULL ELSE ARRAY[p_operation_id] END);
BEGIN
  PERFORM public.require_op_access_array(COALESCE(p_operation_ids, ARRAY[p_operation_id]));
  RETURN QUERY
  WITH base AS (
    SELECT lv.session_id, (lv.started_at AT TIME ZONE 'America/Sao_Paulo') AS brt_ts
    FROM public.live_viewers lv
    WHERE lv.started_at >= p_since
      AND (v_ops IS NULL OR lv.operation_id = ANY(v_ops))
      AND (p_player_id IS NULL OR lv.player_id = p_player_id)
      AND (p_product IS NULL OR lv.product = p_product)
      AND (p_ad_id IS NULL OR lv.ad_id = p_ad_id)
  )
  SELECT EXTRACT(DOW FROM brt_ts)::int,
         EXTRACT(HOUR FROM brt_ts)::int,
         COUNT(DISTINCT session_id)::bigint,
         COUNT(*)::bigint
  FROM base
  GROUP BY 1, 2;
END;
$function$;