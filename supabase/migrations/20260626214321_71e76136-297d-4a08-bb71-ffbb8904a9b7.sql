CREATE TABLE public.product_margin_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL,
  product_key text NOT NULL,
  margin_pct numeric NOT NULL DEFAULT 0.70,
  be_buffer_pct numeric NOT NULL DEFAULT 0.10,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, product_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_margin_settings TO authenticated;
GRANT ALL ON public.product_margin_settings TO service_role;

ALTER TABLE public.product_margin_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read product margins"
  ON public.product_margin_settings FOR SELECT
  TO authenticated
  USING (public.live_user_in_operation(operation_id));

CREATE POLICY "members write product margins"
  ON public.product_margin_settings FOR ALL
  TO authenticated
  USING (public.live_user_in_operation(operation_id))
  WITH CHECK (public.live_user_in_operation(operation_id));

CREATE TRIGGER product_margin_settings_updated_at
  BEFORE UPDATE ON public.product_margin_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();