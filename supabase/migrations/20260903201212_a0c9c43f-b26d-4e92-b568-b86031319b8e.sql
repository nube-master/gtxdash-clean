ALTER TABLE public.cod_orders
  ADD COLUMN IF NOT EXISTS import_job_id uuid REFERENCES public.cod_import_jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS cod_orders_import_job_idx ON public.cod_orders (import_job_id);