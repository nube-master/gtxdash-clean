CREATE TABLE public.pacing_campaign_hourly_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES public.operations(id) ON DELETE CASCADE,
  account_id text NOT NULL,
  campaign_id text NOT NULL,
  campaign_name text NOT NULL,
  date date NOT NULL,
  snapshot_at timestamptz NOT NULL DEFAULT now(),
  snapshot_bucket timestamptz NOT NULL,
  spend_today_brl numeric(12,2) NOT NULL DEFAULT 0,
  spend_last_60m_brl numeric(12,2) NOT NULL DEFAULT 0,
  sales_last_60m integer NOT NULL DEFAULT 0,
  revenue_today_brl numeric(12,2) NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'meta_campaign_hourly_api',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, campaign_id, snapshot_bucket)
);

GRANT SELECT ON public.pacing_campaign_hourly_snapshots TO authenticated;
GRANT ALL ON public.pacing_campaign_hourly_snapshots TO service_role;

ALTER TABLE public.pacing_campaign_hourly_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read campaign hourly snapshots"
  ON public.pacing_campaign_hourly_snapshots
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.operation_members om
      WHERE om.operation_id = pacing_campaign_hourly_snapshots.operation_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

CREATE INDEX idx_pacing_campaign_hourly_latest
  ON public.pacing_campaign_hourly_snapshots (date, account_id, campaign_id, snapshot_at DESC);

CREATE INDEX idx_pacing_campaign_hourly_operation_date
  ON public.pacing_campaign_hourly_snapshots (operation_id, date, snapshot_at DESC);

CREATE TRIGGER trg_pacing_campaign_hourly_updated
  BEFORE UPDATE ON public.pacing_campaign_hourly_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.cleanup_pacing_campaign_hourly_snapshots()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.pacing_campaign_hourly_snapshots
  WHERE snapshot_at < now() - interval '7 days';
$$;

SELECT cron.schedule(
  'pacing-campaign-hourly-cleanup',
  '15 5 * * *',
  $$ SELECT public.cleanup_pacing_campaign_hourly_snapshots(); $$
);