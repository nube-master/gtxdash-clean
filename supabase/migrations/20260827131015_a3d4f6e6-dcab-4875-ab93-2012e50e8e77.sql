CREATE TABLE IF NOT EXISTS public.push_send_claims (
  dedupe_key text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_send_claims_created_at_idx ON public.push_send_claims (created_at);

GRANT ALL ON public.push_send_claims TO service_role;

ALTER TABLE public.push_send_claims ENABLE ROW LEVEL SECURITY;