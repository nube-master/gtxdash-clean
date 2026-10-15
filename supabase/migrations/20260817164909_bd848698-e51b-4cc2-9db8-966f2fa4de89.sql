BEGIN;

INSERT INTO public.meta_ad_accounts (account_id, account_name, operation_id, currency, is_active)
VALUES
('act_992398967122465','HT 274220','8707b3f8-ab41-4a63-902c-9ab97fe50c8a','USD',true),
('act_1064270952620022','HT 123439','8707b3f8-ab41-4a63-902c-9ab97fe50c8a','USD',true),
('act_1648237836725143','HT 267270','8707b3f8-ab41-4a63-902c-9ab97fe50c8a','USD',true),
('act_2447877529027535','HT 885886','8707b3f8-ab41-4a63-902c-9ab97fe50c8a','USD',true),
('act_2001512933899143','HT 616391','8707b3f8-ab41-4a63-902c-9ab97fe50c8a','USD',true),
('act_1744662910062100','HT 955154','8707b3f8-ab41-4a63-902c-9ab97fe50c8a','USD',true),
('act_3404569216370409','HT 726439','8707b3f8-ab41-4a63-902c-9ab97fe50c8a','USD',true)
ON CONFLICT (account_id) DO UPDATE SET
  operation_id = EXCLUDED.operation_id,
  account_name = EXCLUDED.account_name,
  is_active = true;

INSERT INTO public.traffic_data (operation_id, account_id, date, spend, impressions, clicks, initiate_checkout, purchase_count, campaign_name, adset_name, ad_name)
VALUES
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_1064270952620022','2026-08-04',37.2350,117,34,0,0,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_1064270952620022','2026-08-05',43.7250,192,28,0,0,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_1064270952620022','2026-08-09',23.1550,346,43,0,0,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_1064270952620022','2026-08-10',0.7150,22,4,0,0,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_1064270952620022','2026-08-11',0.1100,7,0,0,0,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_1064270952620022','2026-08-12',0.3300,12,2,0,0,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_1064270952620022','2026-08-14',0.0550,4,0,0,0,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_1648237836725143','2026-08-04',51.5900,238,47,0,0,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_1648237836725143','2026-08-05',55.4400,286,33,0,0,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_1648237836725143','2026-08-15',924.0000,6449,658,0,0,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_2447877529027535','2026-08-05',33.3850,329,51,0,0,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_2447877529027535','2026-08-06',244.4750,2019,261,0,0,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_2447877529027535','2026-08-07',271.1500,2440,293,0,0,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_2447877529027535','2026-08-08',292.1600,3323,308,0,0,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_2447877529027535','2026-08-09',209.8800,2419,189,0,0,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_2447877529027535','2026-08-10',188.8700,2092,161,0,0,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_2447877529027535','2026-08-11',217.0850,2403,215,0,0,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_2447877529027535','2026-08-12',165.3300,1597,175,0,0,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_2447877529027535','2026-08-13',129.0850,1272,143,0,0,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_2447877529027535','2026-08-14',6.5450,73,7,0,0,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_2447877529027535','2026-08-15',3.6300,48,4,0,0,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_992398967122465','2026-08-04',11.7700,56,19,0,0,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_992398967122465','2026-08-05',136.7300,588,205,0,0,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_992398967122465','2026-08-06',1469.2150,11894,1502,12,16,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_992398967122465','2026-08-07',1489.7850,8602,1031,18,26,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_992398967122465','2026-08-08',2093.6300,11006,1436,18,16,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_992398967122465','2026-08-09',2318.1400,12284,1591,12,12,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_992398967122465','2026-08-10',1036.8600,6546,767,6,12,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_992398967122465','2026-08-11',2647.7550,16271,1758,14,18,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_992398967122465','2026-08-12',3400.7600,16885,1817,15,22,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_992398967122465','2026-08-13',3096.5550,18262,2086,27,22,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_992398967122465','2026-08-14',1890.2400,12170,1327,13,10,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_992398967122465','2026-08-15',2403.7750,16458,1651,21,18,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_2001512933899143','2026-08-05',102.1350,628,159,0,0,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_2001512933899143','2026-08-06',247.3900,2164,293,0,0,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_2001512933899143','2026-08-07',190.9600,964,164,0,0,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_2001512933899143','2026-08-08',301.6200,826,177,0,0,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_2001512933899143','2026-08-09',190.3000,538,108,0,0,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_2001512933899143','2026-08-10',165.9350,509,98,0,0,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_2001512933899143','2026-08-11',203.8850,620,147,0,0,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_2001512933899143','2026-08-12',147.3450,368,67,0,0,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_2001512933899143','2026-08-13',65.3950,166,44,0,0,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_2001512933899143','2026-08-14',6.6550,31,4,0,0,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_2001512933899143','2026-08-15',4.7300,34,0,0,0,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_1744662910062100','2026-08-04',35.8600,250,33,0,0,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_1744662910062100','2026-08-05',2206.0500,28999,2440,0,0,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_1744662910062100','2026-08-06',2227.7200,19999,2340,0,0,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_1744662910062100','2026-08-07',394.0750,3040,391,0,0,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_1744662910062100','2026-08-08',1098.1300,17199,2159,0,0,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_1744662910062100','2026-08-09',1701.7550,23564,2834,0,0,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_1744662910062100','2026-08-10',1017.9400,30357,2260,0,0,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_1744662910062100','2026-08-11',1659.4600,68741,5154,0,0,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_1744662910062100','2026-08-12',1240.7450,34861,3397,0,0,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_1744662910062100','2026-08-15',813.9450,4341,430,0,0,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_3404569216370409','2026-08-04',75.6800,405,150,0,0,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_3404569216370409','2026-08-05',58.7400,298,105,0,0,'Backfill','Backfill','Backfill'),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_3404569216370409','2026-08-15',1093.2900,8043,892,0,0,'Backfill','Backfill','Backfill')
ON CONFLICT (date, account_id, campaign_name, adset_name, ad_name) DO UPDATE SET
  spend = EXCLUDED.spend,
  impressions = EXCLUDED.impressions,
  clicks = EXCLUDED.clicks,
  initiate_checkout = EXCLUDED.initiate_checkout,
  purchase_count = EXCLUDED.purchase_count,
  updated_at = NOW();

COMMIT;

SELECT SUM(spend) as total_brl, COUNT(*) as total_rows, COUNT(DISTINCT account_id) as total_contas
FROM public.traffic_data
WHERE operation_id = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a'
  AND date BETWEEN '2026-08-01' AND '2026-08-15';