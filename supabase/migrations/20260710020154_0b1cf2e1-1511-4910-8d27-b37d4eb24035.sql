
-- F0.1: tabela de log de migração
CREATE TABLE IF NOT EXISTS public._migration_log (
  id            BIGSERIAL PRIMARY KEY,
  phase         TEXT NOT NULL,
  step          TEXT NOT NULL,
  table_name    TEXT,
  rows_before   BIGINT,
  rows_after    BIGINT,
  rows_affected BIGINT,
  status        TEXT DEFAULT 'started',
  error_message TEXT,
  started_at    TIMESTAMPTZ DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,
  metadata      JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_migration_log_phase ON public._migration_log(phase, step);

-- Sem grants pra anon/authenticated: só service_role/admin acessam
GRANT ALL ON public._migration_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public._migration_log_id_seq TO service_role;

ALTER TABLE public._migration_log ENABLE ROW LEVEL SECURITY;

-- Nenhuma policy → PostgREST bloqueia; service_role bypassa RLS

-- Registrar F-1 no histórico
INSERT INTO public._migration_log(phase, step, status, completed_at, metadata)
VALUES ('F-1', 'backup_interno_completo', 'completed', NOW(),
  jsonb_build_object(
    'backup_tables_created', 19,
    'policies_snapshotted', 345,
    'note', 'Snapshot criado com RLS ligado, sem policies → só service_role acessa'
  ));

-- F0.2: helper contar rows
CREATE OR REPLACE FUNCTION public._count_rows(p_table TEXT)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count BIGINT;
BEGIN
  EXECUTE format('SELECT COUNT(*) FROM public.%I', p_table) INTO v_count;
  RETURN v_count;
END;
$$;

-- F0.3: helper contar rows com operation_id NULL
CREATE OR REPLACE FUNCTION public._count_null_operation(p_table TEXT)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count BIGINT;
BEGIN
  EXECUTE format('SELECT COUNT(*) FROM public.%I WHERE operation_id IS NULL', p_table)
  INTO v_count;
  RETURN v_count;
EXCEPTION WHEN undefined_column THEN
  RETURN -1;
END;
$$;

-- Restringe execução: só service_role
REVOKE ALL ON FUNCTION public._count_rows(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._count_null_operation(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._count_rows(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public._count_null_operation(TEXT) TO service_role;
