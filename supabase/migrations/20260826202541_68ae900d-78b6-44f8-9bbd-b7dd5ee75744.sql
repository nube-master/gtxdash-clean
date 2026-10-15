ALTER TABLE public.backup_20260826_traffic_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_20260826_traffic_data_hourly ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_20260826_traffic_breakdowns ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.warn_spend_currency_mismatch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF COALESCE(upper(NEW.currency), 'BRL') <> 'BRL'
     AND COALESCE(NEW.spend, 0) > 500
     AND NEW.operation_id IS NOT NULL THEN
    INSERT INTO public.system_logs (type, function_name, message, operation_id, metadata)
    VALUES (
      'SPEND_CURRENCY_WARNING',
      TG_TABLE_NAME,
      format('Investimento suspeito de estar em BRL na coluna spend (conta %s, %s): spend=%s %s',
             NEW.account_id, NEW.date, round(NEW.spend, 2), NEW.currency),
      NEW.operation_id,
      jsonb_build_object('account_id', NEW.account_id, 'date', NEW.date,
                         'spend', NEW.spend, 'spend_brl', NEW.spend_brl,
                         'fx_rate', NEW.fx_rate, 'currency', NEW.currency)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_traffic_data_warn_currency ON public.traffic_data;
CREATE TRIGGER zz_traffic_data_warn_currency
AFTER INSERT OR UPDATE ON public.traffic_data
FOR EACH ROW EXECUTE FUNCTION public.warn_spend_currency_mismatch();

DROP TRIGGER IF EXISTS zz_traffic_hourly_warn_currency ON public.traffic_data_hourly;
CREATE TRIGGER zz_traffic_hourly_warn_currency
AFTER INSERT OR UPDATE ON public.traffic_data_hourly
FOR EACH ROW EXECUTE FUNCTION public.warn_spend_currency_mismatch();