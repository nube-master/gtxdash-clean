CREATE TABLE IF NOT EXISTS public.meta_ad_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id text NOT NULL,
  ad_id text NOT NULL,
  ad_name text,
  campaign_id text,
  campaign_name text,
  page_id text,
  page_name text,
  effective_status text,
  operation_id uuid REFERENCES public.operations(id) ON DELETE SET NULL,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, ad_id)
);

CREATE INDEX IF NOT EXISTS idx_meta_ad_pages_status ON public.meta_ad_pages (effective_status);
CREATE INDEX IF NOT EXISTS idx_meta_ad_pages_op ON public.meta_ad_pages (operation_id);
CREATE INDEX IF NOT EXISTS idx_meta_ad_pages_page ON public.meta_ad_pages (page_id);

GRANT SELECT ON public.meta_ad_pages TO authenticated;
GRANT ALL ON public.meta_ad_pages TO service_role;

ALTER TABLE public.meta_ad_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_ad_pages FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meta_ad_pages_select_by_op" ON public.meta_ad_pages;
CREATE POLICY "meta_ad_pages_select_by_op" ON public.meta_ad_pages
  FOR SELECT TO authenticated
  USING (
    operation_id IS NULL
    OR public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.operation_members m
      WHERE m.operation_id = meta_ad_pages.operation_id AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "meta_ad_pages_service_all" ON public.meta_ad_pages;
CREATE POLICY "meta_ad_pages_service_all" ON public.meta_ad_pages
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Cron hourly to keep page mapping fresh
SELECT cron.unschedule('sync-meta-ad-pages-hourly') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'sync-meta-ad-pages-hourly'
);

SELECT cron.schedule(
  'sync-meta-ad-pages-hourly',
  '17 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://taeduxiandktefcwgspx.supabase.co/functions/v1/sync-meta-ad-pages',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := jsonb_build_object('offset', 0, 'batch_size', 200)
  );
  $$
);