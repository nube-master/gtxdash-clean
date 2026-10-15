
-- Table for data warnings/inconsistencies
CREATE TABLE public.gtx_data_warnings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo_erro text NOT NULL,
  entidade text NOT NULL DEFAULT '',
  campaign_id text,
  descricao text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.gtx_data_warnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service insert gtx_data_warnings" ON public.gtx_data_warnings FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service delete gtx_data_warnings" ON public.gtx_data_warnings FOR DELETE USING (true);
CREATE POLICY "Authenticated users can read gtx_data_warnings" ON public.gtx_data_warnings FOR SELECT USING (true);

-- Table for decision audit log
CREATE TABLE public.gtx_decisions_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id text NOT NULL,
  campaign_name text NOT NULL DEFAULT '',
  fase text NOT NULL DEFAULT '',
  roas_3d numeric NOT NULL DEFAULT 0,
  lucro_3d numeric NOT NULL DEFAULT 0,
  vendas_3d integer NOT NULL DEFAULT 0,
  decisao text NOT NULL,
  motivo text NOT NULL DEFAULT '',
  versao_engine text NOT NULL DEFAULT 'v2.0',
  is_financial_valid boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.gtx_decisions_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service insert gtx_decisions_log" ON public.gtx_decisions_log FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated users can read gtx_decisions_log" ON public.gtx_decisions_log FOR SELECT USING (true);

-- Index for quick lookups
CREATE INDEX idx_gtx_warnings_created ON public.gtx_data_warnings (created_at DESC);
CREATE INDEX idx_gtx_decisions_campaign ON public.gtx_decisions_log (campaign_id, created_at DESC);
