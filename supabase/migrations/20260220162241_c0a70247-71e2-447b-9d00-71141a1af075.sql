
-- Fix PUBLIC_DATA_EXPOSURE: Change public SELECT policies to authenticated-only

-- sales_data
DROP POLICY IF EXISTS "Allow public read sales_data" ON public.sales_data;
CREATE POLICY "Authenticated users can read sales_data"
  ON public.sales_data FOR SELECT
  TO authenticated
  USING (true);

-- traffic_data
DROP POLICY IF EXISTS "Allow public read traffic_data" ON public.traffic_data;
CREATE POLICY "Authenticated users can read traffic_data"
  ON public.traffic_data FOR SELECT
  TO authenticated
  USING (true);

-- vsl_data
DROP POLICY IF EXISTS "Allow public read vsl_data" ON public.vsl_data;
CREATE POLICY "Authenticated users can read vsl_data"
  ON public.vsl_data FOR SELECT
  TO authenticated
  USING (true);

-- integration_logs
DROP POLICY IF EXISTS "Allow public read integration_logs" ON public.integration_logs;
CREATE POLICY "Authenticated users can read integration_logs"
  ON public.integration_logs FOR SELECT
  TO authenticated
  USING (true);

-- meta_campaign_status
DROP POLICY IF EXISTS "Allow public read meta_campaign_status" ON public.meta_campaign_status;
CREATE POLICY "Authenticated users can read meta_campaign_status"
  ON public.meta_campaign_status FOR SELECT
  TO authenticated
  USING (true);

-- traffic_breakdowns
DROP POLICY IF EXISTS "Allow public read traffic_breakdowns" ON public.traffic_breakdowns;
CREATE POLICY "Authenticated users can read traffic_breakdowns"
  ON public.traffic_breakdowns FOR SELECT
  TO authenticated
  USING (true);

-- planning_goals: also fix INSERT/UPDATE/DELETE to authenticated
DROP POLICY IF EXISTS "Allow public read planning_goals" ON public.planning_goals;
DROP POLICY IF EXISTS "Allow public insert planning_goals" ON public.planning_goals;
DROP POLICY IF EXISTS "Allow public update planning_goals" ON public.planning_goals;
DROP POLICY IF EXISTS "Allow public delete planning_goals" ON public.planning_goals;

CREATE POLICY "Authenticated users can read planning_goals"
  ON public.planning_goals FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert planning_goals"
  ON public.planning_goals FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update planning_goals"
  ON public.planning_goals FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete planning_goals"
  ON public.planning_goals FOR DELETE TO authenticated USING (true);
