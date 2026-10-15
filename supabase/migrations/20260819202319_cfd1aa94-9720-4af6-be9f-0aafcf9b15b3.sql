-- 1. Criar ou atualizar a função de refresh do snapshot
CREATE OR REPLACE FUNCTION public.refresh_daily_snapshot(p_operation_id UUID, p_date DATE)
RETURNS VOID AS $$
DECLARE
    v_fx_rate NUMERIC;
    v_total_invest_brl NUMERIC;
    v_total_imp BIGINT;
    v_total_cli BIGINT;
BEGIN
    SELECT rate INTO v_fx_rate FROM public.exchange_rates_cache 
    WHERE TRIM(base_currency) = 'USD' AND TRIM(target_currency) = 'BRL'
    ORDER BY fetched_at DESC LIMIT 1;
    
    IF v_fx_rate IS NULL THEN v_fx_rate := 5.21; END IF;

    SELECT SUM(spend * v_fx_rate), SUM(impressions), SUM(clicks) 
    INTO v_total_invest_brl, v_total_imp, v_total_cli
    FROM public.traffic_data
    WHERE operation_id = p_operation_id AND date = p_date;

    INSERT INTO public.daily_totals_snapshot (operation_id, date, total_spend, total_impressions, total_clicks, created_at)
    VALUES (p_operation_id, p_date, COALESCE(v_total_invest_brl, 0), COALESCE(v_total_imp, 0), COALESCE(v_total_cli, 0), NOW())
    ON CONFLICT (date, (COALESCE(operation_id, '00000000-0000-0000-0000-000000000000'::uuid))) DO UPDATE SET
        total_spend = EXCLUDED.total_spend,
        total_impressions = EXCLUDED.total_impressions,
        total_clicks = EXCLUDED.total_clicks;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.refresh_daily_snapshot(UUID, DATE) TO authenticated, service_role;

-- 2. Garantir que a trigger function usa o helper
CREATE OR REPLACE FUNCTION public.trigger_update_daily_totals_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    PERFORM public.refresh_daily_snapshot(NEW.operation_id, NEW.date);
    RETURN NEW;
END;
$function$;

-- 3. Recalcular para o dia 20/08 (FAHTO)
SELECT public.refresh_daily_snapshot('8707b3f8-ab41-4a63-902c-9ab97fe50c8a', '2026-08-20');
