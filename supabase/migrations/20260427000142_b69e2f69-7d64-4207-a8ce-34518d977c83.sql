-- Limpa alertas gerados com dados Payoneer zerados (antes do fix do FX)
-- Estes serão recriados com valores corretos pelo auto-match
DELETE FROM public.reconciliation_alerts
WHERE status = 'open'
  AND alert_date BETWEEN '2026-04-01' AND '2026-04-25';