
CREATE OR REPLACE FUNCTION public.admin_list_cron_jobs()
RETURNS TABLE (jobname text, schedule text, active boolean)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT jobname, schedule, active FROM cron.job;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_cron_runs()
RETURNS TABLE (jobname text, status text, start_time timestamptz, return_message text)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT j.jobname, jr.status, jr.start_time, jr.return_message
  FROM cron.job_run_details jr
  JOIN cron.job j USING (jobid)
  WHERE jr.start_time > NOW() - INTERVAL '48 hours'
  ORDER BY jr.start_time DESC LIMIT 30;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_cron_jobs() TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_cron_runs() TO authenticated, service_role, anon;
