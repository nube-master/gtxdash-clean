ALTER TABLE public.spy_alerts DROP CONSTRAINT IF EXISTS spy_alerts_event_type_check;
ALTER TABLE public.spy_alerts ADD CONSTRAINT spy_alerts_event_type_check
  CHECK (event_type IN ('escalando','new_ads','score_jump','new_offer','constant_growth','daily_digest','dead_offer','emerging_growth'));

ALTER TABLE public.spy_offers
  ADD COLUMN IF NOT EXISTS last_emerging_growth_alert_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_emerging_growth_pct numeric;