-- Tabela de projetos/funis com regras de identificação e metas
CREATE TABLE IF NOT EXISTS public.funnel_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid,
  code text NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  -- Regras de identificação
  offer_name_patterns text[] NOT NULL DEFAULT '{}'::text[],   -- ex: ['telemed']
  campaign_name_patterns text[] NOT NULL DEFAULT '{}'::text[],-- ex: ['[PP]']
  account_ids text[] NOT NULL DEFAULT '{}'::text[],           -- IDs Meta opcionais
  -- Configuração financeira
  spend_source text NOT NULL DEFAULT 'meta',                  -- meta | redtrack | manual
  revenue_source text NOT NULL DEFAULT 'redtrack',            -- redtrack | clickbank | manual
  ticket_usd numeric NOT NULL DEFAULT 0,                      -- referência (ex: 97)
  commission_usd numeric NOT NULL DEFAULT 0,                  -- referência (ex: 240)
  -- Metas
  target_roas numeric NOT NULL DEFAULT 0,                     -- ex: 2.0
  target_cpa_usd numeric NOT NULL DEFAULT 0,                  -- ex: 170
  target_daily_revenue_brl numeric NOT NULL DEFAULT 0,        -- ex: 50000
  target_margin_pct numeric NOT NULL DEFAULT 0,               -- ex: 30
  -- UI
  color text NOT NULL DEFAULT '#06B6D4',
  icon text NOT NULL DEFAULT 'Stethoscope',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(operation_id, code)
);

ALTER TABLE public.funnel_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read funnel_projects"
  ON public.funnel_projects FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert funnel_projects"
  ON public.funnel_projects FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update funnel_projects"
  ON public.funnel_projects FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete funnel_projects"
  ON public.funnel_projects FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_funnel_projects_updated_at
  BEFORE UPDATE ON public.funnel_projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed do projeto TeleMed (PP)
INSERT INTO public.funnel_projects (
  code, name, offer_name_patterns, campaign_name_patterns,
  ticket_usd, commission_usd,
  target_roas, target_cpa_usd, target_daily_revenue_brl, target_margin_pct,
  color, icon, notes
) VALUES (
  'PP', 'TeleMed',
  ARRAY['telemed'],
  ARRAY['[PP]'],
  97, 240,
  2.0, 170, 50000, 30,
  '#06B6D4', 'Stethoscope',
  'Funil TeleMed — spend identificado por tag [PP] na campanha Meta; vendas pela RedTrack offer contendo "telemed".'
) ON CONFLICT (operation_id, code) DO NOTHING;