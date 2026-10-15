ALTER TABLE public.pacing_cooldowns
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

UPDATE public.pacing_cooldowns
SET id = gen_random_uuid()
WHERE id IS NULL;

ALTER TABLE public.pacing_cooldowns
  ALTER COLUMN id SET NOT NULL;

ALTER TABLE public.pacing_cooldowns
  DROP CONSTRAINT IF EXISTS pacing_cooldowns_pkey;

ALTER TABLE public.pacing_cooldowns
  ALTER COLUMN rule_id DROP NOT NULL;

ALTER TABLE public.pacing_cooldowns
  ADD CONSTRAINT pacing_cooldowns_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX IF NOT EXISTS pacing_cooldowns_campaign_rule_uidx
  ON public.pacing_cooldowns (campaign_id, rule_id);

CREATE UNIQUE INDEX IF NOT EXISTS pacing_cooldowns_manual_campaign_uidx
  ON public.pacing_cooldowns (campaign_id)
  WHERE rule_id IS NULL;

WITH latest_manual AS (
  SELECT DISTINCT ON (campaign_id)
    campaign_id,
    campaign_name,
    account_id,
    action_type,
    reason,
    triggered_at
  FROM public.pacing_action_log
  WHERE campaign_id IS NOT NULL
    AND (
      reason ILIKE '%manual%'
      OR reason ILIKE 'mcp:%'
    )
  ORDER BY campaign_id, triggered_at DESC
), manual_paused AS (
  SELECT lm.campaign_id, lm.reason
  FROM latest_manual lm
  JOIN public.meta_campaign_status ms ON ms.campaign_id = lm.campaign_id
  WHERE lm.action_type = 'pause'
    AND upper(coalesce(ms.effective_status, ms.status, '')) = 'PAUSED'
)
DELETE FROM public.pacing_cooldowns pc
USING manual_paused mp
WHERE pc.campaign_id = mp.campaign_id;

WITH latest_manual AS (
  SELECT DISTINCT ON (campaign_id)
    campaign_id,
    campaign_name,
    account_id,
    action_type,
    reason,
    triggered_at
  FROM public.pacing_action_log
  WHERE campaign_id IS NOT NULL
    AND (
      reason ILIKE '%manual%'
      OR reason ILIKE 'mcp:%'
    )
  ORDER BY campaign_id, triggered_at DESC
), manual_paused AS (
  SELECT lm.campaign_id, lm.reason
  FROM latest_manual lm
  JOIN public.meta_campaign_status ms ON ms.campaign_id = lm.campaign_id
  WHERE lm.action_type = 'pause'
    AND upper(coalesce(ms.effective_status, ms.status, '')) = 'PAUSED'
)
INSERT INTO public.pacing_cooldowns (
  campaign_id,
  rule_id,
  snoozed_until,
  reason,
  set_by
)
SELECT
  campaign_id,
  NULL,
  now() + interval '100 years',
  'Pausa manual sticky migrada — nenhuma regra automática pode religar até resume manual. Último motivo: ' || coalesce(reason, 'manual'),
  'manual'
FROM manual_paused;