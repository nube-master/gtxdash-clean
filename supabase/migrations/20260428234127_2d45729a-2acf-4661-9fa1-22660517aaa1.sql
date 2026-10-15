-- 1) Adicionar colunas novas
ALTER TABLE public.vturb_performance_daily
  ADD COLUMN IF NOT EXISTS plays integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pitch_pct numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meta_campaign_id text;

-- 2) Índice no meta_campaign_id (cruzamento exato com Meta)
CREATE INDEX IF NOT EXISTS idx_vturb_perf_meta_campaign_id
  ON public.vturb_performance_daily (meta_campaign_id)
  WHERE meta_campaign_id IS NOT NULL;

-- 3) Limpar APENAS os 3 mocks específicos que já tinham IDs nominais
DELETE FROM public.vturb_performance_daily
WHERE vsl_id IN ('mock-ndm-001', 'mock-erx-001', 'mock-glp-001');