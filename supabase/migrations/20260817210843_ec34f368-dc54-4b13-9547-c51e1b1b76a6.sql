CREATE TABLE IF NOT EXISTS public.orphan_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  webhook_source TEXT NOT NULL,
  raw_payload JSONB NOT NULL,
  headers JSONB,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_operation_id UUID REFERENCES public.operations(id)
);

CREATE INDEX IF NOT EXISTS idx_orphan_orders_source_created ON public.orphan_orders(webhook_source, created_at);

GRANT INSERT, SELECT ON public.orphan_orders TO authenticated, service_role;
GRANT ALL ON public.orphan_orders TO service_role;
