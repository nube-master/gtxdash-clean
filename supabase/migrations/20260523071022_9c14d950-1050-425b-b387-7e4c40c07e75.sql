-- Spy v2.1 — Daily Digest + Dead Offer detection

-- 1. Atualiza CHECK constraint pra incluir novos event_types
ALTER TABLE public.spy_alerts DROP CONSTRAINT IF EXISTS spy_alerts_event_type_check;
ALTER TABLE public.spy_alerts ADD CONSTRAINT spy_alerts_event_type_check
  CHECK (event_type IN (
    'escalando', 'score_jump', 'new_ads', 'new_offer',
    'constant_growth', 'daily_digest', 'dead_offer'
  ));

-- 2. Cooldown anti-spam de Dead Offer alert (mesmo padrão do constant_growth)
ALTER TABLE public.spy_offers
  ADD COLUMN IF NOT EXISTS last_dead_alert_at timestamptz;