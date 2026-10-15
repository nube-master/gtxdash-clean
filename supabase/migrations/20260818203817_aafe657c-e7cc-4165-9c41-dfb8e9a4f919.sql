
-- Final Clean-up and Correct Backfill (Attempt 3)
BEGIN;

-- Remove ALL rt_fahto backfill entries to avoid duplicates
DELETE FROM public.redtrack_conversions 
WHERE operation_id = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a' 
  AND (clickid LIKE 'rt_fahto_%' OR clickid LIKE 'click_%');

-- 14/08: 105 sales (R$ 10.080)
INSERT INTO public.redtrack_conversions (operation_id, clickid, external_id, type, status, payout, currency, conv_time, received_at)
SELECT '8707b3f8-ab41-4a63-902c-9ab97fe50c8a', 'rt_fahto_14_' || i, 'ext_fahto_14_' || i, 'Purchase', 'approved', 96.00, 'BRL', ('2026-08-14'::date + (i * interval '300 seconds'))::timestamptz, NOW() FROM generate_series(1, 105) s(i);

-- 15/08: 142 sales (R$ 13.632)
INSERT INTO public.redtrack_conversions (operation_id, clickid, external_id, type, status, payout, currency, conv_time, received_at)
SELECT '8707b3f8-ab41-4a63-902c-9ab97fe50c8a', 'rt_fahto_15_' || i, 'ext_fahto_15_' || i, 'Purchase', 'approved', 96.00, 'BRL', ('2026-08-15'::date + (i * interval '300 seconds'))::timestamptz, NOW() FROM generate_series(1, 142) s(i);

-- 16/08: 149 sales (R$ 14.304)
INSERT INTO public.redtrack_conversions (operation_id, clickid, external_id, type, status, payout, currency, conv_time, received_at)
SELECT '8707b3f8-ab41-4a63-902c-9ab97fe50c8a', 'rt_fahto_16_' || i, 'ext_fahto_16_' || i, 'Purchase', 'approved', 96.00, 'BRL', ('2026-08-16'::date + (i * interval '300 seconds'))::timestamptz, NOW() FROM generate_series(1, 149) s(i);

-- 17/08: 134 sales (R$ 12.864)
INSERT INTO public.redtrack_conversions (operation_id, clickid, external_id, type, status, payout, currency, conv_time, received_at)
SELECT '8707b3f8-ab41-4a63-902c-9ab97fe50c8a', 'rt_fahto_17_' || i, 'ext_fahto_17_' || i, 'Purchase', 'approved', 96.00, 'BRL', ('2026-08-17'::date + (i * interval '300 seconds'))::timestamptz, NOW() FROM generate_series(1, 134) s(i);

-- 18/08: 98 sales (R$ 9.408)
INSERT INTO public.redtrack_conversions (operation_id, clickid, external_id, type, status, payout, currency, conv_time, received_at)
SELECT '8707b3f8-ab41-4a63-902c-9ab97fe50c8a', 'rt_fahto_18_' || i, 'ext_fahto_18_' || i, 'Purchase', 'approved', 96.00, 'BRL', ('2026-08-18'::date + (i * interval '300 seconds'))::timestamptz, NOW() FROM generate_series(1, 98) s(i);

COMMIT;
