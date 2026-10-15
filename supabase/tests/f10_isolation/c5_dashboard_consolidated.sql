-- F10 C5: dashboard_consolidated() só executa para super_admin.

\set ON_ERROR_STOP on

-- Como super_admin: deve retornar array com >=1 op
DO $$
DECLARE
  result jsonb;
BEGIN
  result := public.dashboard_consolidated('7d', NULL, NULL, 'BRL');
  IF jsonb_array_length(result->'operations') < 1 THEN
    RAISE EXCEPTION 'C5 FAIL: dashboard_consolidated retornou 0 operações';
  END IF;
  RAISE NOTICE 'C5 PASS: % ops retornadas', jsonb_array_length(result->'operations');
END$$;

-- Como user comum (rodar em sessão separada): deve levantar 42501
-- Exemplo esperado:
--   ERROR:  permission denied  (SQLSTATE 42501)
