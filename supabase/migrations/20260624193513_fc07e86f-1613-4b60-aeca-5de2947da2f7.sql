CREATE TABLE IF NOT EXISTS public.mcp_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  prefix text NOT NULL,
  name text NOT NULL,
  scopes jsonb NOT NULL DEFAULT '["rules:read","rules:write","log:read","groups:read","groups:write","campaigns:write","settings:read"]'::jsonb,
  last_used_at timestamptz,
  expires_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mcp_tokens_hash ON public.mcp_tokens(token_hash);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mcp_tokens TO authenticated;
GRANT ALL ON public.mcp_tokens TO service_role;

ALTER TABLE public.mcp_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_mcp_tokens" ON public.mcp_tokens
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_insert_mcp_tokens" ON public.mcp_tokens
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated_delete_mcp_tokens" ON public.mcp_tokens
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "authenticated_update_mcp_tokens" ON public.mcp_tokens
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);