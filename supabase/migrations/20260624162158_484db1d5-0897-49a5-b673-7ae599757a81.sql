UPDATE public.pacing_rules
SET trigger_config = jsonb_set(
  trigger_config,
  '{extraConditions}',
  '[{"metric":"sales","op":">=","unit":"abs","value":1}]'::jsonb
),
description = 'Pausa quando vendeu ≥1 hoje mas profit líquido < -R$905,59 (≈ -$180). Usa sales do dia, não da última hora.',
last_evaluated_at = NULL,
updated_at = now()
WHERE id = 'ddbea16c-42b5-4507-b481-3b2f3e06f406';