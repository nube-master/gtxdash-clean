ALTER TABLE public.cod_orders
  ADD COLUMN IF NOT EXISTS project_slug varchar(40),
  ADD COLUMN IF NOT EXISTS country_code char(2),
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS refused_at timestamptz,
  ADD COLUMN IF NOT EXISTS legacy boolean NOT NULL DEFAULT false;

UPDATE public.cod_orders
   SET legacy = true
 WHERE project_slug IS NULL OR country_code IS NULL;

CREATE INDEX IF NOT EXISTS idx_cod_orders_op_project ON public.cod_orders (operation_id, project_slug);
CREATE INDEX IF NOT EXISTS idx_cod_orders_op_country ON public.cod_orders (operation_id, country_code);
CREATE INDEX IF NOT EXISTS idx_cod_orders_paid_at ON public.cod_orders (paid_at) WHERE paid_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cod_orders_refused_at ON public.cod_orders (refused_at) WHERE refused_at IS NOT NULL;