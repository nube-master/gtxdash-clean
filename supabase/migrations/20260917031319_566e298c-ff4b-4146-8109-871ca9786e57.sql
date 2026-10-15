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
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '45s'
AS $function$
BEGIN
  PERFORM public.require_op_access_array(
    COALESCE(p_operation_ids, ARRAY[p_operation_id])
  );

  -- Caminho normal: predicado simples por operação permite usar diretamente
  -- idx_live_viewers_op_started_sess, evitando o plano genérico com OR/ANY.
  IF p_operation_id IS NOT NULL AND p_operation_ids IS NULL THEN
    RETURN QUERY
    SELECT
      EXTRACT(DOW FROM lv.started_at AT TIME ZONE 'America/Sao_Paulo')::integer AS dow,
      EXTRACT(HOUR FROM lv.started_at AT TIME ZONE 'America/Sao_Paulo')::integer AS hour,
      COUNT(DISTINCT lv.session_id)::bigint AS viewers,
      COUNT(*)::bigint AS samples
    FROM public.live_viewers lv
    WHERE lv.operation_id = p_operation_id
      AND lv.started_at >= p_since
      AND (p_player_id IS NULL OR lv.player_id = p_player_id)
      AND (p_product IS NULL OR lv.product = p_product)
      AND (p_ad_id IS NULL OR lv.ad_id = p_ad_id)
    GROUP BY 1, 2;
    RETURN;
  END IF;

  -- Caminho administrativo multioperação, mantendo escopo explícito.
  IF p_operation_ids IS NOT NULL AND cardinality(p_operation_ids) > 0 THEN
    RETURN QUERY
    SELECT
      EXTRACT(DOW FROM lv.started_at AT TIME ZONE 'America/Sao_Paulo')::integer AS dow,
      EXTRACT(HOUR FROM lv.started_at AT TIME ZONE 'America/Sao_Paulo')::integer AS hour,
      COUNT(DISTINCT lv.session_id)::bigint AS viewers,
      COUNT(*)::bigint AS samples
    FROM public.live_viewers lv
    WHERE lv.operation_id = ANY(p_operation_ids)
      AND lv.started_at >= p_since
      AND (p_player_id IS NULL OR lv.player_id = p_player_id)
      AND (p_product IS NULL OR lv.product = p_product)
      AND (p_ad_id IS NULL OR lv.ad_id = p_ad_id)
    GROUP BY 1, 2;
    RETURN;
  END IF;

  RAISE EXCEPTION 'operation scope required' USING ERRCODE = '22023';
END;
$function$;

REVOKE ALL ON FUNCTION public.get_live_viewers_heatmap(timestamptz, text, text, text, uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_live_viewers_heatmap(timestamptz, text, text, text, uuid, uuid[]) TO authenticated, service_role;