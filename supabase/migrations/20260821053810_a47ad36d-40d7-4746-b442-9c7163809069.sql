BEGIN;
UPDATE traffic_data t
SET spend = ROUND((t.spend / 5.17)::numeric, 4)
FROM meta_ad_accounts a
WHERE t.account_id = a.account_id
  AND a.currency = 'USD'
  AND t.updated_at >= '2026-08-21 00:00:00+00'
  AND t.date IN ('2026-08-20', '2026-08-21');

DELETE FROM daily_totals_snapshot
WHERE date >= '2026-08-20';
COMMIT;