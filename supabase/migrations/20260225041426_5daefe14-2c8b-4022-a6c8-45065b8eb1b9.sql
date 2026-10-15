
-- Create automated reports log table
CREATE TABLE public.automated_reports_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_type TEXT NOT NULL DEFAULT '3h',
  period_hours INTEGER NOT NULL DEFAULT 3,
  metrics JSONB,
  report_text TEXT,
  pushcut_status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.automated_reports_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service insert automated_reports_log" ON public.automated_reports_log FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated users can read automated_reports_log" ON public.automated_reports_log FOR SELECT USING (true);
CREATE POLICY "Allow service delete automated_reports_log" ON public.automated_reports_log FOR DELETE USING (true);
