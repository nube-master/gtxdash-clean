INSERT INTO traffic_data (operation_id, account_id, date, spend, impressions, clicks, campaign_name, adset_name, ad_name) VALUES
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_1246531708323610','2026-08-19',2762.1,25723,2655, '[TOTAL]', '[TOTAL]', '[TOTAL]'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_1678452126568980','2026-08-19',0.99,9,1, '[TOTAL]', '[TOTAL]', '[TOTAL]'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_1056576076838554','2026-08-19',0.495,3,1, '[TOTAL]', '[TOTAL]', '[TOTAL]'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_1300776715534571','2026-08-19',1100.935,7861,778, '[TOTAL]', '[TOTAL]', '[TOTAL]'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_1157423260787127','2026-08-19',3548.27,32400,2632, '[TOTAL]', '[TOTAL]', '[TOTAL]'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_4518416995113290','2026-08-19',2852.355,21782,2038, '[TOTAL]', '[TOTAL]', '[TOTAL]'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_914902035011378','2026-08-19',3576.87,33395,3239, '[TOTAL]', '[TOTAL]', '[TOTAL]'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_1648237836725143','2026-08-19',387.31,9296,583, '[TOTAL]', '[TOTAL]', '[TOTAL]'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_2447877529027535','2026-08-19',1.705,25,1, '[TOTAL]', '[TOTAL]', '[TOTAL]'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_992398967122465','2026-08-19',652.52,5631,521, '[TOTAL]', '[TOTAL]', '[TOTAL]'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_2001512933899143','2026-08-19',3.135,10,3, '[TOTAL]', '[TOTAL]', '[TOTAL]')
ON CONFLICT (date, account_id, campaign_name, adset_name, ad_name) DO UPDATE SET 
  spend=EXCLUDED.spend, impressions=EXCLUDED.impressions, 
  clicks=EXCLUDED.clicks, 
  updated_at=NOW();

-- Reprocess snapshot
DO $$
DECLARE
  v_op_id uuid := '8707b3f8-ab41-4a63-902c-9ab97fe50c8a';
  v_date date := '2026-08-19';
  v_revenue_brl numeric;
  v_spend_brl numeric;
  v_fx numeric := 5.21;
BEGIN
  SELECT COALESCE(SUM(payout_brl), 0) INTO v_revenue_brl
  FROM public.redtrack_conversions
  WHERE operation_id = v_op_id AND date(track_time AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo') = v_date;

  SELECT COALESCE(SUM(spend * v_fx), 0) INTO v_spend_brl
  FROM public.traffic_data
  WHERE operation_id = v_op_id AND date = v_date;

  INSERT INTO public.daily_totals_snapshot (operation_id, date, total_revenue, total_spend, roas, updated_at)
  VALUES (v_op_id, v_date, v_revenue_brl, v_spend_brl, 
          CASE WHEN v_spend_brl > 0 THEN v_revenue_brl / v_spend_brl ELSE 0 END, 
          NOW())
  ON CONFLICT (operation_id, date) DO UPDATE SET
    total_revenue = EXCLUDED.total_revenue,
    total_spend = EXCLUDED.total_spend,
    roas = EXCLUDED.roas,
    updated_at = NOW();
END $$;
