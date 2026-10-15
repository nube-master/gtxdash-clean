-- 1. Add extra columns to operations
ALTER TABLE public.operations
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS primary_color text,
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'BRL',
  ADD COLUMN IF NOT EXISTS monthly_revenue_goal numeric,
  ADD COLUMN IF NOT EXISTS daily_revenue_goal numeric,
  ADD COLUMN IF NOT EXISTS min_roas numeric,
  ADD COLUMN IF NOT EXISTS max_cpa numeric;

-- 2. Create operation_invites table
CREATE TABLE IF NOT EXISTS public.operation_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES public.operations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'member',
  token text NOT NULL UNIQUE,
  invited_by uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Enable RLS on operation_invites
ALTER TABLE public.operation_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage invites"
  ON public.operation_invites FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated can read own invites"
  ON public.operation_invites FOR SELECT
  TO authenticated
  USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));