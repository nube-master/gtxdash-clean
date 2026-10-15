-- F8.F.1: Tabela
CREATE TABLE IF NOT EXISTS public.feature_flags (
  key           TEXT PRIMARY KEY,
  enabled       BOOLEAN NOT NULL DEFAULT FALSE,
  rollout_pct   INT DEFAULT 0 CHECK (rollout_pct BETWEEN 0 AND 100),
  operation_ids UUID[] DEFAULT ARRAY[]::UUID[],
  updated_by    UUID REFERENCES auth.users(id),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  description   TEXT,
  metadata      JSONB DEFAULT '{}'::jsonb
);

GRANT SELECT ON public.feature_flags TO authenticated;
GRANT ALL ON public.feature_flags TO service_role;

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feature_flags_super_admin_only" ON public.feature_flags
FOR ALL USING (
  EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())
);

CREATE OR REPLACE FUNCTION public._feature_flags_touch()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_feature_flags_touch ON public.feature_flags;
CREATE TRIGGER trg_feature_flags_touch
  BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW EXECUTE FUNCTION public._feature_flags_touch();

INSERT INTO _migration_log(phase, step, table_name, status, completed_at, metadata)
VALUES ('F8.F', 'create_feature_flags_table','feature_flags','completed', NOW(),
        jsonb_build_object('has_rls', true, 'trigger', 'auto_update_at'));

-- F8.F.2: Helper
CREATE OR REPLACE FUNCTION public._flag_on(p_key TEXT, p_op UUID DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  f RECORD;
BEGIN
  SELECT * INTO f FROM public.feature_flags WHERE key = p_key;
  IF NOT FOUND OR NOT f.enabled THEN RETURN FALSE; END IF;
  IF array_length(f.operation_ids, 1) IS NULL THEN RETURN TRUE; END IF;
  IF p_op IS NULL THEN RETURN FALSE; END IF;
  RETURN p_op = ANY(f.operation_ids);
END;
$$;

GRANT EXECUTE ON FUNCTION public._flag_on(TEXT, UUID) TO authenticated, anon;

INSERT INTO _migration_log(phase, step, table_name, status, completed_at, metadata)
VALUES ('F8.F', 'create_flag_on_helper', NULL,'completed', NOW(),
        jsonb_build_object('function','_flag_on(TEXT, UUID)',
                          'stable', true, 'security','definer',
                          'grant','authenticated,anon'));

-- F8.F.3: Seeds
INSERT INTO public.feature_flags(key, enabled, description, metadata) VALUES
  ('strict_tenant_isolation', FALSE,
   'Bloqueia acesso cross-operation mesmo pra admins. Liga na F9 com rollout gradual.',
   jsonb_build_object('phase','F9','impact','blocks admin cross-op access')),
  ('mcp_multi_op_context', FALSE,
   'MCP Sofia usa contexto de operação ativa por sessão. Liga na F11 depois do deploy do MCP novo.',
   jsonb_build_object('phase','F11','impact','Sofia respeita operation ativa')),
  ('scheduler_per_operation', FALSE,
   'Cron ingest roda POR operação (orquestrador+workers). Liga na F8.C depois do deploy.',
   jsonb_build_object('phase','F8.C','impact','muda como crons rodam')),
  ('ingest_dry_run_by_default', FALSE,
   'Novos ingest workers rodam em modo dry_run por padrão. Usado em state machine F8.D.',
   jsonb_build_object('phase','F8.D','impact','operations em testing só logam')),
  ('operation_credentials_vault', FALSE,
   'Ler tokens/credentials via operation_credentials+Vault ao invés de env global. Liga na F8.B.',
   jsonb_build_object('phase','F8.B','impact','multi-tenant credential source'))
ON CONFLICT (key) DO NOTHING;

INSERT INTO _migration_log(phase, step, table_name, status, completed_at, metadata)
VALUES ('F8.F', 'seed_initial_flags', 'feature_flags','completed', NOW(),
        jsonb_build_object('flags_registered', 5, 'all_disabled', true));