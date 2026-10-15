WITH rt AS (
  SELECT (conv_time AT TIME ZONE 'America/Sao_Paulo')::date AS d,
         SUM(payout_brl) AS rev, COUNT(*) AS cnt
  FROM redtrack_conversions
  WHERE operation_id='8707b3f8-ab41-4a63-902c-9ab97fe50c8a'
    AND type='Purchase' AND status='approved'
    AND (conv_time AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN '2026-08-14' AND '2026-08-18'
  GROUP BY 1
)
UPDATE daily_totals_snapshot s
SET total_revenue = rt.rev,
    total_conversions = rt.cnt,
    roas = CASE WHEN s.total_spend > 0 THEN rt.rev / s.total_spend ELSE 0 END
FROM rt
WHERE s.operation_id='8707b3f8-ab41-4a63-902c-9ab97fe50c8a' AND s.date = rt.d;