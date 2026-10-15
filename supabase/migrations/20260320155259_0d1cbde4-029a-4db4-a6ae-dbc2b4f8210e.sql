
CREATE TABLE public.meta_spend_realtime_safe (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id text NOT NULL,
  spend_brl numeric NOT NULL DEFAULT 0,
  impressions bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  sp_date date NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE(account_id, sp_date)
);

ALTER TABLE public.meta_spend_realtime_safe ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service insert meta_spend_realtime_safe"
  ON public.meta_spend_realtime_safe FOR INSERT
  TO public WITH CHECK (true);

CREATE POLICY "Allow service update meta_spend_realtime_safe"
  ON public.meta_spend_realtime_safe FOR UPDATE
  TO public USING (true);

CREATE POLICY "Authenticated can read meta_spend_realtime_safe"
  ON public.meta_spend_realtime_safe FOR SELECT
  TO public USING (true);

CREATE POLICY "Allow service delete meta_spend_realtime_safe"
  ON public.meta_spend_realtime_safe FOR DELETE
  TO public USING (true);
