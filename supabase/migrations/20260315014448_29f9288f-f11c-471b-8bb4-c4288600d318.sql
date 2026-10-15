-- Clean up incorrectly attributed manual reconciliation entries for March 2026
-- These will be re-created by the updated reconciler with correct project attribution
DELETE FROM redtrack_events
WHERE event_type = 'purchase'
AND offer_name ILIKE '%MANUAL%'
AND occurred_at >= '2026-03-01T03:00:00Z'
AND occurred_at < '2026-03-16T03:00:00Z';