DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (SELECT oid, proargtypes FROM pg_proc WHERE proname = 'get_total_traffic_metrics' AND pronamespace = 'public'::regnamespace) LOOP
        EXECUTE 'DROP FUNCTION public.get_total_traffic_metrics(' || pg_get_function_identity_arguments(r.oid) || ')';
    END LOOP;
END $$;
