UPDATE public.pacing_rules
SET action_config = jsonb_set(
  jsonb_set(
    jsonb_set(coalesce(action_config,'{}'::jsonb), '{autoResume}', 'false'::jsonb, true),
    '{smartReEnable}', 'false'::jsonb, true),
  '{cooldownMin}', '1440'::jsonb, true)
WHERE id = '6146c211-47ad-498e-bf48-c3e50f5c54ff';