
UPDATE public.pacing_rules
SET
  action_config = jsonb_set(
    jsonb_set(
      COALESCE(action_config, '{}'::jsonb) - 'maxFiresPerDay',
      '{maxFiresPerCampaignPerDay}', '4'::jsonb, true
    ),
    '{cooldownMin}', '60'::jsonb, true
  ),
  trigger_config = jsonb_set(
    COALESCE(trigger_config, '{}'::jsonb),
    '{evalEveryMin}', '5'::jsonb, true
  ),
  updated_at = now()
WHERE id = '87f181be-6cf2-41c3-8a66-b5ac1a1c485f';
