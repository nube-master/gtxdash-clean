UPDATE public.pacing_rules
SET name = '🔄 RELIGAR | Pós-Madrugada',
    description = 'Religa campanhas pausadas que gastaram entre $0.01 e $100 hoje. Roda 1x/dia às 10:00 BRT.',
    filter_config = jsonb_build_object(
      'account','all','appliesTo','paused','minBudget',0,'minSpendYesterdayBrl',0,
      'nameContains','','phases','[]'::jsonb,'projects','[]'::jsonb
    ),
    trigger_config = jsonb_build_object(
      'kind','daily_schedule','scheduledHour',10,'scheduledMinute',0,
      'window','today','evalEveryMin',1,'tolerance',1.5,
      'extraConditions', jsonb_build_array(
        jsonb_build_object('metric','spend','op','>','value',0.01,'unit','abs'),
        jsonb_build_object('metric','spend','op','<=','value',100,'unit','abs')
      ),
      'andNoSale', false, 'noSaleMinutes', 60, 'profitThresholdUnit','brl',
      'accelPctOfDaily',30,'groupId',''
    ),
    action_config = jsonb_build_object(
      'kind','activate','maxFiresPerDay',1,'cooldownMin',0,'autoResume',false,'reducePct',50
    ),
    updated_at = now()
WHERE id = '812632ee-bd11-4d14-b63d-88eff1aa886e';