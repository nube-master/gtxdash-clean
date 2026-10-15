CREATE OR REPLACE FUNCTION public.dashboard_consolidated(p_range text DEFAULT 'today'::text, p_start date DEFAULT NULL::date, p_end date DEFAULT NULL::date, p_currency text DEFAULT 'BRL'::text)
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
    RAISE EXCEPTION 'permission denied: super_admin required'
      USING ERRCODE = '42501';
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
    SELECT id, name FROM public.operations WHERE status IN ('active','ativo','trial')
  ),
  snap AS (
    SELECT
      s.operation_id,
      SUM(s.total_spend)::NUMERIC   AS spend_brl,
      SUM(s.total_revenue)::NUMERIC AS revenue_brl,
      SUM(s.cp_count + s.rt_count)::INT AS sales_est
    FROM public.daily_totals_snapshot s
    WHERE s.date >= v_start AND s.date < LEAST(v_end + 1, v_today_brt)
    GROUP BY s.operation_id
  ),
  live_safe AS (
    SELECT m.operation_id, COALESCE(SUM(m.spend_brl),0)::NUMERIC AS spend_brl
    FROM public.meta_spend_realtime_safe m
    WHERE v_end >= v_today_brt AND m.sp_date = v_today_brt
    GROUP BY m.operation_id
  ),
  live_td AS (
    SELECT t.operation_id, COALESCE(SUM(t.spend_brl),0)::NUMERIC AS spend_brl
    FROM public.traffic_data t
    WHERE v_end >= v_today_brt AND t.date = v_today_brt
    GROUP BY t.operation_id
  ),
  live_tdh AS (
    SELECT h.operation_id, COALESCE(SUM(h.spend_brl),0)::NUMERIC AS spend_brl
    FROM public.traffic_data_hourly h
    WHERE v_end >= v_today_brt AND h.date = v_today_brt
    GROUP BY h.operation_id
  ),
  live_spend AS (
    SELECT o.id AS operation_id,
           GREATEST(
             COALESCE(ls.spend_brl,0),
             COALESCE(lt.spend_brl,0),
             COALESCE(lh.spend_brl,0)
           ) AS spend_brl
    FROM ops o
    LEFT JOIN live_safe ls ON ls.operation_id = o.id
    LEFT JOIN live_td   lt ON lt.operation_id = o.id
    LEFT JOIN live_tdh  lh ON lh.operation_id = o.id
  ),
  live_cp AS (
    SELECT sd.operation_id,
           COALESCE(SUM(sd.revenue),0)::NUMERIC AS cp_revenue_brl,
           COUNT(*)::INT AS cp_count
    FROM public.sales_data sd
    WHERE v_end >= v_today_brt AND sd.date = v_today_brt
      AND coalesce(sd.status,'') NOT IN ('refunded','chargeback','canceled')
    GROUP BY sd.operation_id
  ),
  fx_today AS (
    SELECT COALESCE((
      SELECT rate_avg FROM public.exchange_rates_daily
       WHERE currency_from='USD' AND currency_to='BRL' AND rate_date <= v_today_brt
       ORDER BY rate_date DESC LIMIT 1), 5.15) AS r
  ),
  live_rt AS (
    SELECT
      r.operation_id,
      COALESCE(SUM(
        CASE WHEN upper(coalesce(r.currency,'USD'))='USD'
             THEN r.amount * (SELECT r FROM fx_today)
             ELSE r.amount END
      ),0)::NUMERIC AS rt_revenue_brl,
      COUNT(*)::INT AS rt_count
    FROM public.redtrack_events r
    WHERE v_end >= v_today_brt
      AND r.occurred_at >= (v_today_brt::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo'
      AND r.occurred_at <  ((v_today_brt + 1)::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo'
      AND r.event_type = 'purchase'
    GROUP BY r.operation_id
  ),
  active_camp AS (
    SELECT operation_id, COUNT(*)::INT AS n
      FROM public.meta_campaign_status
     WHERE upper(coalesce(effective_status, status, '')) = 'ACTIVE'
     GROUP BY operation_id
  ),
  agg AS (
    SELECT
      o.id   AS operation_id,
      o.name AS operation_name,
      (COALESCE(snap.spend_brl,0) + COALESCE(live_spend.spend_brl,0)) AS spend_brl,
      (COALESCE(snap.revenue_brl,0)
        + GREATEST(COALESCE(live_cp.cp_revenue_brl,0), COALESCE(live_rt.rt_revenue_brl,0))
      ) AS revenue_brl,
      (COALESCE(snap.sales_est,0)
        + GREATEST(COALESCE(live_cp.cp_count,0), COALESCE(live_rt.rt_count,0))
      ) AS sales_count,
      COALESCE(active_camp.n,0) AS active_campaigns_count
    FROM ops o
    LEFT JOIN snap        ON snap.operation_id       = o.id
    LEFT JOIN live_spend  ON live_spend.operation_id = o.id
    LEFT JOIN live_cp     ON live_cp.operation_id    = o.id
    LEFT JOIN live_rt     ON live_rt.operation_id    = o.id
    LEFT JOIN active_camp ON active_camp.operation_id= o.id
  )
  SELECT
    jsonb_agg(
      jsonb_build_object(
        'operation_id',   a.operation_id,
        'operation_name', a.operation_name,
        'spend',          ROUND((a.spend_brl   / v_fx)::numeric, 2),
        'revenue',        ROUND((a.revenue_brl / v_fx)::numeric, 2),
        'sales',          a.sales_count,
        'roas',           CASE WHEN a.spend_brl > 0 THEN ROUND((a.revenue_brl / a.spend_brl)::numeric, 4) ELSE 0 END,
        'lucro_bruto',    ROUND(((a.revenue_brl - a.spend_brl) / v_fx)::numeric, 2),
        'margem_bruta_pct', CASE WHEN a.revenue_brl > 0
                                 THEN ROUND(((a.revenue_brl - a.spend_brl) / a.revenue_brl * 100)::numeric, 2)
                                 ELSE 0 END,
        'active_campaigns_count', a.active_campaigns_count
      )
      ORDER BY a.revenue_brl DESC
    ),
    jsonb_build_object(
      'spend',       ROUND((SUM(a.spend_brl)   / v_fx)::numeric, 2),
      'revenue',     ROUND((SUM(a.revenue_brl) / v_fx)::numeric, 2),
      'sales',       SUM(a.sales_count),
      'roas',        CASE WHEN SUM(a.spend_brl) > 0
                          THEN ROUND((SUM(a.revenue_brl) / SUM(a.spend_brl))::numeric, 4) ELSE 0 END,
      'lucro_bruto', ROUND(((SUM(a.revenue_brl) - SUM(a.spend_brl)) / v_fx)::numeric, 2),
      'operations_count', COUNT(*)
    )
  INTO v_ops_json, v_totals_json
  FROM agg a;

  v_result := jsonb_build_object(
    'range',        p_range,
    'start_date',   v_start,
    'end_date',     v_end,
    'currency',     upper(coalesce(p_currency,'BRL')),
    'fx_used',      v_fx,
    'generated_at', now(),
    'operations',   COALESCE(v_ops_json, '[]'::jsonb),
    'totals',       COALESCE(v_totals_json, '{}'::jsonb),
    'source_notes', jsonb_build_object(
      'historical_days', 'daily_totals_snapshot',
      'today_spend',     'MAX(meta_spend_realtime_safe, traffic_data, traffic_data_hourly)',
      'today_revenue',   'MAX(sales_data, redtrack_events) dual-source'
    )
  );

  RETURN v_result;
END;
$function$;