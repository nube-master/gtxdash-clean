
-- 1) Adiciona teto diário padrão na regra (usado para campanhas ABO sem CBO)
ALTER TABLE public.pacing_rules
  ADD COLUMN IF NOT EXISTS default_daily_target_brl numeric;

-- 2) Tabela de overrides por campanha
CREATE TABLE IF NOT EXISTS public.campaign_pacing_overrides (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id text NOT NULL,
  account_id text,
  daily_target_brl numeric NOT NULL CHECK (daily_target_brl > 0),
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT campaign_pacing_overrides_campaign_unique UNIQUE (campaign_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_pacing_overrides TO authenticated;
GRANT ALL ON public.campaign_pacing_overrides TO service_role;

ALTER TABLE public.campaign_pacing_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage campaign pacing overrides"
  ON public.campaign_pacing_overrides
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER trg_campaign_pacing_overrides_updated_at
  BEFORE UPDATE ON public.campaign_pacing_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_campaign_pacing_overrides_campaign_id
  ON public.campaign_pacing_overrides (campaign_id);
