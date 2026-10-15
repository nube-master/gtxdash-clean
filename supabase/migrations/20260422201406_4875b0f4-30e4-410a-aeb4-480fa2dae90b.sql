-- Performance VSL — Etapa 1
-- Tabela paralela à vsl_data, com granularidade (date, vsl_id, utm_campaign).

CREATE TABLE IF NOT EXISTS public.vturb_performance_daily (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date            DATE NOT NULL,
  vsl_id          TEXT NOT NULL,
  vsl_name        TEXT NOT NULL DEFAULT '',
  project         TEXT NOT NULL DEFAULT '',
  utm_campaign    TEXT NOT NULL DEFAULT '',
  views           INTEGER NOT NULL DEFAULT 0,
  unique_views    INTEGER NOT NULL DEFAULT 0,
  retention_25    NUMERIC NOT NULL DEFAULT 0,
  retention_50    NUMERIC NOT NULL DEFAULT 0,
  retention_75    NUMERIC NOT NULL DEFAULT 0,
  retention_100   NUMERIC NOT NULL DEFAULT 0,
  retention_avg   NUMERIC NOT NULL DEFAULT 0,
  cta_clicks      INTEGER NOT NULL DEFAULT 0,
  conversions     INTEGER NOT NULL DEFAULT 0,
  conversion_rate NUMERIC NOT NULL DEFAULT 0,
  retention_curve JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_mock         BOOLEAN NOT NULL DEFAULT false,
  operation_id    UUID REFERENCES public.operations(id),
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT vturb_perf_daily_unique UNIQUE (date, vsl_id, utm_campaign)
);

CREATE INDEX IF NOT EXISTS idx_vturb_perf_date          ON public.vturb_performance_daily(date DESC);
CREATE INDEX IF NOT EXISTS idx_vturb_perf_project_date  ON public.vturb_performance_daily(project, date DESC);
CREATE INDEX IF NOT EXISTS idx_vturb_perf_utm_date      ON public.vturb_performance_daily(utm_campaign, date DESC);
CREATE INDEX IF NOT EXISTS idx_vturb_perf_op            ON public.vturb_performance_daily(operation_id);

ALTER TABLE public.vturb_performance_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read vturb_performance_daily"
  ON public.vturb_performance_daily FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Allow service insert vturb_performance_daily"
  ON public.vturb_performance_daily FOR INSERT
  TO public WITH CHECK (true);

CREATE POLICY "Allow service update vturb_performance_daily"
  ON public.vturb_performance_daily FOR UPDATE
  TO public USING (true);

CREATE POLICY "Admins can delete vturb_performance_daily"
  ON public.vturb_performance_daily FOR DELETE
  TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));