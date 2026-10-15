
-- Table: system_health_logs
CREATE TABLE public.system_health_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'sync',
  status TEXT NOT NULL DEFAULT 'ok',
  source TEXT NOT NULL DEFAULT 'internal',
  message TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.system_health_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service insert system_health_logs" ON public.system_health_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service delete system_health_logs" ON public.system_health_logs FOR DELETE USING (true);
CREATE POLICY "Authenticated users can read system_health_logs" ON public.system_health_logs FOR SELECT USING (true);

CREATE INDEX idx_system_health_logs_created ON public.system_health_logs (created_at DESC);
CREATE INDEX idx_system_health_logs_type_status ON public.system_health_logs (type, status);

-- Table: system_daily_snapshot
CREATE TABLE public.system_daily_snapshot (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_campaigns_meta INTEGER NOT NULL DEFAULT 0,
  total_campaigns_dash INTEGER NOT NULL DEFAULT 0,
  total_spend NUMERIC NOT NULL DEFAULT 0,
  total_revenue NUMERIC NOT NULL DEFAULT 0,
  total_sales INTEGER NOT NULL DEFAULT 0,
  divergence_percent NUMERIC NOT NULL DEFAULT 0,
  api_write_errors_24h INTEGER NOT NULL DEFAULT 0,
  api_read_errors_24h INTEGER NOT NULL DEFAULT 0,
  calculation_errors INTEGER NOT NULL DEFAULT 0,
  decision_errors INTEGER NOT NULL DEFAULT 0,
  overall_status TEXT NOT NULL DEFAULT 'ok',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.system_daily_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service insert system_daily_snapshot" ON public.system_daily_snapshot FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service delete system_daily_snapshot" ON public.system_daily_snapshot FOR DELETE USING (true);
CREATE POLICY "Authenticated users can read system_daily_snapshot" ON public.system_daily_snapshot FOR SELECT USING (true);

CREATE INDEX idx_system_daily_snapshot_date ON public.system_daily_snapshot (snapshot_date DESC);
