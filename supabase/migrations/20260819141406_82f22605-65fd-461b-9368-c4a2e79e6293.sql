INSERT INTO public.daily_totals_snapshot (
  operation_id,
  date,
  total_spend,
  total_revenue,
  total_conversions,
  roas,
  rt_count,
  rt_revenue_brl,
  usd_to_brl,
  spend_source
)
SELECT
  '8707b3f8-ab41-4a63-902c-9ab97fe50c8a'::uuid,
  '2026-08-19'::date,
  COALESCE((SELECT SUM(spend) FROM public.traffic_data WHERE operation_id = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a' AND date = '2026-08-19'), 0),
  COALESCE((SELECT SUM(payout_brl) FROM public.redtrack_conversions WHERE operation_id = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a' AND track_time::date = '2026-08-19'), 0),
  COALESCE((SELECT COUNT(*) FROM public.redtrack_conversions WHERE operation_id = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a' AND track_time::date = '2026-08-19'), 0),
  CASE
    WHEN COALESCE((SELECT SUM(spend) FROM public.traffic_data WHERE operation_id = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a' AND date = '2026-08-19'), 0) > 0
    THEN COALESCE((SELECT SUM(payout_brl) FROM public.redtrack_conversions WHERE operation_id = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a' AND track_time::date = '2026-08-19'), 0) / (SELECT SUM(spend) FROM public.traffic_data WHERE operation_id = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a' AND date = '2026-08-19')
    ELSE 0
  END,
  COALESCE((SELECT COUNT(*) FROM public.redtrack_conversions WHERE operation_id = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a' AND track_time::date = '2026-08-19'), 0),
  COALESCE((SELECT SUM(payout_brl) FROM public.redtrack_conversions WHERE operation_id = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a' AND track_time::date = '2026-08-19'), 0),
  5.21,
  'meta'
ON CONFLICT (date, (COALESCE(operation_id, '00000000-0000-0000-0000-000000000000'::uuid))) DO UPDATE SET
  total_spend = EXCLUDED.total_spend,
  total_revenue = EXCLUDED.total_revenue,
  total_conversions = EXCLUDED.total_conversions,
  roas = EXCLUDED.roas,
  rt_count = EXCLUDED.rt_count,
  rt_revenue_brl = EXCLUDED.rt_revenue_brl;