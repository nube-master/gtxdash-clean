ALTER TABLE public.meta_ad_accounts
  ADD COLUMN IF NOT EXISTS rent_monthly_brl numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_br_pct numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rent_active_from date,
  ADD COLUMN IF NOT EXISTS rent_active_to date;

ALTER TABLE public.space_commission_config
  ADD COLUMN IF NOT EXISTS includes_traffic_infra boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.get_traffic_infra_cost(
  p_operation_id uuid,
  p_start date,
  p_end date
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH acc AS (
    SELECT
      a.id,
      a.rent_monthly_brl,
      a.tax_br_pct,
      GREATEST(p_start, COALESCE(a.rent_active_from, p_start)) AS d_from,
      LEAST(p_end, COALESCE(a.rent_active_to, p_end)) AS d_to
    FROM public.meta_ad_accounts a
    WHERE a.operation_id = p_operation_id
      AND a.is_active = true
      AND COALESCE(a.rent_monthly_brl, 0) > 0
  ), calc AS (
    SELECT
      GREATEST(0, (d_to - d_from) + 1) AS days,
      (rent_monthly_brl / 30.0) * (1 + COALESCE(tax_br_pct, 0) / 100.0) AS cost_day
    FROM acc
  )
  SELECT jsonb_build_object(
    'cost', COALESCE(SUM(days * cost_day), 0),
    'accounts', COALESCE(COUNT(*) FILTER (WHERE days > 0), 0),
    'days', GREATEST(0, (p_end - p_start) + 1)
  )
  FROM calc;
$$;

GRANT EXECUTE ON FUNCTION public.get_traffic_infra_cost(uuid, date, date) TO authenticated, service_role;