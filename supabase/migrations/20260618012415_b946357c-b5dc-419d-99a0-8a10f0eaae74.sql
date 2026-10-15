CREATE TABLE IF NOT EXISTS public.exchange_rates_cache (
  id BIGSERIAL PRIMARY KEY,
  base_currency CHAR(3) NOT NULL,
  target_currency CHAR(3) NOT NULL,
  rate NUMERIC(18, 8) NOT NULL CHECK (rate > 0),
  source TEXT NOT NULL DEFAULT 'frankfurter.app',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT exchange_rates_cache_pair_unique UNIQUE (base_currency, target_currency)
);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_pair
  ON public.exchange_rates_cache (base_currency, target_currency);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_expires
  ON public.exchange_rates_cache (expires_at DESC);

GRANT SELECT ON public.exchange_rates_cache TO anon, authenticated;
GRANT ALL ON public.exchange_rates_cache TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.exchange_rates_cache_id_seq TO service_role;

ALTER TABLE public.exchange_rates_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon read exchange rates"
  ON public.exchange_rates_cache FOR SELECT USING (true);