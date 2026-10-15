CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid,
  platform text not null,
  endpoint_slug text,
  status_code integer not null,
  outcome text not null,
  reason text,
  detail jsonb,
  headers jsonb,
  created_at timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_op_created ON public.webhook_deliveries(operation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_slug ON public.webhook_deliveries(endpoint_slug, created_at DESC);
GRANT SELECT ON public.webhook_deliveries TO authenticated;
GRANT ALL ON public.webhook_deliveries TO service_role;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read webhook deliveries" ON public.webhook_deliveries FOR SELECT TO authenticated USING (
  operation_id IS NULL OR EXISTS (
    SELECT 1 FROM public.operation_members m WHERE m.operation_id = webhook_deliveries.operation_id AND m.user_id = auth.uid()
  ) OR EXISTS (SELECT 1 FROM public.super_admins s WHERE s.user_id = auth.uid())
);