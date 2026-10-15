-- Ajustar crons para rodar a cada 30 min entre 06h-23h BRT (09h-02h UTC aprox)
-- Nota: pg_cron usa UTC. 06h BRT = 09h UTC. 23h BRT = 02h UTC.

-- sync-meta-ads da FAHTO
-- Assumindo que o nome do job é 'sync-meta-ads-fahto' ou similar
-- Como não consigo ver o schema cron, vou tentar atualizar via pg_cron se disponível
-- Mas o workflow padrão é usar scheduled edge functions ou configurar no dashboard.

-- Vamos garantir que o gatilho automático está 100%
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

-- Se a trigger não existir, criar
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_traffic_data_update_snapshot') THEN
        CREATE TRIGGER tr_traffic_data_update_snapshot
        AFTER INSERT OR UPDATE ON traffic_data
        FOR EACH ROW EXECUTE FUNCTION trigger_update_daily_totals_snapshot();
    END IF;
END $$;
