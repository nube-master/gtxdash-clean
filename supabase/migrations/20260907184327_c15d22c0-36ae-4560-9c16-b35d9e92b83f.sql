CREATE OR REPLACE FUNCTION public.dashboard_consolidated(
  p_range text DEFAULT 'today'::text,
  p_start date DEFAULT NULL::date,
  p_end date DEFAULT NULL::date,
  p_currency text DEFAULT 'BRL'::text,
  p_include_suspended boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid         UUID := auth.uid();
  v_today_brt   DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_start       DATE;
  v_end         DATE;
  v_fx          NUMERIC := 1.0;
  v_result      JSONB;
  v_ops_json    JSONB;
  v_totals_json JSONB;
BEGIN
  IF v_uid IS NULL OR NOT public.is_super_admin(v_uid) THEN
    RAISE EXCEPTION 'permission denied: super_admin required' USING ERRCODE = '42501';
  END IF;

  CASE lower(coalesce(p_range, 'today'))
    WHEN 'today'     THEN v_start := v_today_brt;                            v_end := v_today_brt;
    WHEN 'yesterday' THEN v_start := v_today_brt - 1;                        v_end := v_today_brt - 1;
    WHEN '7d'        THEN v_start := v_today_brt - 6;                        v_end := v_today_brt;
    WHEN '30d'       THEN v_start := v_today_brt - 29;                       v_end := v_today_brt;
    WHEN 'mtd'       THEN v_start := date_trunc('month', v_today_brt)::date; v_end := v_today_brt;
    WHEN 'custom'    THEN
      IF p_start IS NULL OR p_end IS NULL THEN
        RAISE EXCEPTION 'custom range requires p_start and p_end';
      END IF;
      v_start := p_start; v_end := p_end;
    ELSE
      RAISE EXCEPTION 'invalid range: %', p_range;
  END CASE;

  IF upper(coalesce(p_currency, 'BRL')) = 'USD' THEN
    SELECT rate_avg INTO v_fx
      FROM public.exchange_rates_daily
     WHERE currency_from = 'USD' AND currency_to = 'BRL'
       AND rate_date <= v_end
     ORDER BY rate_date DESC LIMIT 1;
    IF v_fx IS NULL OR v_fx = 0 THEN v_fx := 5.15; END IF;
  END IF;

  WITH ops AS (
    SELECT id, name FROM public.operations
     WHERE status IN ('active','trial')
        OR (coalesce(p_include_suspended, false) AND status = 'suspended')
  ),
  snap AS (
    SELECT s.operation_id,
           SUM(coalesce(s.spend_brl, 0))          AS spend,
           SUM(coalesce(s.revenue_brl, 0))        AS revenue,
           SUM(coalesce(s.sales_count, 0))        AS sales
      FROM public.daily_totals_snapshot s
     WHERE s.snapshot_date BETWEEN v_start AND v_end
     GROUP BY s.operation_id
  ),
  rows AS (
    SELECT o.id   AS operation_id,
           o.name AS operation_name,
           coalesce(sn.spend, 0)   / v_fx AS spend,
           coalesce(sn.revenue, 0) / v_fx AS revenue,
           coalesce(sn.sales, 0)          AS sales
      FROM ops o
      LEFT JOIN snap sn ON sn.operation_id = o.id
  ),
  enriched AS (
    SELECT r.*,
           CASE WHEN r.spend > 0 THEN r.revenue / r.spend ELSE 0 END AS roas,
           (r.revenue - r.spend) AS lucro_bruto,
           CASE WHEN r.revenue > 0 THEN ((r.revenue - r.spend) / r.revenue) * 100 ELSE 0 END AS margem_bruta_pct,
           (SELECT count(*) FROM public.meta_campaign_status mcs
             WHERE mcs.operation_id = r.operation_id AND mcs.status = 'ACTIVE') AS active_campaigns_count
      FROM rows r
  )
  SELECT jsonb_agg(to_jsonb(e) ORDER BY e.revenue DESC),
         jsonb_build_object(
           'spend', coalesce(SUM(e.spend), 0),
           'revenue', coalesce(SUM(e.revenue), 0),
           'sales', coalesce(SUM(e.sales), 0),
           'roas', CASE WHEN coalesce(SUM(e.spend), 0) > 0 THEN SUM(e.revenue) / SUM(e.spend) ELSE 0 END,
           'lucro_bruto', coalesce(SUM(e.lucro_bruto), 0),
           'operations_count', count(*)
         )
    INTO v_ops_json, v_totals_json
    FROM enriched e;

  v_result := jsonb_build_object(
    'range', p_range,
    'start_date', v_start,
    'end_date', v_end,
    'currency', upper(coalesce(p_currency, 'BRL')),
    'fx_used', v_fx,
    'include_suspended', coalesce(p_include_suspended, false),
    'generated_at', now(),
    'operations', coalesce(v_ops_json, '[]'::jsonb),
    'totals', coalesce(v_totals_json, '{}'::jsonb),
    'source_notes', jsonb_build_object('spend', 'daily_totals_snapshot.spend_brl', 'revenue', 'daily_totals_snapshot.revenue_brl')
  );

  RETURN v_result;
END;
$function$;