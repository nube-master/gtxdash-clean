
CREATE TABLE IF NOT EXISTS public.exchange_rates_daily (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    rate_date date NOT NULL,
    currency_from text NOT NULL,
    currency_to text NOT NULL,
    rate_buy numeric,
    rate_sell numeric,
    rate_avg numeric NOT NULL,
    source text DEFAULT 'awesomeapi'::text,
    source_payload jsonb,
    created_at timestamp with time zone DEFAULT now(),
    UNIQUE (rate_date, currency_from, currency_to, source)
);

GRANT SELECT ON public.exchange_rates_daily TO authenticated;
GRANT ALL ON public.exchange_rates_daily TO service_role;
ALTER TABLE public.exchange_rates_daily ENABLE ROW LEVEL SECURITY;
