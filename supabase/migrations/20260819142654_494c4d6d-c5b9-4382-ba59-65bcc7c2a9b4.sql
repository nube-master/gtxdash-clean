
-- Reset sync offset to process all accounts
UPDATE public.app_settings 
SET value = '0'::jsonb 
WHERE key = 'sync_meta_batch_offset';

-- Force recalculation of FAHTO snapshot for 19/08 using 'spend' column
DELETE FROM public.daily_totals_snapshot 
WHERE date = '2026-08-19' 
AND (operation_id = 'c13c0b11-2b02-4d56-a36c-2f3b9a52882c' OR operation_id IS NULL);

INSERT INTO public.daily_totals_snapshot (date, operation_id, total_spend, total_revenue, roas)
SELECT 
    '2026-08-19'::date, 
    'c13c0b11-2b02-4d56-a36c-2f3b9a52882c'::uuid,
    COALESCE(SUM(spend), 0),
    (
        SELECT COALESCE(SUM(payout_brl), 0) 
        FROM public.redtrack_conversions 
        WHERE (track_time AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date = '2026-08-19' 
        AND operation_id = 'c13c0b11-2b02-4d56-a36c-2f3b9a52882c'
    ),
    CASE 
        WHEN COALESCE(SUM(spend), 0) > 0 THEN 
            (
                SELECT COALESCE(SUM(payout_brl), 0) 
                FROM public.redtrack_conversions 
                WHERE (track_time AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date = '2026-08-19' 
                AND operation_id = 'c13c0b11-2b02-4d56-a36c-2f3b9a52882c'
            ) / SUM(spend) 
        ELSE 0 
    END
FROM public.traffic_data 
WHERE date = '2026-08-19' 
AND operation_id = 'c13c0b11-2b02-4d56-a36c-2f3b9a52882c'
GROUP BY date, operation_id;
