
ALTER TABLE public.pacing_cooldowns
  ADD COLUMN IF NOT EXISTS locked_until_hour_brt INTEGER,
  ADD COLUMN IF NOT EXISTS locked_by_rule_id UUID REFERENCES public.pacing_rules(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cooldowns_locked_hour
  ON public.pacing_cooldowns(campaign_id, locked_until_hour_brt)
  WHERE locked_until_hour_brt IS NOT NULL;

-- Insere a regra "🌙 Madrugada Lock 3h-9h" desligada + dry_run.
INSERT INTO public.pacing_rules (
  name, description, enabled, dry_run,
  filter_config, trigger_config, action_config, notification_config
)
SELECT
  '🌙 Madrugada Lock 3h-9h — Pausa sem venda',
  'Pausa TODAS campanhas que não venderam entre 3h-9h BRT. Lock até 9h (nenhuma outra regra religa).',
  false,
  true,
  '{}'::jsonb,
  '{"type":"hourly_window","kind":"hourly_window","hourStart":3,"hourEnd":9,"spendBetweenMin":0,"andNoSale":true,"noSaleMinutes":1}'::jsonb,
  '{"type":"pause","kind":"pause","cooldownMinutes":360,"cooldownMin":360,"smartReEnable":false,"autoResume":false,"hardStopUntilHourBRT":9}'::jsonb,
  '{"pushcut":true,"level":"high","severity":"high"}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.pacing_rules WHERE name = '🌙 Madrugada Lock 3h-9h — Pausa sem venda'
);
