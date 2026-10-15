-- Adicionando colunas de Landing Page Views às tabelas de tráfego do Meta
ALTER TABLE public.meta_spend_realtime_safe ADD COLUMN IF NOT EXISTS landing_page_views BIGINT DEFAULT 0;
ALTER TABLE public.traffic_data ADD COLUMN IF NOT EXISTS landing_page_views BIGINT DEFAULT 0;

-- Comentário para documentar a métrica
COMMENT ON COLUMN public.meta_spend_realtime_safe.landing_page_views IS 'Visualizações da Página de Destino (Landing Page Views) do Facebook Ads';
COMMENT ON COLUMN public.traffic_data.landing_page_views IS 'Visualizações da Página de Destino (Landing Page Views) do Facebook Ads';
