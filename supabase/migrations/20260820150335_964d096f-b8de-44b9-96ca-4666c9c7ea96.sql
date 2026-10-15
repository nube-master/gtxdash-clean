-- Deduplicação profunda em traffic_data FAHTO (14-19/08)
WITH dupes AS (
  SELECT ctid, ROW_NUMBER() OVER (
    PARTITION BY operation_id, account_id, date
    ORDER BY updated_at DESC NULLS LAST
  ) AS rn
  FROM traffic_data
  WHERE operation_id = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a'
    AND date BETWEEN '2026-08-14' AND '2026-08-19'
)
DELETE FROM traffic_data td
USING dupes d WHERE td.ctid = d.ctid AND d.rn > 1;

-- Limpar snapshots afetados para forçar recálculo
DELETE FROM daily_totals_snapshot
WHERE operation_id = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a'
  AND date BETWEEN '2026-08-14' AND '2026-08-19';