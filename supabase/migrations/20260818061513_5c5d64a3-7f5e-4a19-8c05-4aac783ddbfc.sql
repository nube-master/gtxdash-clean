
UPDATE cod_orders
SET created_at = (raw_payload->'pedido'->>'criado_em')::timestamptz
WHERE operation_id = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a'
  AND (raw_payload->'pedido'->>'criado_em') IS NOT NULL
  AND created_at::date != (raw_payload->'pedido'->>'criado_em')::date;
