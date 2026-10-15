-- 1) traffic_breakdowns: mesma correção de recompute em UPDATE + audit trail
CREATE OR REPLACE FUNCTION public.traffic_breakdowns_fill_spend_brl()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_currency text;
  v_last_date date;
  v_recompute boolean := false;
BEGIN
  v_currency := NULLIF(upper(COALESCE(NEW.currency, '')), '');
  IF v_currency IS NULL THEN
    v_currency := public.account_currency(NEW.account_id);
  END IF;
  v_currency := COALESCE(v_currency, 'BRL');
  NEW.currency := v_currency;

  IF NEW.fx_rate IS NULL OR NEW.fx_rate <= 0 THEN
    NEW.fx_rate := public.fx_rate_for(v_currency, NEW.date);
  END IF;
  NEW.fx_rate := COALESCE(NEW.fx_rate, 1);

  IF NEW.spend_brl IS NULL THEN
    v_recompute := true;
  ELSIF TG_OP = 'UPDATE'
        AND NEW.spend IS DISTINCT FROM OLD.spend
        AND NEW.spend_brl IS NOT DISTINCT FROM OLD.spend_brl THEN
    v_recompute := true;
  END IF;

  IF v_recompute THEN
    NEW.spend_brl := COALESCE(NEW.spend, 0) * NEW.fx_rate;
  END IF;

  IF v_currency = 'BRL' THEN
    NEW.fx_stale := false;
  ELSE
    SELECT max(r.rate_date) INTO v_last_date
      FROM public.exchange_rates_daily r
     WHERE r.currency_from = v_currency AND r.currency_to = 'BRL';
    NEW.fx_stale := (v_last_date IS NULL OR v_last_date < NEW.date - 1);
  END IF;

  RETURN NEW;
END;
$function$;

-- 2) Audit trail: loga em system_logs quando o trigger corrige um valor travado
CREATE OR REPLACE FUNCTION public.log_spend_brl_correction(
  _operation_id uuid,
  _table text,
  _account_id text,
  _date date,
  _old_brl numeric,
  _new_brl numeric,
  _spend numeric,
  _fx numeric
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _operation_id IS NULL THEN RETURN; END IF;
  -- só registra correções materiais (> R$ 1) para não inundar o log
  IF abs(COALESCE(_new_brl,0) - COALESCE(_old_brl,0)) < 1 THEN RETURN; END IF;
  INSERT INTO public.system_logs (type, function_name, message, metadata, operation_id)
  VALUES (
    'spend_brl_corrected',
    'trg_' || _table || '_fill_spend_brl',
    format('spend_brl corrigido em %s: %s -> %s', _table,
           round(COALESCE(_old_brl,0)::numeric, 2), round(COALESCE(_new_brl,0)::numeric, 2)),
    jsonb_build_object(
      'table', _table, 'account_id', _account_id, 'date', _date,
      'old_spend_brl', _old_brl, 'new_spend_brl', _new_brl,
      'spend', _spend, 'fx_rate', _fx
    ),
    _operation_id
  );
EXCEPTION WHEN OTHERS THEN
  RETURN; -- audit nunca bloqueia o write
END;
$$;

CREATE OR REPLACE FUNCTION public.traffic_data_fill_spend_brl()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_currency text;
  v_last_date date;
  v_recompute boolean := false;
  v_old_brl numeric;
BEGIN
  v_currency := NULLIF(upper(COALESCE(NEW.currency, '')), '');
  IF v_currency IS NULL THEN
    v_currency := public.account_currency(NEW.account_id);
  END IF;
  v_currency := COALESCE(v_currency, 'BRL');
  NEW.currency := v_currency;

  IF NEW.fx_rate IS NULL OR NEW.fx_rate <= 0 THEN
    NEW.fx_rate := public.fx_rate_for(v_currency, NEW.date);
  END IF;
  NEW.fx_rate := COALESCE(NEW.fx_rate, 1);

  IF NEW.spend_brl IS NULL THEN
    v_recompute := true;
  ELSIF TG_OP = 'UPDATE'
        AND NEW.spend IS DISTINCT FROM OLD.spend
        AND NEW.spend_brl IS NOT DISTINCT FROM OLD.spend_brl THEN
    v_recompute := true;
  END IF;

  IF v_recompute THEN
    v_old_brl := NEW.spend_brl;
    NEW.spend_brl := COALESCE(NEW.spend, 0) * NEW.fx_rate;
    IF TG_OP = 'UPDATE' THEN
      PERFORM public.log_spend_brl_correction(
        NEW.operation_id, 'traffic_data', NEW.account_id, NEW.date,
        v_old_brl, NEW.spend_brl, NEW.spend, NEW.fx_rate);
    END IF;
  END IF;

  IF v_currency = 'BRL' THEN
    NEW.fx_stale := false;
  ELSE
    SELECT max(r.rate_date) INTO v_last_date
      FROM public.exchange_rates_daily r
     WHERE r.currency_from = v_currency AND r.currency_to = 'BRL';
    NEW.fx_stale := (v_last_date IS NULL OR v_last_date < NEW.date - 1);
  END IF;

  RETURN NEW;
END;
$function$;

-- 3) Guard rail: recusa gravação com ratio fora de 0.98-1.02
CREATE OR REPLACE FUNCTION public.assert_spend_brl_ratio()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_expected numeric;
BEGIN
  IF COALESCE(NEW.spend, 0) <= 1 OR COALESCE(NEW.fx_rate, 0) <= 0 THEN
    RETURN NEW;
  END IF;
  v_expected := NEW.spend * NEW.fx_rate;
  IF v_expected <= 0 THEN RETURN NEW; END IF;

  IF COALESCE(NEW.spend_brl, 0) / v_expected NOT BETWEEN 0.98 AND 1.02 THEN
    RAISE EXCEPTION
      'spend_brl inconsistente em % (account=%, date=%): spend=% fx=% spend_brl=% (esperado ~%)',
      TG_TABLE_NAME, NEW.account_id, NEW.date, NEW.spend, NEW.fx_rate,
      NEW.spend_brl, round(v_expected, 2);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_traffic_data_assert_spend_brl ON public.traffic_data;
