DELETE FROM pacing_rules WHERE name LIKE '%[CBO CZ]%';

INSERT INTO pacing_rules (name, description, enabled, dry_run, filter_config, trigger_config, action_config, notification_config) VALUES (
  '[CBO CZ] CPA Breakeven R$ 220',
  'Hard stop absoluto — campanha gastou 1× receita real (R$ 220) sem vender.',
  false, true,
  '{"projects": ["CBO CZ"], "currency": "BRL"}'::jsonb,
  '{"type": "absolute_spend_no_sale", "spendThreshold": 220, "andNoSaleInLastMinutes": 0}'::jsonb,
  '{"type": "pause", "cooldownMinutes": 60, "smartReEnable": false}'::jsonb,
  '{"pushcut": true, "level": "high"}'::jsonb
);

INSERT INTO pacing_rules (name, description, enabled, dry_run, filter_config, trigger_config, action_config, notification_config) VALUES (
  '[CBO CZ] CPA Alvo R$ 165 (margem 25%)',
  'Pausa quando gasta R$ 165 sem venda há 60min — preserva margem 25%',
  false, true,
  '{"projects": ["CBO CZ"]}'::jsonb,
  '{"type": "absolute_spend_no_sale", "spendThreshold": 165, "andNoSaleInLastMinutes": 60}'::jsonb,
  '{"type": "pause", "cooldownMinutes": 30, "smartReEnable": true}'::jsonb,
  '{"pushcut": true, "level": "high"}'::jsonb
);

INSERT INTO pacing_rules (name, description, enabled, dry_run, filter_config, trigger_config, action_config, notification_config) VALUES (
  '[CBO CZ] Vendeu + Prejuízo > -R$ 220',
  'Pausa quando vendeu ≥1 mas profit < -R$ 220 (= 1 venda inteira no buraco)',
  false, true,
  '{"projects": ["CBO CZ"]}'::jsonb,
  '{"type": "profit_threshold", "profitThreshold": -220, "minSales": 1}'::jsonb,
  '{"type": "pause", "cooldownMinutes": 60, "smartReEnable": false}'::jsonb,
  '{"pushcut": true, "level": "high"}'::jsonb
);

INSERT INTO pacing_rules (name, description, enabled, dry_run, filter_config, trigger_config, action_config, notification_config) VALUES (
  '[CBO CZ] CBO Geral — CPA R$ 165',
  'Pausa campanhas com "CBO" no nome quando spend > R$ 165 sem venda há 60min',
  false, true,
  '{"nameContains": "CBO", "projects": ["CBO CZ"]}'::jsonb,
  '{"type": "absolute_spend_no_sale", "spendThreshold": 165, "andNoSaleInLastMinutes": 60}'::jsonb,
  '{"type": "pause", "cooldownMinutes": 30, "smartReEnable": true}'::jsonb,
  '{"pushcut": true, "level": "high"}'::jsonb
);