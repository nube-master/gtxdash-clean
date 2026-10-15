-- 1. Manual traffic_data sync for 19/08 (FAHTO)
BEGIN;
INSERT INTO traffic_data (operation_id, account_id, campaign_name, adset_name, ad_name, spend, impressions, clicks, date) VALUES
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_1246531708323610','HT 278746','ALL','ALL', 2869.79, 26826, 2786, '2026-08-19'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_1678452126568980','HT 232960','ALL','ALL', 1.155, 10, 1, '2026-08-19'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_1056576076838554','HT 198904','ALL','ALL', 0.55, 4, 1, '2026-08-19'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_1300776715534571','Sharkwares 1186','ALL','ALL', 1146.255, 8217, 818, '2026-08-19'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_1157423260787127','Sharkwares 1185','ALL','ALL', 3825.58, 34841, 2837, '2026-08-19'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_4518416995113290','HT 965450','ALL','ALL', 2920.115, 22365, 2099, '2026-08-19'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_914902035011378','HT 918383','ALL','ALL', 3836.635, 35647, 3453, '2026-08-19'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_1648237836725143','HT 267270','ALL','ALL', 406.67, 9848, 608, '2026-08-19'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_2447877529027535','HT 885886','ALL','ALL', 1.705, 25, 1, '2026-08-19'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_992398967122465','HT 274220','ALL','ALL', 672.1, 5849, 554, '2026-08-19'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_2001512933899143','HT 616391','ALL','ALL', 3.135, 10, 3, '2026-08-19')
ON CONFLICT (date, account_id, campaign_name, adset_name, ad_name) DO UPDATE SET 
  spend=EXCLUDED.spend, impressions=EXCLUDED.impressions,
  clicks=EXCLUDED.clicks, updated_at=NOW();
COMMIT;

-- 2. Update snapshot for FAHTO 19/08
WITH current_fx AS (
    SELECT rate FROM public.exchange_rates_cache 
    WHERE TRIM(base_currency) = 'USD' AND TRIM(target_currency) = 'BRL'
    ORDER BY fetched_at DESC LIMIT 1
),
totals AS (
  SELECT 
    operation_id, 
    date,
    SUM(spend * COALESCE((SELECT rate FROM current_fx), 5.21)) as total_invest_brl,
    SUM(impressions) as total_imp,
    SUM(clicks) as total_cli
  FROM public.traffic_data
  WHERE operation_id = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a'
    AND date = '2026-08-19'
  GROUP BY 1, 2
)
INSERT INTO public.daily_totals_snapshot (operation_id, date, total_spend, total_impressions, total_clicks, created_at)
SELECT operation_id, date, total_invest_brl, total_imp, total_cli, NOW()
FROM totals
ON CONFLICT (date, (COALESCE(operation_id, '00000000-0000-0000-0000-000000000000'::uuid))) DO UPDATE SET
  total_spend = EXCLUDED.total_spend,
  total_impressions = EXCLUDED.total_impressions,
  total_clicks = EXCLUDED.total_clicks;

-- 3. Trigger auto-update snapshot
CREATE OR REPLACE FUNCTION public.trigger_update_daily_totals_snapshot()
RETURNS TRIGGER AS $$
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
    WHERE operation_id = NEW.operation_id AND date = NEW.date;

    INSERT INTO public.daily_totals_snapshot (operation_id, date, total_spend, total_impressions, total_clicks, created_at)
    VALUES (NEW.operation_id, NEW.date, v_total_invest_brl, v_total_imp, v_total_cli, NOW())
    ON CONFLICT (date, (COALESCE(operation_id, '00000000-0000-0000-0000-000000000000'::uuid))) DO UPDATE SET
        total_spend = EXCLUDED.total_spend,
        total_impressions = EXCLUDED.total_impressions,
        total_clicks = EXCLUDED.total_clicks;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_traffic_data_update_snapshot ON public.traffic_data;
CREATE TRIGGER tr_traffic_data_update_snapshot
AFTER INSERT OR UPDATE ON public.traffic_data
FOR EACH ROW EXECUTE FUNCTION public.trigger_update_daily_totals_snapshot();

-- 4. Update crons to run every 30 minutes (Using cron.schedule to bypass table lock if allowed)
SELECT cron.schedule('sync-meta-today-30min', '*/30 * * * *', (SELECT command FROM cron.job WHERE jobname = 'sync-meta-today-3min'));
SELECT cron.unschedule('sync-meta-today-3min');

SELECT cron.schedule('sync-meta-fast-30min', '*/30 * * * *', (SELECT command FROM cron.job WHERE jobname = 'sync-meta-fast-every-1min'));
SELECT cron.unschedule('sync-meta-fast-every-1min');

SELECT cron.schedule('sync-meta-balance-30min', '*/30 * * * *', (SELECT command FROM cron.job WHERE jobname = 'sync-meta-balance-10min'));
SELECT cron.unschedule('sync-meta-balance-10min');

SELECT cron.schedule('sync-meta-ads-orchestrator-30min', '*/30 * * * *', (SELECT command FROM cron.job WHERE jobname = 'sync-meta-ads-orchestrator'));
SELECT cron.unschedule('sync-meta-ads-orchestrator');
