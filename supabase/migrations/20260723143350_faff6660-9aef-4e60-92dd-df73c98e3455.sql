
ALTER TABLE public.live_sale_attribution
  ADD COLUMN IF NOT EXISTS matched_via text,
  ADD COLUMN IF NOT EXISTS sale_platform text;

CREATE INDEX IF NOT EXISTS idx_live_viewers_utm_content ON public.live_viewers(operation_id, utm_content) WHERE utm_content IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_live_viewers_utm_campaign ON public.live_viewers(operation_id, utm_campaign) WHERE utm_campaign IS NOT NULL;

-- Permitir upsert por (operation_id, clickid) OU por (operation_id, sale_platform, external_id) no futuro
