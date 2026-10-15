
ALTER TABLE public.pacing_cooldowns DROP CONSTRAINT IF EXISTS pacing_cooldowns_set_by_check;
ALTER TABLE public.pacing_cooldowns
  ADD CONSTRAINT pacing_cooldowns_set_by_check
  CHECK (set_by = ANY (ARRAY['daemon','manual','smart_reenable','daemon_lock','reactivation_lock']::text[]));

INSERT INTO public.pacing_rules (
  name, description, enabled, dry_run,
  filter_config, trigger_config, action_config, notification_config
) VALUES (
  '🔁 RELIGAR | IC + Gasto Baixo',
  'Religa campanhas pausadas com >=1 IC e gastaram <R$160 (delay de conversão). Cooldown 6h protege contra re-pausa pela regra de IC.',
  true, false,
  jsonb_build_object('appliesTo','paused'),
  jsonb_build_object(
    'kind','metric_threshold','window','today','evalEveryMin',5,'tolerance',1,
    'accelPctOfDaily',30,'noSaleMinutes',60,'andNoSale',false,
    'profitThresholdUnit','brl','groupId','',
    'extraConditions', jsonb_build_array(
      jsonb_build_object('metric','spend','op','<','unit','abs','value',160),
      jsonb_build_object('metric','ic','op','>=','unit','abs','value',1)
    )
  ),
  jsonb_build_object('kind','activate','cooldownMin',360,'maxFiresPerDay',0,'maxFiresPerCampaignPerDay',2,'autoResume',false,'reducePct',50),
  '{}'::jsonb
),
(
  '🔁 RELIGAR | Venda + Gasto Baixo',
  'Religa campanhas pausadas com >=1 venda e gastaram <R$160. Cooldown 6h protege contra re-pausa.',
  true, false,
  jsonb_build_object('appliesTo','paused'),
  jsonb_build_object(
    'kind','metric_threshold','window','today','evalEveryMin',5,'tolerance',1,
    'accelPctOfDaily',30,'noSaleMinutes',60,'andNoSale',false,
    'profitThresholdUnit','brl','groupId','',
    'extraConditions', jsonb_build_array(
      jsonb_build_object('metric','spend','op','<','unit','abs','value',160),
      jsonb_build_object('metric','sales','op','>=','unit','abs','value',1)
    )
  ),
  jsonb_build_object('kind','activate','cooldownMin',360,'maxFiresPerDay',0,'maxFiresPerCampaignPerDay',2,'autoResume',false,'reducePct',50),
  '{}'::jsonb
);
