-- Backfill: recalcula total_spend dos últimos 60 dias usando get_spend_normalized_sp
WITH recalculated AS (
  SELECT 
    s.id,
    s.date,
    COALESCE((SELECT SUM(total_spend) FROM get_spend_normalized_sp(s.date, s.date)), 0) AS new_spend,
    s.total_revenue,
    s.total_conversions
  FROM daily_totals_snapshot s
  WHERE s.spend_source = 'hybrid_normalized_sp'
    AND s.date >= (CURRENT_DATE - INTERVAL '60 days')::date
)
UPDATE daily_totals_snapshot d
SET 
  total_spend = r.new_spend,
  roas = CASE WHEN r.new_spend > 0 THEN r.total_revenue / r.new_spend ELSE 0 END,
  cac = CASE WHEN r.total_conversions > 0 THEN r.new_spend / r.total_conversions ELSE 0 END,
  lucro_bruto = r.total_revenue - r.new_spend
FROM recalculated r
WHERE d.id = r.id
  AND ABS(d.total_spend - r.new_spend) > 0.01; -- só atualiza se mudou de fato

-- Replica para o snapshot 'operation_normalized_sp' (espelho por operação)
WITH recalculated AS (
  SELECT 
    s.id,
    s.date,
    s.operation_id,
    COALESCE((SELECT SUM(total_spend) FROM get_spend_normalized_sp(s.date, s.date, s.operation_id)), 0) AS new_spend,
    s.total_revenue,
    s.total_conversions
  FROM daily_totals_snapshot s
  WHERE s.spend_source = 'operation_normalized_sp'
    AND s.date >= (CURRENT_DATE - INTERVAL '60 days')::date
    AND s.operation_id IS NOT NULL
)
UPDATE daily_totals_snapshot d
SET 
  total_spend = r.new_spend,
  roas = CASE WHEN r.new_spend > 0 THEN r.total_revenue / r.new_spend ELSE 0 END,
  cac = CASE WHEN r.total_conversions > 0 THEN r.new_spend / r.total_conversions ELSE 0 END,
  lucro_bruto = r.total_revenue - r.new_spend
FROM recalculated r
WHERE d.id = r.id
  AND ABS(d.total_spend - r.new_spend) > 0.01;