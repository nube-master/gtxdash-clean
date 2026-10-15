
CREATE TABLE public.daily_totals_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL UNIQUE,
  total_spend numeric NOT NULL DEFAULT 0,
  total_revenue numeric NOT NULL DEFAULT 0,
  total_conversions integer NOT NULL DEFAULT 0,
  total_clicks integer NOT NULL DEFAULT 0,
  total_impressions integer NOT NULL DEFAULT 0,
  roas numeric NOT NULL DEFAULT 0,
  cac numeric NOT NULL DEFAULT 0,
  ticket_medio numeric NOT NULL DEFAULT 0,
  lucro_bruto numeric NOT NULL DEFAULT 0,
  usd_to_brl numeric NOT NULL DEFAULT 5.15,
  cp_revenue numeric NOT NULL DEFAULT 0,
  cp_count integer NOT NULL DEFAULT 0,
  rt_revenue_brl numeric NOT NULL DEFAULT 0,
  rt_count integer NOT NULL DEFAULT 0,
  spend_source text NOT NULL DEFAULT 'hourly_normalized',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.daily_totals_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service insert daily_totals_snapshot"
  ON public.daily_totals_snapshot FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Allow service update daily_totals_snapshot"
  ON public.daily_totals_snapshot FOR UPDATE
  TO public
  USING (true);

CREATE POLICY "Authenticated can read daily_totals_snapshot"
  ON public.daily_totals_snapshot FOR SELECT
  TO public
  USING (true);
