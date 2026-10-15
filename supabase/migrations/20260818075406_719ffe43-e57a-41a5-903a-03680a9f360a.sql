INSERT INTO traffic_data (operation_id, account_id, campaign_name, adset_name, ad_name, status, date, spend, impressions, clicks, inline_link_clicks, initiate_checkout, purchase_count)
SELECT '8707b3f8-ab41-4a63-902c-9ab97fe50c8a'::uuid, v.acc, '[SYNC MANUAL] '||v.nome, 'ALL', 'ALL', 'ACTIVE', '2026-08-18'::date,
       ROUND(v.spend_usd * 5.2011, 2), v.imp, v.clk, v.clk, v.ic, v.pur
FROM (VALUES
('act_1246531708323610','HT 278746',117.37,1379,138,2,0),
('act_1678452126568980','HT 232960',1.21,10,0,0,0),
('act_1056576076838554','HT 198904',1.265,7,0,0,0),
('act_1157423260787127','Sharkwares 1185',155.925,1234,96,0,0),
('act_4518416995113290','HT 965450',3033.36,21011,2261,26,5),
('act_914902035011378','HT 918383',1328.415,13110,1317,10,2),
('act_1648237836725143','HT 267270',108.515,3577,200,0,0),
('act_2447877529027535','HT 885886',1.595,15,2,0,0),
('act_992398967122465','HT 274220',715.165,6012,627,6,2),
('act_2001512933899143','HT 616391',0.935,3,1,0,0),
('act_1744662910062100','HT 955154',72.6,1651,100,0,0),
('act_3404569216370409','HT 726439',24.53,578,47,0,0)
) AS v(acc, nome, spend_usd, imp, clk, ic, pur)
ON CONFLICT (date, account_id, campaign_name, adset_name, ad_name) DO UPDATE SET
  spend = EXCLUDED.spend,
  impressions = EXCLUDED.impressions,
  clicks = EXCLUDED.clicks,
  inline_link_clicks = EXCLUDED.inline_link_clicks,
  initiate_checkout = EXCLUDED.initiate_checkout,
  purchase_count = EXCLUDED.purchase_count,
  updated_at = NOW();