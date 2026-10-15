DROP TRIGGER IF EXISTS trg_traffic_data_assert_spend_brl ON public.traffic_data;
DROP TRIGGER IF EXISTS trg_traffic_hourly_assert_spend_brl ON public.traffic_data_hourly;
DROP TRIGGER IF EXISTS trg_traffic_breakdowns_assert_spend_brl ON public.traffic_breakdowns;

CREATE TRIGGER zz_traffic_data_assert_spend_brl
BEFORE INSERT OR UPDATE ON public.traffic_data
FOR EACH ROW EXECUTE FUNCTION public.assert_spend_brl_ratio();

CREATE TRIGGER zz_traffic_hourly_assert_spend_brl
BEFORE INSERT OR UPDATE ON public.traffic_data_hourly
FOR EACH ROW EXECUTE FUNCTION public.assert_spend_brl_ratio();

CREATE TRIGGER zz_traffic_breakdowns_assert_spend_brl
BEFORE INSERT OR UPDATE ON public.traffic_breakdowns
FOR EACH ROW EXECUTE FUNCTION public.assert_spend_brl_ratio();