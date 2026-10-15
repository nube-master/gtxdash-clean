-- Spy: alerta "Constant Growth" — oferta com ≥7d consecutivos acima de 20k ads e +30% no período

-- 1. permitir novo event_type
ALTER TABLE public.spy_alerts DROP CONSTRAINT IF EXISTS spy_alerts_event_type_check;
ALTER TABLE public.spy_alerts ADD CONSTRAINT spy_alerts_event_type_check
  CHECK (event_type = ANY (ARRAY['escalando','new_ads','score_jump','new_offer','constant_growth']::text[]));

-- 2. cooldown + delta no spy_offers
ALTER TABLE public.spy_offers
  ADD COLUMN IF NOT EXISTS last_constant_growth_alert_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_constant_growth_pct numeric;

CREATE INDEX IF NOT EXISTS spy_offers_constant_growth_idx
  ON public.spy_offers (last_constant_growth_alert_at DESC NULLS LAST);