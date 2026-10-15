
-- Payment models table (configurable)
CREATE TABLE public.payment_models (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'fixed_delay',
  rules_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read payment_models" ON public.payment_models FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert payment_models" ON public.payment_models FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update payment_models" ON public.payment_models FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete payment_models" ON public.payment_models FOR DELETE TO authenticated USING (true);

-- Cashflow settings table (per month)
CREATE TABLE public.cashflow_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  month TEXT NOT NULL,
  initial_cash NUMERIC NOT NULL DEFAULT 0,
  margin_percent NUMERIC NOT NULL DEFAULT 0,
  payment_model TEXT NOT NULL DEFAULT 'D1',
  timezone_venda TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(month)
);

ALTER TABLE public.cashflow_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read cashflow_settings" ON public.cashflow_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert cashflow_settings" ON public.cashflow_settings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update cashflow_settings" ON public.cashflow_settings FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete cashflow_settings" ON public.cashflow_settings FOR DELETE TO authenticated USING (true);

-- Insert default payment models
INSERT INTO public.payment_models (name, type, rules_json, is_system) VALUES
  ('D1', 'fixed_delay', '{"delay_days": 1}'::jsonb, true),
  ('D2', 'fixed_delay', '{"delay_days": 2}'::jsonb, true),
  ('D3', 'fixed_delay', '{"delay_days": 3}'::jsonb, true),
  ('D7', 'fixed_delay', '{"delay_days": 7}'::jsonb, true),
  ('ClickBank Real', 'clickbank_real', '{"rules": [{"sale_days": [1, 2], "receipt_day": 1}, {"sale_days": [3, 4], "receipt_day": 2}, {"sale_days": [5, 6, 0], "receipt_day": 4}]}'::jsonb, true);
