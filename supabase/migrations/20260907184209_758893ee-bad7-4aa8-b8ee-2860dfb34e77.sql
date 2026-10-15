ALTER TABLE public.operations
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ NULL;

UPDATE public.operations
SET status = 'suspended'
WHERE lower(status) IN ('suspenso', 'suspensa');

UPDATE public.operations
SET status = 'active'
WHERE lower(status) IN ('ativo', 'ativa');

UPDATE public.operations
SET suspended_at = COALESCE(suspended_at, now())
WHERE status = 'suspended';

UPDATE public.operations SET status = 'suspended', suspended_at = COALESCE(suspended_at, now()) WHERE slug = 'escalify';

ALTER TABLE public.operations
  DROP CONSTRAINT IF EXISTS operations_status_check;

ALTER TABLE public.operations
  ADD CONSTRAINT operations_status_check
  CHECK (status IN ('active','trial','suspended','archived','deleted'));

CREATE TABLE IF NOT EXISTS public.operation_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id UUID NOT NULL REFERENCES public.operations(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  performed_by TEXT NOT NULL,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  note TEXT
);

CREATE INDEX IF NOT EXISTS idx_operation_audit_op ON public.operation_audit(operation_id, performed_at DESC);

GRANT SELECT, INSERT ON public.operation_audit TO authenticated;
GRANT ALL ON public.operation_audit TO service_role;

ALTER TABLE public.operation_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super admins read operation audit" ON public.operation_audit;
CREATE POLICY "super admins read operation audit"
ON public.operation_audit FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.super_admins sa WHERE sa.user_id = auth.uid()));

DROP POLICY IF EXISTS "super admins write operation audit" ON public.operation_audit;
CREATE POLICY "super admins write operation audit"
ON public.operation_audit FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.super_admins sa WHERE sa.user_id = auth.uid()));