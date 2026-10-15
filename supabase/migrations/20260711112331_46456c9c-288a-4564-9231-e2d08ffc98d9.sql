
CREATE TABLE IF NOT EXISTS public.meta_token_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id text NOT NULL UNIQUE,
  account_name text,
  can_manage boolean NOT NULL DEFAULT false,
  can_read boolean NOT NULL DEFAULT false,
  tokens_with_manage int NOT NULL DEFAULT 0,
  tokens_with_read int NOT NULL DEFAULT 0,
  tokens_total_tested int NOT NULL DEFAULT 0,
  tasks_by_token jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_error text,
  checked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.meta_token_permissions TO authenticated;
GRANT ALL ON public.meta_token_permissions TO service_role;

ALTER TABLE public.meta_token_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can read meta_token_permissions"
  ON public.meta_token_permissions FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_meta_token_permissions_account ON public.meta_token_permissions(account_id);
CREATE INDEX IF NOT EXISTS idx_meta_token_permissions_can_manage ON public.meta_token_permissions(can_manage);

-- Cron a cada 30min para revalidar
SELECT cron.unschedule('validate-meta-tokens-30min') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'validate-meta-tokens-30min'
);

SELECT cron.schedule(
  'validate-meta-tokens-30min',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url:='https://taeduxiandktefcwgspx.supabase.co/functions/v1/validate-meta-tokens',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer REDACTED_JWT"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id;
  $$
);
