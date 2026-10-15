-- Tabela de overrides para corrigir atribuição de copy/editor de criativos
-- sem alterar dados brutos do Meta Ads. Aplicada na leitura.
CREATE TABLE public.creative_team_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid REFERENCES public.operations(id) ON DELETE CASCADE,
  
  -- Match: por creative_id (obrigatório) + opcionalmente campaign_id para granularidade
  creative_id text NOT NULL,             -- ex: "H02AD06"
  campaign_id text,                       -- opcional: se preenchido, override só vale pra essa campanha Meta
  
  -- Override values (NULL = não sobrescreve aquele campo)
  override_copy_writer text,              -- ex: "Ian" (nome final, não tag)
  override_editor text,                   -- ex: "Iza"
  
  -- Auditoria
  reason text NOT NULL DEFAULT '',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT creative_team_overrides_unique UNIQUE (operation_id, creative_id, campaign_id)
);

CREATE INDEX idx_creative_team_overrides_lookup 
  ON public.creative_team_overrides (operation_id, creative_id);

ALTER TABLE public.creative_team_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read creative_team_overrides"
  ON public.creative_team_overrides FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins can insert creative_team_overrides"
  ON public.creative_team_overrides FOR INSERT
  TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update creative_team_overrides"
  ON public.creative_team_overrides FOR UPDATE
  TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete creative_team_overrides"
  ON public.creative_team_overrides FOR DELETE
  TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_creative_team_overrides_updated_at
  BEFORE UPDATE ON public.creative_team_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();