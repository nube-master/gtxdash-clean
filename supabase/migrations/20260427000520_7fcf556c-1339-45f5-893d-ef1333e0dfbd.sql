DELETE FROM public.reconciliation_alerts
WHERE status = 'open'
  AND alert_date BETWEEN '2026-04-01' AND '2026-04-25';