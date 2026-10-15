-- 1. LIMPEZA ÓRFÃOS DUPLICADOS
DELETE FROM public.orphan_orders 
WHERE (raw_payload->>'order_id') IN ('20674', '20679', '20681')
   OR (raw_payload->>'id') IN ('20674', '20679', '20681');

-- 2. REMOVER TEST HEALTHCHECK
DELETE FROM public.cod_orders WHERE external_order_id LIKE '%TEST%';