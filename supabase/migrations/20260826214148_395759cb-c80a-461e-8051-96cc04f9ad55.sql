ALTER TABLE public.space_commission_config
  ADD COLUMN IF NOT EXISTS is_cod_operation boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_rate_pct numeric NOT NULL DEFAULT 60;