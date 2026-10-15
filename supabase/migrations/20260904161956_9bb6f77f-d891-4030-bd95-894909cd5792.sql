ALTER TABLE public.cod_orders ADD COLUMN IF NOT EXISTS webhook_endpoint_slug TEXT;

CREATE INDEX IF NOT EXISTS idx_cod_orders_webhook_slug
  ON public.cod_orders (webhook_endpoint_slug, created_at DESC)
  WHERE webhook_endpoint_slug IS NOT NULL;