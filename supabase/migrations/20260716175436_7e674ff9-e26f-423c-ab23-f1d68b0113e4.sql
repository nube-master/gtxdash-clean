
-- F9 DIA 1.B - PASSO 1
-- RPC harness for testing RLS policies under simulated auth scenarios.
-- Runs each (scenario × table) inside a subtransaction, switching to
-- role 'authenticated' + injecting request.jwt.claims + GUCs, then
-- resets. Returns structured jsonb per (scenario, table).

CREATE OR REPLACE FUNCTION public.f9_policy_test(p_scenarios jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_sa boolean;
  v_results jsonb := '[]'::jsonb;
  v_scenario jsonb;
  v_table text;
  v_tables jsonb;
  v_scenario_name text;
  v_user_id uuid;
  v_active_op text;
  v_cross_intent text;
  v_expected_visible boolean;
  v_jwt_claims jsonb;
  v_count bigint;
  v_start timestamptz;
  v_duration_ms int;
  v_error text;
  v_pass boolean;
BEGIN
  -- Guard: only super_admins
  SELECT EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = v_caller)
    INTO v_is_sa;
  IF NOT v_is_sa THEN
    RAISE EXCEPTION 'f9_policy_test: only super_admins can call this RPC (caller=%)', v_caller;
  END IF;

  -- p_scenarios shape:
  -- {
  --   "tables": ["offers","sales_data",...],
  --   "scenarios": [
  --     {"name":"user_gtx","user_id":"<uuid>","active_op":"<uuid>","cross_intent":false,"expected_visible":true},
  --     {"name":"super_admin_no_op","user_id":"<sa-uuid>","active_op":null,"cross_intent":false,"expected_visible":false},
  --     ...
  --   ]
  -- }

  v_tables := p_scenarios->'tables';

  FOR v_scenario IN SELECT * FROM jsonb_array_elements(p_scenarios->'scenarios')
  LOOP
    v_scenario_name := v_scenario->>'name';
    v_user_id       := (v_scenario->>'user_id')::uuid;
    v_active_op     := v_scenario->>'active_op';       -- may be null
    v_cross_intent  := COALESCE(v_scenario->>'cross_intent','false');

    FOR v_table IN SELECT jsonb_array_elements_text(v_tables)
    LOOP
      v_expected_visible := COALESCE(
        (v_scenario->'expected_visible_by_table'->>v_table)::boolean,
        (v_scenario->>'expected_visible')::boolean
      );
      v_error := NULL;
      v_count := NULL;
      v_pass := NULL;
      v_start := clock_timestamp();

      BEGIN
        -- Build JWT claims for auth.uid()
        v_jwt_claims := jsonb_build_object(
          'sub', v_user_id::text,
          'role','authenticated',
          'aud','authenticated'
        );

        -- Apply session context (tx-local)
        PERFORM set_config('request.jwt.claims', v_jwt_claims::text, true);
        PERFORM set_config('app.active_operation', COALESCE(v_active_op,''), true);
        PERFORM set_config('app.cross_op_intent', v_cross_intent, true);

        -- Switch to authenticated role so RLS applies
        SET LOCAL ROLE authenticated;

        -- Run the count under RLS
        EXECUTE format('SELECT count(*) FROM (SELECT 1 FROM public.%I LIMIT 1000) s', v_table)
          INTO v_count;

        -- Reset role
        RESET ROLE;

        v_pass := (v_count > 0) = v_expected_visible
               OR (v_count = 0 AND NOT v_expected_visible);
      EXCEPTION WHEN OTHERS THEN
        BEGIN RESET ROLE; EXCEPTION WHEN OTHERS THEN NULL; END;
        v_error := SQLERRM;
        v_pass := false;
      END;

      v_duration_ms := EXTRACT(MILLISECONDS FROM (clock_timestamp() - v_start))::int;

      v_results := v_results || jsonb_build_object(
        'scenario', v_scenario_name,
        'table', v_table,
        'user_id', v_user_id,
        'active_op', v_active_op,
        'cross_intent', v_cross_intent,
        'expected_visible', v_expected_visible,
        'visible_rows', v_count,
        'pass', v_pass,
        'duration_ms', v_duration_ms,
        'error', v_error
      );
    END LOOP;
  END LOOP;

  -- Ensure clean session state after the whole run
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('app.active_operation', '', true);
  PERFORM set_config('app.cross_op_intent', 'false', true);

  RETURN jsonb_build_object(
    'total', jsonb_array_length(v_results),
    'passed', (SELECT count(*) FROM jsonb_array_elements(v_results) e WHERE (e->>'pass')::boolean),
    'failed', (SELECT count(*) FROM jsonb_array_elements(v_results) e WHERE NOT (e->>'pass')::boolean),
    'results', v_results
  );
END;
$$;

REVOKE ALL ON FUNCTION public.f9_policy_test(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.f9_policy_test(jsonb) TO service_role;

COMMENT ON FUNCTION public.f9_policy_test(jsonb) IS
'F9 DIA 1.B harness — simulates auth scenarios (JWT + role + GUCs) and reports per-table visibility. Super_admin-only.';
