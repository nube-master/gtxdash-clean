DELETE FROM public.pacing_rules WHERE name LIKE '%[CBO IT]%';

INSERT INTO public.pacing_rules (name, description, enabled, dry_run, filter_config, trigger_config, action_config, notification_config) VALUES
(
  '[CBO IT] CPA Breakeven R$ 252',
  'Hard stop absoluto — campanha gastou 1× receita real (R$ 252) sem vender. Mata pra não queimar mais.',
  false, true,
  '{"projects": ["CBO IT"], "currency": "BRL"}'::jsonb,
  '{"type": "absolute_spend_no_sale", "spendThreshold": 252, "andNoSaleInLastMinutes": 0}'::jsonb,
  '{"type": "pause", "cooldownMinutes": 60, "smartReEnable": false}'::jsonb,
  '{"pushcut": true, "level": "high"}'::jsonb
),
(
  '[CBO IT] CPA Alvo R$ 190 (margem 25%)',
  'Pausa quando gasta R$ 190 sem venda há 60min — preserva margem 25%',
  false, true,
  '{"projects": ["CBO IT"]}'::jsonb,
  '{"type": "absolute_spend_no_sale", "spendThreshold": 190, "andNoSaleInLastMinutes": 60}'::jsonb,
  '{"type": "pause", "cooldownMinutes": 30, "smartReEnable": true}'::jsonb,
  '{"pushcut": true, "level": "high"}'::jsonb
),
(
  '[CBO IT] Vendeu + Prejuízo > -R$ 252',
  'Pausa quando vendeu ≥1 mas profit < -R$ 252 (= 1 venda inteira no buraco)',
  false, true,
  '{"projects": ["CBO IT"]}'::jsonb,
  '{"type": "profit_threshold", "profitThreshold": -252, "profitThresholdUnit": "brl", "extraConditions": [{"op": ">=", "unit": "abs", "value": 1, "metric": "sales"}]}'::jsonb,
  '{"type": "pause", "cooldownMinutes": 60, "smartReEnable": false}'::jsonb,
  '{"pushcut": true, "level": "high"}'::jsonb
),
(
  '[CBO IT] CBO Geral — CPA R$ 190',
  'Pausa campanhas com "CBO" no nome quando spend > R$ 190 sem venda há 60min',
  false, true,
  '{"nameContains": "CBO", "projects": ["CBO IT"]}'::jsonb,
  '{"type": "absolute_spend_no_sale", "spendThreshold": 190, "andNoSaleInLastMinutes": 60}'::jsonb,
  '{"type": "pause", "cooldownMinutes": 30, "smartReEnable": true}'::jsonb,
  '{"pushcut": true, "level": "high"}'::jsonb
);