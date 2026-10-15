-- Migration 002: cria tabela daily_card_charges
-- Sprint 1 Reconciliação Financeira — Onda 1
-- ZERO REGRESSÃO: tabela nova isolada, não toca daily_performance, traffic_data, ou qualquer existente

CREATE TABLE IF NOT EXISTS public.daily_card_charges (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identificação
  charge_date              DATE NOT NULL,
  card_provider            TEXT NOT NULL CHECK (card_provider IN ('lot','payoneer','wise','other')),
  card_last_four           TEXT,
  ad_account_id            TEXT,

  -- Descrição original do extrato
  raw_description          TEXT,
  merchant_name            TEXT,

  -- Valores
  amount_usd               NUMERIC(14,4),
  amount_brl               NUMERIC(14,4) NOT NULL,
  fx_rate_charged          NUMERIC(10,6),
  fee_iof_brl              NUMERIC(14,4) DEFAULT 0,
  fee_other_brl            NUMERIC(14,4) DEFAULT 0,

  -- Origem (idempotência)
  source_file_id           UUID,
  source_row_hash          TEXT NOT NULL,

  -- Match contra Meta Ads
  match_status             TEXT NOT NULL DEFAULT 'unmatched'
                             CHECK (match_status IN ('unmatched','auto_matched','manual_matched','disputed','ignored')),
  matched_daily_perf_ids   UUID[] DEFAULT '{}',
  match_confidence         NUMERIC(3,2),
  match_notes              TEXT,

  -- Versionamento (correção de upload)
  superseded_by            UUID REFERENCES public.daily_card_charges(id),

  -- Multi-tenant (padrão do projeto)
  operation_id             UUID,

  -- Auditoria
  created_by               UUID,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Idempotência: mesma linha do mesmo provider não duplica
  CONSTRAINT uq_card_charge_source UNIQUE (card_provider, source_row_hash)
);

CREATE INDEX IF NOT EXISTS idx_card_charges_date
  ON public.daily_card_charges (charge_date DESC);
CREATE INDEX IF NOT EXISTS idx_card_charges_match_status
  ON public.daily_card_charges (match_status, charge_date DESC)
  WHERE match_status IN ('unmatched','disputed');
CREATE INDEX IF NOT EXISTS idx_card_charges_account
  ON public.daily_card_charges (ad_account_id, charge_date DESC);
CREATE INDEX IF NOT EXISTS idx_card_charges_operation
  ON public.daily_card_charges (operation_id);

-- Reusa função genérica que já existe no projeto (update_updated_at_column)
CREATE TRIGGER trg_card_charges_updated
  BEFORE UPDATE ON public.daily_card_charges
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.daily_card_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read daily_card_charges"
  ON public.daily_card_charges FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Service can insert daily_card_charges"
  ON public.daily_card_charges FOR INSERT
  TO public WITH CHECK (true);

CREATE POLICY "Authenticated can update daily_card_charges"
  ON public.daily_card_charges FOR UPDATE
  TO authenticated USING (true);

CREATE POLICY "Admins can delete daily_card_charges"
  ON public.daily_card_charges FOR DELETE
  TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));