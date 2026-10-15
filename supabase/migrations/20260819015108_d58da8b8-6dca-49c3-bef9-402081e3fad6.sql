WITH sp AS (
  SELECT date d, SUM(spend) spend, SUM(impressions) imp
  FROM traffic_data
  WHERE operation_id='8707b3f8-ab41-4a63-902c-9ab97fe50c8a'
    AND date BETWEEN '2026-08-14' AND '2026-08-15'
  GROUP BY 1
)
UPDATE daily_totals_snapshot s
SET total_spend = sp.spend,
    total_impressions = GREATEST(COALESCE(s.total_impressions,0), sp.imp),
    roas = CASE WHEN sp.spend > 0 THEN s.total_revenue / sp.spend ELSE 0 END
FROM sp
WHERE s.operation_id='8707b3f8-ab41-4a63-902c-9ab97fe50c8a' AND s.date = sp.d;