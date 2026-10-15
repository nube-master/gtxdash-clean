-- RECONCILIAÇÃO: Mover pedidos GTX que caíram em FAHTO (83 - 32 = 51)
-- 32 pedidos = 27 (visao-italia) + 5 (visao-tcheca)
UPDATE public.cod_orders
SET operation_id = '0b758a2b-1b92-4769-b47b-416c567e320d' -- GTX ID
WHERE operation_id = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a' -- FAHTO ID
  AND (created_at AT TIME ZONE 'America/Sao_Paulo')::date = '2026-08-22'
  AND (
    raw_payload->'afiliado'->>'programa_id' ILIKE '%visao-tcheca%' 
    OR raw_payload->'afiliado'->>'programa_id' ILIKE '%visao-italia%'
  );