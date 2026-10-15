
CREATE TABLE public.exchange_rate_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rate numeric NOT NULL,
  source text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.exchange_rate_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read exchange_rate_log"
  ON public.exchange_rate_log FOR SELECT
  USING (true);

CREATE POLICY "Allow service insert exchange_rate_log"
  ON public.exchange_rate_log FOR INSERT
  WITH CHECK (true);
