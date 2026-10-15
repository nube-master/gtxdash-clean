CREATE TABLE public.cod_import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid REFERENCES public.operations(id) ON DELETE CASCADE,
  filename text,
  total_rows int NOT NULL DEFAULT 0,
  processed_rows int NOT NULL DEFAULT 0,
  last_batch_index int NOT NULL DEFAULT 0,
  success_count int NOT NULL DEFAULT 0,
  error_count int NOT NULL DEFAULT 0,
  skipped_count int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed','cancelled')),
  is_retroactive boolean NOT NULL DEFAULT true,
  rows_payload jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_message text,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  heartbeat_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cod_import_jobs TO authenticated;
GRANT ALL ON public.cod_import_jobs TO service_role;

ALTER TABLE public.cod_import_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cod_import_jobs_member_access" ON public.cod_import_jobs
FOR ALL TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR EXISTS (SELECT 1 FROM public.operation_members m WHERE m.operation_id = cod_import_jobs.operation_id AND m.user_id = auth.uid())
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR EXISTS (SELECT 1 FROM public.operation_members m WHERE m.operation_id = cod_import_jobs.operation_id AND m.user_id = auth.uid())
);

CREATE TABLE public.cod_import_job_errors (
  id bigserial PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES public.cod_import_jobs(id) ON DELETE CASCADE,
  row_number int,
  order_id text,
  field text,
  message text,
  raw_row jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cod_import_job_errors TO authenticated;
GRANT ALL ON public.cod_import_job_errors TO service_role;

ALTER TABLE public.cod_import_job_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cod_import_job_errors_member_access" ON public.cod_import_job_errors
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.cod_import_jobs j
    WHERE j.id = cod_import_job_errors.job_id
      AND (
        public.is_super_admin(auth.uid())
        OR EXISTS (SELECT 1 FROM public.operation_members m WHERE m.operation_id = j.operation_id AND m.user_id = auth.uid())
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.cod_import_jobs j
    WHERE j.id = cod_import_job_errors.job_id
      AND (
        public.is_super_admin(auth.uid())
        OR EXISTS (SELECT 1 FROM public.operation_members m WHERE m.operation_id = j.operation_id AND m.user_id = auth.uid())
      )
  )
);

CREATE INDEX cod_import_jobs_status_created_idx ON public.cod_import_jobs (status, created_at DESC);
CREATE INDEX cod_import_jobs_operation_idx ON public.cod_import_jobs (operation_id, created_at DESC);
CREATE INDEX cod_import_job_errors_job_idx ON public.cod_import_job_errors (job_id);

CREATE TRIGGER cod_import_jobs_updated_at
BEFORE UPDATE ON public.cod_import_jobs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();