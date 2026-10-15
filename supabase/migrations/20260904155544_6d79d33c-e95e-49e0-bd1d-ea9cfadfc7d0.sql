CREATE TABLE public.operation_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES public.operations(id) ON DELETE CASCADE,
  platform text NOT NULL,
  endpoint_slug text NOT NULL UNIQUE,
  secret_token text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, platform)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.operation_webhooks TO authenticated;
GRANT ALL ON public.operation_webhooks TO service_role;

ALTER TABLE public.operation_webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members manage their operation webhooks"
ON public.operation_webhooks
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.operation_members m
    WHERE m.operation_id = operation_webhooks.operation_id
      AND m.user_id = auth.uid()
      AND m.status = 'active'
  )
  OR EXISTS (SELECT 1 FROM public.super_admins sa WHERE sa.user_id = auth.uid())
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.operation_members m
    WHERE m.operation_id = operation_webhooks.operation_id
      AND m.user_id = auth.uid()
      AND m.status = 'active'
  )
  OR EXISTS (SELECT 1 FROM public.super_admins sa WHERE sa.user_id = auth.uid())
);

CREATE TRIGGER operation_webhooks_touch
BEFORE UPDATE ON public.operation_webhooks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();