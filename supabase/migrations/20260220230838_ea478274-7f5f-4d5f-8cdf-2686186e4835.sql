
-- Create persistent system_logs table for edge function monitoring
CREATE TABLE public.system_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'EDGE_ERROR',
  function_name text,
  message text,
  stack text,
  metadata jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

-- Service role can insert (edge functions use service role)
CREATE POLICY "Allow service insert system_logs"
  ON public.system_logs FOR INSERT
  WITH CHECK (true);

-- Authenticated users can read logs
CREATE POLICY "Authenticated users can read system_logs"
  ON public.system_logs FOR SELECT
  USING (true);

-- Service role can delete old logs
CREATE POLICY "Allow service delete system_logs"
  ON public.system_logs FOR DELETE
  USING (true);
