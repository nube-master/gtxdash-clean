-- =====================================================
-- Migration 005: reconciliation_alerts
-- Sprint 1 Reconciliação Financeira - Onda 1
-- ZERO REGRESSÃO: tabela nova e isolada
-- =====================================================

CREATE TABLE public.reconciliation_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Classificação
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  
  -- Contexto temporal
  alert_date DATE NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Contexto financeiro
  ad_account_id TEXT,
  card_provider TEXT,
  card_charge_id UUID,
  
  -- Valores do gap
  expected_amount_brl NUMERIC(14,4),
  actual_amount_brl NUMERIC(14,4),
  gap_amount_brl NUMERIC(14,4),
  gap_percentage NUMERIC(8,4),
  
  -- Descrição humana
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  suggested_action TEXT DEFAULT '',
  
  -- Resolução
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  resolution_notes TEXT DEFAULT '',
  
  -- Auto-resolução
  auto_resolved BOOLEAN NOT NULL DEFAULT false,
  auto_resolution_reason TEXT,
  
  -- Metadata pra debug
  detection_metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Multi-tenancy + auditoria
  operation_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT chk_alert_type CHECK (alert_type IN (
    'orphan_charge',
    'gap_above_threshold',
    'inactive_account_charged',
    'missing_charge',
    'fx_anomaly',
    'duplicate_charge',
    'fee_mismatch',
    'other'
  )),
  CONSTRAINT chk_severity CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT chk_status CHECK (status IN ('open', 'acknowledged', 'resolved', 'auto_resolved', 'ignored', 'false_positive'))
);

-- Índices
CREATE INDEX idx_recon_alerts_status_severity 
  ON public.reconciliation_alerts(status, severity, alert_date DESC) 
  WHERE status IN ('open', 'acknowledged');

CREATE INDEX idx_recon_alerts_date 
  ON public.reconciliation_alerts(alert_date DESC);

CREATE INDEX idx_recon_alerts_account 
  ON public.reconciliation_alerts(ad_account_id, alert_date DESC) 
  WHERE ad_account_id IS NOT NULL;

CREATE INDEX idx_recon_alerts_charge 
  ON public.reconciliation_alerts(card_charge_id) 
  WHERE card_charge_id IS NOT NULL;

CREATE INDEX idx_recon_alerts_type_date
  ON public.reconciliation_alerts(alert_type, alert_date DESC);

-- Trigger updated_at
CREATE TRIGGER update_recon_alerts_updated_at
  BEFORE UPDATE ON public.reconciliation_alerts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- RLS
-- =====================================================
ALTER TABLE public.reconciliation_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read reconciliation_alerts"
  ON public.reconciliation_alerts FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Service can insert reconciliation_alerts"
  ON public.reconciliation_alerts FOR INSERT
  TO public WITH CHECK (true);

-- Service role precisa atualizar para auto-resolução automática
CREATE POLICY "Service can auto-resolve reconciliation_alerts"
  ON public.reconciliation_alerts FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

-- Admins podem resolver manualmente (já coberto pela policy acima via service_role bypass,
-- mas mantemos uma policy explícita pra usuários admin via cliente autenticado)
CREATE POLICY "Admins can update reconciliation_alerts"
  ON public.reconciliation_alerts FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete reconciliation_alerts"
  ON public.reconciliation_alerts FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON TABLE public.reconciliation_alerts IS 
  'Alertas automaticos do motor de reconciliacao financeira. Sprint 1 - Onda 1.';

COMMENT ON COLUMN public.reconciliation_alerts.alert_type IS 
  'Tipo: orphan_charge, gap_above_threshold, inactive_account_charged, missing_charge, fx_anomaly, duplicate_charge, fee_mismatch, other.';

COMMENT ON COLUMN public.reconciliation_alerts.severity IS 
  'Severidade calculada pelo motor: low (gap<5%), medium (5-15%), high (15-30%), critical (>30% ou orphan>R$500).';

COMMENT ON COLUMN public.reconciliation_alerts.status IS 
  'open=novo, acknowledged=visto, resolved=resolvido manual por admin, auto_resolved=resolvido pelo motor, ignored=ignorado, false_positive=falso positivo.';

COMMENT ON COLUMN public.reconciliation_alerts.auto_resolved IS 
  'TRUE quando uma reupload de CSV explicou o gap automaticamente. Admin sempre pode reverter para resolved manual.';

COMMENT ON COLUMN public.reconciliation_alerts.detection_metadata IS 
  'Snapshot JSON dos dados brutos que geraram o alerta (para debug e auditoria).';