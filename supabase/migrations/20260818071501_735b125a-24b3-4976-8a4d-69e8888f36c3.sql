DELETE FROM orphan_orders 
WHERE webhook_source = 'cod-webhook-shphere' 
  AND reason = 'operation_id_not_resolved_at_all';