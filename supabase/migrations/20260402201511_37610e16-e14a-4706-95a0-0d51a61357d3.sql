
UPDATE redtrack_events r
SET occurred_at = cb.created_at
FROM clickbank_audit cb
WHERE UPPER(cb.receipt) = UPPER(SUBSTRING(r.redtrack_id FROM 'receipt-(.+)$'))
  AND r.offer_name LIKE '%[MANUAL]%'
  AND ABS(EXTRACT(EPOCH FROM (r.occurred_at - cb.created_at))) > 300;
