
-- 1. Adicionar coluna de vendors ClickBank em offers
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS vendors_clickbank text[] DEFAULT '{}'::text[];

-- 2. Pré-popular vendors conhecidos
UPDATE public.offers SET vendors_clickbank = ARRAY['memopryl'] WHERE apelido_interno = 'MMP';
UPDATE public.offers SET vendors_clickbank = ARRAY['memopryl'] WHERE apelido_interno = 'MMPB';
UPDATE public.offers SET vendors_clickbank = ARRAY['crstrenght'] WHERE apelido_interno = 'CRT';

-- 3. Atualizar get_offers_revenue_range com fallback por vendor CB
CREATE OR REPLACE FUNCTION public.get_offers_revenue_range(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(offer_id uuid, apelido_interno text, revenue_brl numeric, sales integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH fx AS (
    SELECT COALESCE(
      (SELECT rate FROM exchange_rate_log ORDER BY created_at DESC LIMIT 1),
      5.5
    )::numeric AS rate
  ),
  -- CartPanda via bracket
  cp_daily AS (
    SELECT o.id AS offer_id, o.apelido_interno, s.date AS d,
      COUNT(*) AS sales,
      COALESCE(SUM(s.revenue), 0)::numeric AS revenue_brl
    FROM public.offers o
    JOIN public.sales_data s ON s.utm_campaign ILIKE '%[' || o.apelido_interno || ']%'
    WHERE s.date >= p_start_date AND s.date <= p_end_date
      AND s.status = 'approved'
      AND (p_operation_id IS NULL OR s.operation_id = p_operation_id)
    GROUP BY o.id, o.apelido_interno, s.date
  ),
  -- RedTrack via bracket
  rt_daily AS (
    SELECT o.id AS offer_id, o.apelido_interno,
      (r.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date AS d,
      COUNT(*) AS sales,
      COALESCE(SUM(r.amount * (SELECT rate FROM fx)), 0)::numeric AS revenue_brl
    FROM public.offers o
    JOIN public.redtrack_events r ON r.utm_campaign ILIKE '%[' || o.apelido_interno || ']%'
    WHERE r.event_type = 'purchase'
      AND (r.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date >= p_start_date
      AND (r.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date <= p_end_date
      AND (p_operation_id IS NULL OR r.operation_id = p_operation_id)
    GROUP BY o.id, o.apelido_interno, (r.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date
  ),
  -- ClickBank via vendor (fallback) - só quando bracket Meta falha
  cb_vendor_daily AS (
    SELECT o.id AS offer_id, o.apelido_interno, cb.date AS d,
      COUNT(*) AS sales,
      COALESCE(SUM(cb.amount_brl), 0)::numeric AS revenue_brl
    FROM public.offers o
    JOIN public.clickbank_audit cb 
      ON LOWER(cb.vendor) = ANY(SELECT LOWER(unnest(o.vendors_clickbank)))
    WHERE cb.date >= p_start_date AND cb.date <= p_end_date
      AND cb.transaction_type = 'SALE'
      AND cb.amount_usd BETWEEN 180 AND 260
      AND COALESCE(array_length(o.vendors_clickbank, 1), 0) > 0
      AND (p_operation_id IS NULL OR cb.operation_id = p_operation_id)
    GROUP BY o.id, o.apelido_interno, cb.date
  ),
  -- MAX por dia entre as 3 fontes (Dual-Source MAX expandido)
  max_daily AS (
    SELECT
      offer_id, apelido_interno, d,
      GREATEST(
        COALESCE(MAX(cp_sales), 0),
        COALESCE(MAX(rt_sales), 0),
        COALESCE(MAX(cb_sales), 0)
      )::int AS sales,
      GREATEST(
        COALESCE(MAX(cp_rev), 0),
        COALESCE(MAX(rt_rev), 0),
        COALESCE(MAX(cb_rev), 0)
      )::numeric AS revenue_brl
    FROM (
      SELECT offer_id, apelido_interno, d, sales AS cp_sales, revenue_brl AS cp_rev,
             NULL::bigint AS rt_sales, NULL::numeric AS rt_rev,
             NULL::bigint AS cb_sales, NULL::numeric AS cb_rev FROM cp_daily
      UNION ALL
      SELECT offer_id, apelido_interno, d, NULL, NULL, sales, revenue_brl, NULL, NULL FROM rt_daily
      UNION ALL
      SELECT offer_id, apelido_interno, d, NULL, NULL, NULL, NULL, sales, revenue_brl FROM cb_vendor_daily
    ) u
    GROUP BY offer_id, apelido_interno, d
  )
  SELECT offer_id, apelido_interno,
    COALESCE(SUM(revenue_brl), 0)::numeric,
    COALESCE(SUM(sales), 0)::int
  FROM max_daily
  GROUP BY offer_id, apelido_interno;
$function$;
