CREATE TABLE public.webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL,
  source text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'error', 'orphan', 'duplicate')),
  error_message text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_body text,
  response jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload_hash text NOT NULL,
  external_order_id text,
  value_cents bigint,
  currency text,
  payment_status text,
  customer_email text,
  customer_name text,
  product_name text,
  source_created_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT webhook_logs_source_hash_unique UNIQUE (operation_id, source, payload_hash)
);

GRANT SELECT ON public.webhook_logs TO authenticated;
GRANT ALL ON public.webhook_logs TO service_role;

ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operation members can read webhook logs"
ON public.webhook_logs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.operation_members member
    WHERE member.operation_id = webhook_logs.operation_id
      AND member.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.super_admins admin
    WHERE admin.user_id = auth.uid()
  )
);

CREATE INDEX webhook_logs_operation_received_idx
  ON public.webhook_logs (operation_id, received_at DESC);
CREATE INDEX webhook_logs_source_status_idx
  ON public.webhook_logs (source, status);
CREATE INDEX webhook_logs_operation_source_received_idx
  ON public.webhook_logs (operation_id, source, received_at DESC);