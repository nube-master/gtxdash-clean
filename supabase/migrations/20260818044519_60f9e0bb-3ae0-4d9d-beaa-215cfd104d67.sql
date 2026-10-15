-- Adicionar colunas para valores em BRL e rastreamento de backfill
ALTER TABLE public.cod_orders 
ADD COLUMN IF NOT EXISTS commission_value_brl NUMERIC,
ADD COLUMN IF NOT EXISTS order_value_brl NUMERIC,
ADD COLUMN IF NOT EXISTS backfilled_at TIMESTAMPTZ;

COMMENT ON COLUMN public.cod_orders.commission_value_brl IS 'Comissão convertida para BRL no momento da ingestão ou backfill';
COMMENT ON COLUMN public.cod_orders.order_value_brl IS 'Valor do pedido convertido para BRL no momento da ingestão ou backfill';
COMMENT ON COLUMN public.cod_orders.backfilled_at IS 'Data/hora em que o registro passou pelo processo de conversão retroativa';