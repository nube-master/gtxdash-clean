-- Backfill meta_spend_realtime_safe
UPDATE public.meta_spend_realtime_safe r
SET operation_id = a.operation_id
FROM public.meta_ad_accounts a
WHERE r.account_id = a.account_id
  AND a.operation_id IS NOT NULL
  AND r.operation_id IS NULL;

-- Backfill meta_campaign_status
UPDATE public.meta_campaign_status c
SET operation_id = a.operation_id
FROM public.meta_ad_accounts a
WHERE c.account_id = a.account_id
  AND a.operation_id IS NOT NULL
  AND c.operation_id IS NULL;

-- Backfill redtrack_events (match via account from utm or just assign the single operation)
UPDATE public.redtrack_events
SET operation_id = '0b758a2b-1b92-4769-b47b-416c567e320d'
WHERE operation_id IS NULL
  AND occurred_at >= '2026-04-01';

-- Backfill integration_logs
UPDATE public.integration_logs
SET operation_id = '0b758a2b-1b92-4769-b47b-416c567e320d'
WHERE operation_id IS NULL
  AND created_at >= '2026-04-01';