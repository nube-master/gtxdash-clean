-- =========================================
-- 1. BUCKET card-extracts (privado)
-- =========================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('card-extracts', 'card-extracts', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies para o bucket card-extracts (admin-only)
CREATE POLICY "Admins can read card-extracts"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'card-extracts' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can upload card-extracts"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'card-extracts' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can update card-extracts"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'card-extracts' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can delete card-extracts"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'card-extracts' AND public.has_role(auth.uid(), 'admin'::public.app_role));

-- Service role pode tudo (edge functions com service key)
CREATE POLICY "Service can manage card-extracts"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'card-extracts')
WITH CHECK (bucket_id = 'card-extracts');

-- =========================================
-- 2. RESCHEDULE cron sync-ptax-daily
-- =========================================
-- Remove o job atual (23h diário)
SELECT cron.unschedule('sync-ptax-daily-23h-brt')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-ptax-daily-23h-brt');

-- Também tenta remover por jobid 65 caso o nome seja diferente
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN SELECT jobname FROM cron.job WHERE jobname LIKE '%sync-ptax%' OR jobname LIKE '%ptax-daily%'
  LOOP
    PERFORM cron.unschedule(rec.jobname);
  END LOOP;
END $$;

-- Recria: 9h BRT (12h UTC), seg-sex
SELECT cron.schedule(
  'sync-ptax-daily-9h-brt-weekdays',
  '0 12 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://taeduxiandktefcwgspx.supabase.co/functions/v1/sync-ptax-daily',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer REDACTED_JWT"}'::jsonb,
    body := jsonb_build_object('source', 'cron', 'triggered_at', now()::text)
  ) AS request_id;
  $$
);

-- =========================================
-- 3. ATUALIZA fee_mapping: Slack -> Pushcut
-- =========================================
UPDATE public.fee_mapping
SET 
  fee_code = 'pushcut_webhook_recon',
  fee_name = 'Pushcut webhook (alertas reconciliacao)',
  notes = 'Webhook Pushcut usado para notificar gaps e anomalias. Secret: PUSHCUT_WEBHOOK_URL'
WHERE fee_code IN ('slack_webhook_recon', 'SLACK_WEBHOOK_RECON')
   OR fee_name ILIKE '%slack%recon%';