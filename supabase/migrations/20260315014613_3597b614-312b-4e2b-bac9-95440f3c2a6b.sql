-- Clean up manual reconciliation entries for March 14 only to re-create with correct project attribution
DELETE FROM redtrack_events
WHERE event_type = 'purchase'
AND offer_name ILIKE '%MANUAL%'
AND occurred_at >= '2026-03-14T03:00:00Z'
AND occurred_at < '2026-03-15T03:00:00Z';