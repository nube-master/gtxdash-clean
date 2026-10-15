UPDATE pacing_rules
SET trigger_config = jsonb_set(
  trigger_config,
  '{extraConditions}',
  '[{"metric":"spend","op":">","unit":"abs","value":750}]'::jsonb
)
WHERE id = '6146c211-47ad-498e-bf48-c3e50f5c54ff';