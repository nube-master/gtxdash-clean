
ALTER TABLE public.campaign_pacing_overrides
  ADD COLUMN IF NOT EXISTS rules_exempt boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hourly_cap_brl_override numeric,
  ADD COLUMN IF NOT EXISTS exempt_until timestamptz;

-- Permitir que daily_target_brl seja opcional caso o usuário só queira marcar exceção sem fixar teto diário.
ALTER TABLE public.campaign_pacing_overrides
  ALTER COLUMN daily_target_brl DROP NOT NULL;
