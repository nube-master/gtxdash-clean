UPDATE sales_data s
SET utm_campaign = e.sub6
FROM (
  SELECT 'rt:' || regexp_replace(coalesce(transaction_id, clickid, redtrack_id), '^[rtcxi]:', '') AS oid,
         nullif(trim(raw_payload->>'sub6'),'') AS sub6
  FROM redtrack_events
  WHERE operation_id = (SELECT id FROM operations WHERE slug='fahto-media')
    AND occurred_at > now() - interval '7 days'
) e
WHERE s.operation_id = (SELECT id FROM operations WHERE slug='fahto-media')
  AND s.created_at > now() - interval '7 days'
  AND s.utm_campaign LIKE '%|%'
  AND e.sub6 IS NOT NULL
  AND e.sub6 ~ '\[[^\]]+\]'
  AND s.order_id = e.oid;