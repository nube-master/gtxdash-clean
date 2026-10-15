CREATE OR REPLACE FUNCTION public.get_cron_job_history(p_job_name text, p_limit int DEFAULT 3)
RETURNS TABLE (
    runid bigint,
    jobid bigint,
    status text,
    return_message text,
    start_time timestamp with time zone,
    end_time timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cron, public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.runid,
        r.jobid,
        r.status,
        r.return_message,
        r.start_time,
        r.end_time
    FROM cron.job_run_details r
    JOIN cron.job j ON r.jobid = j.jobid
    WHERE j.jobname = p_job_name
    ORDER BY r.start_time DESC
    LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_cron_job_history(text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cron_job_history(text, int) TO service_role;