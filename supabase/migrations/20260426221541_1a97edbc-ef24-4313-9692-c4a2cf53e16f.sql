-- =====================================================
-- Migration 004: fee_mapping
-- Sprint 1 Reconciliação Financeira - Onda 1
-- ZERO REGRESSÃO: tabela nova e isolada
-- =====================================================

CREATE TABLE public.fee_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identificação da taxa
  fee_code TEXT NOT NULL,
  fee_name TEXT NOT NULL,
  fee_category TEXT NOT NULL,
  
  -- Aplicabilidade
  card_provider TEXT,
  applies_to TEXT NOT NULL DEFAULT 'all',
  
  -- Cálculo da taxa
  fee_type TEXT NOT NULL,
  fee_value NUMERIC(10,6) NOT NULL,
  
  -- Vigência
  valid_from DATE NOT NULL DEFAULT '2020-01-01',
  valid_until DATE,
  
  -- Controle
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT DEFAULT '',
  operation_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT chk_fee_type CHECK (fee_type IN ('percentage', 'fixed_brl', 'fixed_usd')),
  CONSTRAINT chk_fee_category CHECK (fee_category IN ('tax', 'fx_spread', 'platform_fee', 'card_fee', 'meta_tax', 'other')),
  CONSTRAINT chk_applies_to CHECK (applies_to IN ('all', 'usd_charges', 'brl_charges', 'meta_only', 'usd_to_usd')),
  CONSTRAINT uq_fee_code UNIQUE (fee_code)
);

-- Índices
CREATE INDEX idx_fee_mapping_active 
  ON public.fee_mapping(is_active, card_provider) 
  WHERE is_active = true;

CREATE INDEX idx_fee_mapping_validity 
  ON public.fee_mapping(valid_from, valid_until);

-- Trigger updated_at
CREATE TRIGGER update_fee_mapping_updated_at
  BEFORE UPDATE ON public.fee_mapping
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- RLS
-- =====================================================
ALTER TABLE public.fee_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read fee_mapping"
  ON public.fee_mapping FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins can insert fee_mapping"
  ON public.fee_mapping FOR INSERT
  TO authenticated 
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update fee_mapping"
  ON public.fee_mapping FOR UPDATE
  TO authenticated 
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete fee_mapping"
  ON public.fee_mapping FOR DELETE
  TO authenticated 
  USING (has_role(auth.uid(), 'admin'::app_role));

-- =====================================================
-- SEED: taxas conhecidas iniciais
-- =====================================================
INSERT INTO public.fee_mapping 
  (fee_code, fee_name, fee_category, card_provider, applies_to, fee_type, fee_value, valid_from, valid_until, notes) 
VALUES
  -- IOF
  ('iof_internacional_2024', 'IOF Internacional (3,38%)', 'tax', NULL, 'usd_charges', 'percentage', 3.38, '2024-04-01', NULL, 
    'IOF reduzido vigente desde abril/2024. Aplicado em cobranças BRL->USD.'),
  
  ('iof_internacional_legado', 'IOF Internacional (6,38%)', 'tax', NULL, 'usd_charges', 'percentage', 6.38, '2020-01-01', '2024-03-31',
    'IOF antigo - vigente até 31/03/2024.'),
  
  ('iof_zero_usd_to_usd', 'IOF Zero (USD->USD)', 'tax', NULL, 'usd_to_usd', 'percentage', 0.00, '2020-01-01', NULL,
    'Cobrancas de conta USD para conta de pagamento USD nao tem IOF.'),
  
  -- Imposto Meta (apenas BRL)
  ('meta_tax_br', 'Imposto Meta Brasil (12,15%)', 'meta_tax', NULL, 'brl_charges', 'percentage', 12.15, '2020-01-01', NULL,
    'CIDE + PIS/COFINS embutidos no faturamento Meta. Aplica APENAS em contas BRL.'),
  
  -- Lot
  ('lot_fx_spread', 'Spread Cambial Lot (~2%)', 'fx_spread', 'lot', 'usd_charges', 'percentage', 2.00, '2020-01-01', NULL,
    'Spread sobre PTAX cobrado pela Lot. Valor estimado - ajustar conforme contrato.'),
  
  ('lot_conversion_fee', 'Taxa de Conversao Lot', 'platform_fee', 'lot', 'usd_charges', 'percentage', 0.00, '2020-01-01', NULL,
    'Placeholder - ajustar conforme contrato vigente.'),
  
  -- Payoneer
  ('payoneer_fx_spread', 'Spread Cambial Payoneer (~3%)', 'fx_spread', 'payoneer', 'usd_charges', 'percentage', 3.00, '2020-01-01', NULL,
    'Spread sobre PTAX cobrado pela Payoneer. Valor estimado.'),
  
  ('payoneer_card_fee', 'Taxa Cartao Payoneer (1,5%)', 'card_fee', 'payoneer', 'all', 'percentage', 1.50, '2020-01-01', NULL,
    'Taxa de uso do cartao Payoneer.'),
  
  -- Wise (preparação para futuro)
  ('wise_fx_spread', 'Spread Cambial Wise (~0,5%)', 'fx_spread', 'wise', 'usd_charges', 'percentage', 0.50, '2020-01-01', NULL,
    'Wise tem spread baixo comparado a outros provedores.')
ON CONFLICT (fee_code) DO NOTHING;

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON TABLE public.fee_mapping IS 
  'Catalogo de taxas/impostos/spreads para reconciliacao financeira. Sprint 1 - Onda 1.';

COMMENT ON COLUMN public.fee_mapping.fee_code IS 
  'Identificador unico da taxa - usado no codigo da reconciliacao.';

COMMENT ON COLUMN public.fee_mapping.applies_to IS 
  'Onde a taxa se aplica: all, usd_charges (BRL->USD), brl_charges, meta_only, usd_to_usd (sem IOF).';

COMMENT ON COLUMN public.fee_mapping.fee_type IS 
  'Tipo de calculo: percentage (% sobre valor), fixed_brl, fixed_usd.';

COMMENT ON COLUMN public.fee_mapping.valid_until IS 
  'NULL = vigente. Permite manter historico de taxas que mudaram ao longo do tempo.';