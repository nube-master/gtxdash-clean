-- =====================================================
-- Migration 003: exchange_rates_daily
-- Sprint 1 Reconciliação Financeira - Onda 1
-- ZERO REGRESSÃO: tabela nova e isolada
-- =====================================================

CREATE TABLE public.exchange_rates_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_date DATE NOT NULL,
  currency_from TEXT NOT NULL DEFAULT 'USD',
  currency_to TEXT NOT NULL DEFAULT 'BRL',
  
  -- Cotações do dia
  rate_buy NUMERIC(10,6),
  rate_sell NUMERIC(10,6),
  rate_avg NUMERIC(10,6) NOT NULL,
  
  -- Metadata da fonte
  source TEXT NOT NULL DEFAULT 'bcb_ptax',
  source_payload JSONB,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Multi-tenancy + auditoria
  operation_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Garantia: 1 cotação por (data + par de moedas + fonte)
  CONSTRAINT uq_exchange_rate_daily UNIQUE (rate_date, currency_from, currency_to, source)
);

-- Índices para queries frequentes
CREATE INDEX idx_exchange_rates_daily_date 
  ON public.exchange_rates_daily(rate_date DESC);

CREATE INDEX idx_exchange_rates_daily_pair_date 
  ON public.exchange_rates_daily(currency_from, currency_to, rate_date DESC);

-- Trigger updated_at (reusa função existente)
CREATE TRIGGER update_exchange_rates_daily_updated_at
  BEFORE UPDATE ON public.exchange_rates_daily
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- RLS
-- =====================================================
ALTER TABLE public.exchange_rates_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read exchange_rates_daily"
  ON public.exchange_rates_daily FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service can insert exchange_rates_daily"
  ON public.exchange_rates_daily FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Service can update exchange_rates_daily"
  ON public.exchange_rates_daily FOR UPDATE
  TO public
  USING (true);

CREATE POLICY "Admins can delete exchange_rates_daily"
  ON public.exchange_rates_daily FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- =====================================================
-- BACKFILL: importar histórico de exchange_rate_log
-- =====================================================
-- Pega a cotação mais recente de cada (data, source) do log antigo
-- Não toca em exchange_rate_log — apenas SELECT
INSERT INTO public.exchange_rates_daily (
  rate_date,
  currency_from,
  currency_to,
  rate_avg,
  source,
  fetched_at,
  operation_id,
  created_at
)
SELECT DISTINCT ON (DATE(created_at), COALESCE(NULLIF(source, ''), 'legacy'))
  DATE(created_at) as rate_date,
  'USD' as currency_from,
  'BRL' as currency_to,
  rate as rate_avg,
  COALESCE(NULLIF(source, ''), 'legacy') as source,
  created_at as fetched_at,
  operation_id,
  created_at
FROM public.exchange_rate_log
WHERE rate IS NOT NULL AND rate > 0
ORDER BY DATE(created_at), COALESCE(NULLIF(source, ''), 'legacy'), created_at DESC
ON CONFLICT (rate_date, currency_from, currency_to, source) DO NOTHING;

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON TABLE public.exchange_rates_daily IS 
  'Histórico imutável de cotações diárias USD->BRL para reconciliação financeira. Sprint 1 - Onda 1.';

COMMENT ON COLUMN public.exchange_rates_daily.rate_avg IS 
  'Cotação principal usada na reconciliação (média entre compra e venda PTAX).';

COMMENT ON COLUMN public.exchange_rates_daily.source IS 
  'Fonte da cotação: bcb_ptax, awesomeapi, manual, legacy, etc.';

COMMENT ON COLUMN public.exchange_rates_daily.source_payload IS 
  'Resposta crua da API para auditoria/debug.';