
INSERT INTO public.pacing_rules (name, description, enabled, dry_run, filter_config, trigger_config, action_config, notification_config)
VALUES
(
  '🛡️ Blindagem Scale — ROAS < 2.30 (-30%)',
  'Protege campanhas escaladas (Auto-Scale Madrugada). Se ROAS do dia cair abaixo de 2.30 com gasto > R$300 e >= 2 vendas hoje, recua orçamento em 30%. Máx 3 cortes/dia com cooldown 60min.',
  true,
  false,
  '{"account":"all","activeHourEnd":23,"activeHourStart":0,"appliesTo":"active","minBudget":0,"minSpendYesterdayBrl":0,"nameContains":"","phases":[],"projects":["BS-COD","CB-COD","TDM-COD","VIT-RRT","VIT-RRT-SVK","VIT-RRT-POL","VIT-RRT-ITA","VIT-RRT-HU"]}'::jsonb,
  '{"kind":"metric_threshold","evalEveryMin":5,"window":"today","hourStart":0,"hourEnd":23,"extraConditions":[
    {"metric":"roas","op":"<","unit":"abs","value":2.30},
    {"metric":"spend","op":">=","unit":"abs","value":300},
    {"metric":"sales","op":">=","unit":"abs","value":2}
  ]}'::jsonb,
  '{"kind":"reduce_budget","reducePct":30,"cooldownMin":60,"maxFiresPerCampaignPerDay":3,"maxFiresPerDay":0,"autoResume":false}'::jsonb,
  '{"pushcut":true,"severity":"high"}'::jsonb
),
(
  '🛡️ Blindagem Scale — ROAS < 2.00 (-30% agressivo)',
  'Segundo nível de proteção. Se ROAS do dia cair abaixo de 2.00 com gasto > R$300 e >= 2 vendas hoje, recua orçamento em 30%. Máx 3 cortes/dia com cooldown 60min. Complementar à regra de 2.30.',
  true,
  false,
  '{"account":"all","activeHourEnd":23,"activeHourStart":0,"appliesTo":"active","minBudget":0,"minSpendYesterdayBrl":0,"nameContains":"","phases":[],"projects":["BS-COD","CB-COD","TDM-COD","VIT-RRT","VIT-RRT-SVK","VIT-RRT-POL","VIT-RRT-ITA","VIT-RRT-HU"]}'::jsonb,
  '{"kind":"metric_threshold","evalEveryMin":5,"window":"today","hourStart":0,"hourEnd":23,"extraConditions":[
    {"metric":"roas","op":"<","unit":"abs","value":2.00},
    {"metric":"spend","op":">=","unit":"abs","value":300},
    {"metric":"sales","op":">=","unit":"abs","value":2}
  ]}'::jsonb,
  '{"kind":"reduce_budget","reducePct":30,"cooldownMin":60,"maxFiresPerCampaignPerDay":3,"maxFiresPerDay":0,"autoResume":false}'::jsonb,
  '{"pushcut":true,"severity":"critical"}'::jsonb
);
