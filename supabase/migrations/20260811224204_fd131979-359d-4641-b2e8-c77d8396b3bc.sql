-- 1. Meta Ad Accounts
CREATE TABLE IF NOT EXISTS public.meta_accounts (
    account_id text PRIMARY KEY,
    name text NOT NULL,
    currency text DEFAULT 'BRL',
    status text,
    business_id text,
    active boolean DEFAULT true,
    timezone_name text,
    operation_id uuid REFERENCES public.operations(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_accounts TO authenticated;
GRANT ALL ON public.meta_accounts TO service_role;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'meta_accounts' AND rowsecurity = true) THEN
    ALTER TABLE public.meta_accounts ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

DROP POLICY IF EXISTS "Operation isolation" ON public.meta_accounts;
CREATE POLICY "Operation isolation" ON public.meta_accounts
FOR ALL TO authenticated USING (public.strict_op_scope(operation_id));

-- 2. Meta Pacing Audit
CREATE TABLE IF NOT EXISTS public.meta_pacing_audit (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    operation_id uuid REFERENCES public.operations(id) ON DELETE CASCADE,
    entity_id text NOT NULL,
    entity_name text,
    action text NOT NULL,
    previous_value numeric,
    new_value numeric,
    reason text,
    executed_by uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_pacing_audit TO authenticated;
GRANT ALL ON public.meta_pacing_audit TO service_role;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'meta_pacing_audit' AND rowsecurity = true) THEN
    ALTER TABLE public.meta_pacing_audit ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

DROP POLICY IF EXISTS "Operation isolation" ON public.meta_pacing_audit;
CREATE POLICY "Operation isolation" ON public.meta_pacing_audit
FOR ALL TO authenticated USING (public.strict_op_scope(operation_id));

-- 3. Creative Performance View
CREATE OR REPLACE VIEW public.meta_creatives_performance AS
WITH raw_data AS (
  SELECT 
    td.operation_id,
    td.account_id,
    td.campaign_name,
    td.ad_name,
    td.spend,
    td.impressions,
    td.clicks,
    td.inline_link_clicks,
    td.initiate_checkout,
    td.purchase_count,
    COALESCE(td.purchase_count * 235, 0) as purchase_value,
    substring(td.ad_name FROM '\[(AD\d+)\]') as ad_code_ad,
    substring(td.campaign_name FROM '\[(AD\d+)\]') as ad_code_cmp
  FROM traffic_data td
  WHERE td.date >= (CURRENT_DATE - INTERVAL '30 days')
)
SELECT 
  operation_id,
  COALESCE(ad_code_ad, ad_code_cmp, 'SEM_TAG') as ad_code,
  SUM(spend) as spend_brl,
  SUM(impressions) as impressions,
  SUM(clicks) as clicks,
  SUM(inline_link_clicks) as link_clicks,
  SUM(initiate_checkout) as ic_count,
  SUM(purchase_count) as purchase_count,
  SUM(purchase_value) as revenue_brl,
  CASE WHEN SUM(spend) > 0 THEN SUM(purchase_value) / SUM(spend) ELSE 0 END as roas,
  CASE WHEN SUM(purchase_count) > 0 THEN SUM(spend) / SUM(purchase_count) ELSE 0 END as cac,
  CASE WHEN SUM(impressions) > 0 THEN (SUM(inline_link_clicks)::numeric / SUM(impressions)) * 100 ELSE 0 END as ctr_link,
  array_agg(DISTINCT account_id) as account_ids
FROM raw_data
GROUP BY operation_id, 2;

GRANT SELECT ON public.meta_creatives_performance TO authenticated;
GRANT ALL ON public.meta_creatives_performance TO service_role;
