-- Backfill usando as taxas atuais aproximadas (PLN=1.42, RON=1.21, EUR=6.04)
-- Multiplicamos commission_value e order_value e salvamos nas novas colunas *_brl
UPDATE public.cod_orders
SET 
  commission_value_brl = CASE 
    WHEN commission_currency = 'PLN' THEN commission_value * 1.42
    WHEN commission_currency = 'RON' THEN commission_value * 1.21
    WHEN commission_currency = 'EUR' THEN commission_value * 6.04
    ELSE commission_value -- Assume BRL ou mantem cru se desconhecido
  END,
  order_value_brl = CASE 
    WHEN commission_currency = 'PLN' THEN order_value * 1.42
    WHEN commission_currency = 'RON' THEN order_value * 1.21
    WHEN commission_currency = 'EUR' THEN order_value * 6.04
    ELSE order_value
  END,
  backfilled_at = NOW()
WHERE operation_id = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a'
  AND backfilled_at IS NULL;

-- Verifica resultados do backfill
SELECT 
  commission_currency, 
  SUM(commission_value) as original_sum, 
  SUM(commission_value_brl) as brl_sum,
  COUNT(*)
FROM public.cod_orders
WHERE operation_id = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a'
GROUP BY 1;