REVOKE ALL ON FUNCTION public.log_spend_brl_correction(uuid, text, text, date, numeric, numeric, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_spend_brl_correction(uuid, text, text, date, numeric, numeric, numeric, numeric) TO service_role;
REVOKE ALL ON FUNCTION public.get_spend_brl_consistency() FROM PUBLIC, anon;