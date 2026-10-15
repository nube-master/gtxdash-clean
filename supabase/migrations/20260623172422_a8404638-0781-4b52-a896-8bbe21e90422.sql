
CREATE TABLE public.pacing_evaluation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid REFERENCES public.pacing_rules(id) ON DELETE CASCADE,
  rule_name text NOT NULL,
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  campaigns_matched integer NOT NULL DEFAULT 0,
  campaigns_fired integer NOT NULL DEFAULT 0,
  campaigns_blocked integer NOT NULL DEFAULT 0,
  skip_reason text,
  campaign_ids text[],
  blocked_details jsonb,
  dry_run boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pacing_evaluation_log TO authenticated;
GRANT ALL ON public.pacing_evaluation_log TO service_role;

ALTER TABLE public.pacing_evaluation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access"
  ON public.pacing_evaluation_log
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_pacing_eval_log_rule_evaluated
  ON public.pacing_evaluation_log (rule_id, evaluated_at DESC);

CREATE INDEX idx_pacing_eval_log_evaluated_at
  ON public.pacing_evaluation_log (evaluated_at DESC);

CREATE INDEX idx_pacing_eval_log_campaign_ids
  ON public.pacing_evaluation_log USING GIN (campaign_ids);

-- Housekeeping: purge > 7 days
CREATE OR REPLACE FUNCTION public.cleanup_pacing_evaluation_log()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.pacing_evaluation_log
  WHERE evaluated_at < now() - interval '7 days';
$$;

SELECT cron.schedule(
  'pacing-eval-log-cleanup',
  '0 5 * * *',
  $$ SELECT public.cleanup_pacing_evaluation_log(); $$
);
