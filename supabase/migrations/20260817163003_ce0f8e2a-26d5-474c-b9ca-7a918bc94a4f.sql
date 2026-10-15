-- Backfill FAHTO 01-15/08 (Batch 3: Adding act_1056576076838554)
BEGIN;
INSERT INTO traffic_data (operation_id, account_id, campaign_name, adset_name, ad_name, date, spend, impressions, clicks, initiate_checkout, purchase_count)
SELECT '8707b3f8-ab41-4a63-902c-9ab97fe50c8a', account_id, account_name, 'Backfill', 'Backfill', date::date, spend, impressions, clicks, ic, purchases
FROM (
  VALUES
    ('act_1056576076838554','HT 198904','2026-08-05',171.3250,1083,364,0,0),
    ('act_1056576076838554','HT 198904','2026-08-06',168.9050,1193,371,0,0),
    ('act_1056576076838554','HT 198904','2026-08-07',155.8150,1058,278,0,0),
    ('act_1056576076838554','HT 198904','2026-08-08',231.9350,1308,337,0,0),
    ('act_1056576076838554','HT 198904','2026-08-09',181.5550,1124,253,0,0),
    ('act_1056576076838554','HT 198904','2026-08-10',117.8650,671,160,0,0),
    ('act_1056576076838554','HT 198904','2026-08-11',174.8450,984,216,0,0),
    ('act_1056576076838554','HT 198904','2026-08-12',162.7450,963,193,0,0),
    ('act_1056576076838554','HT 198904','2026-08-13',92.8950,502,114,0,0),
    ('act_1056576076838554','HT 198904','2026-08-14',9.0200,67,7,0,0),
    ('act_1056576076838554','HT 198904','2026-08-15',3.7400,44,5,0,0)
) as t(account_id, account_name, date, spend, impressions, clicks, ic, purchases)
ON CONFLICT (date, account_id, campaign_name, adset_name, ad_name) DO UPDATE SET
  spend = EXCLUDED.spend,
  impressions = EXCLUDED.impressions,
  clicks = EXCLUDED.clicks,
  initiate_checkout = EXCLUDED.initiate_checkout,
  purchase_count = EXCLUDED.purchase_count,
  updated_at = NOW();
COMMIT;
SELECT COUNT(*) FROM traffic_data WHERE operation_id = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a' AND date BETWEEN '2026-08-01' AND '2026-08-15';