CREATE TRIGGER trg_traffic_data_assert_spend_brl
  BEFORE INSERT OR UPDATE ON public.traffic_data
  FOR EACH ROW EXECUTE FUNCTION public.assert_spend_brl_ratio();

DROP TRIGGER IF EXISTS trg_traffic_hourly_assert_spend_brl ON public.traffic_data_hourly;
CREATE TRIGGER trg_traffic_hourly_assert_spend_brl
  BEFORE INSERT OR UPDATE ON public.traffic_data_hourly
  FOR EACH ROW EXECUTE FUNCTION public.assert_spend_brl_ratio();

DROP TRIGGER IF EXISTS trg_traffic_breakdowns_assert_spend_brl ON public.traffic_breakdowns;
CREATE TRIGGER trg_traffic_breakdowns_assert_spend_brl
  BEFORE INSERT OR UPDATE ON public.traffic_breakdowns
  FOR EACH ROW EXECUTE FUNCTION public.assert_spend_brl_ratio();

-- 4) Health check RPC
CREATE OR REPLACE FUNCTION public.get_spend_brl_consistency()
RETURNS TABLE (
  operation_id uuid,
  operation_name text,
  date date,
  table_name text,
  total_rows bigint,
  suspect_rows bigint,
  bug_rows bigint,
  sum_spend_brl numeric,
  sum_expected_brl numeric,
  diff_pct numeric,
  status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
WITH src AS (
  SELECT 'traffic_data'::text AS tbl, t.operation_id, t.date, t.spend, t.fx_rate, t.spend_brl
    FROM public.traffic_data t
   WHERE t.date >= ((now() AT TIME ZONE 'America/Sao_Paulo')::date - 1)
  UNION ALL
  SELECT 'traffic_data_hourly'::text, h.operation_id, h.date, h.spend, h.fx_rate, h.spend_brl
    FROM public.traffic_data_hourly h
   WHERE h.date >= ((now() AT TIME ZONE 'America/Sao_Paulo')::date - 1)
  UNION ALL
  SELECT 'traffic_breakdowns'::text, b.operation_id, b.date, b.spend, b.fx_rate, b.spend_brl
    FROM public.traffic_breakdowns b
   WHERE b.date >= ((now() AT TIME ZONE 'America/Sao_Paulo')::date - 1)
),
agg AS (
  SELECT
    s.operation_id,
    s.date,
    s.tbl AS table_name,
    count(*) AS total_rows,
    count(*) FILTER (
      WHERE COALESCE(s.spend,0) > 0 AND COALESCE(s.fx_rate,0) > 0
        AND COALESCE(s.spend_brl,0) / (s.spend * s.fx_rate) < 0.5
    ) AS suspect_rows,
    count(*) FILTER (
      WHERE COALESCE(s.spend,0) > 1 AND COALESCE(s.spend_brl,0) < 0.1
    ) AS bug_rows,
    round(COALESCE(sum(s.spend_brl),0)::numeric, 2) AS sum_spend_brl,
    round(COALESCE(sum(s.spend * COALESCE(s.fx_rate,1)),0)::numeric, 2) AS sum_expected_brl
  FROM src s
  GROUP BY s.operation_id, s.date, s.tbl
)
SELECT
  a.operation_id,
  o.name::text AS operation_name,
  a.date,
  a.table_name,
  a.total_rows,
  a.suspect_rows,
  a.bug_rows,
  a.sum_spend_brl,
  a.sum_expected_brl,
  CASE WHEN a.sum_expected_brl > 0
       THEN round(((a.sum_spend_brl - a.sum_expected_brl) / a.sum_expected_brl * 100)::numeric, 2)
       ELSE 0 END AS diff_pct,
  CASE
    WHEN a.bug_rows > 0 THEN 'BUG'
    WHEN a.suspect_rows > 0 THEN 'SUSPEITO'
    WHEN a.sum_expected_brl > 0
         AND abs(a.sum_spend_brl - a.sum_expected_brl) / a.sum_expected_brl > 0.02 THEN 'DRIFT'
    ELSE 'OK'
  END AS status
FROM agg a
LEFT JOIN public.operations o ON o.id = a.operation_id
ORDER BY a.date DESC, o.name, a.table_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_spend_brl_consistency() TO authenticated, service_role;

-- 5) Cron diário 00:30 BRT (03:30 UTC)
SELECT cron.unschedule('spend-brl-health-daily')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'spend-brl-health-daily');

SELECT cron.schedule(
  'spend-brl-health-daily',
  '30 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://taeduxiandktefcwgspx.supabase.co/functions/v1/spend-brl-health',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer REDACTED_JWT'
    ),
    body := '{}'::jsonb
  );
  $$
);
