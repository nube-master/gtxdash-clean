
-- 1) Destrava agora: zera fire_count_today de regras cujo último disparo NÃO foi hoje (BRT)
UPDATE public.pacing_rules
SET fire_count_today = 0
WHERE fire_count_today > 0
  AND (
    last_triggered_at IS NULL
    OR (last_triggered_at AT TIME ZONE 'America/Sao_Paulo')::date
       <> (now() AT TIME ZONE 'America/Sao_Paulo')::date
  );

-- 2) Função de reset diário
CREATE OR REPLACE FUNCTION public.reset_pacing_fire_count_daily()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.pacing_rules
  SET fire_count_today = 0
  WHERE fire_count_today > 0
    AND (
      last_triggered_at IS NULL
      OR (last_triggered_at AT TIME ZONE 'America/Sao_Paulo')::date
         <> (now() AT TIME ZONE 'America/Sao_Paulo')::date
    );
$$;

-- 3) Agenda cron às 03:00 UTC (= 00:00 BRT) todo dia
DO $$
BEGIN
  PERFORM cron.unschedule('reset-pacing-fire-count-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'reset-pacing-fire-count-daily',
  '0 3 * * *',
  $$ SELECT public.reset_pacing_fire_count_daily(); $$
);
