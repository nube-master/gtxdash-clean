ALTER TABLE public.meta_ad_accounts
  DROP COLUMN IF EXISTS rent_monthly_brl,
  DROP COLUMN IF EXISTS tax_br_pct,
  DROP COLUMN IF EXISTS rent_active_from,
  DROP COLUMN IF EXISTS rent_active_to;

DROP FUNCTION IF EXISTS public.get_traffic_infra_cost(uuid, date, date);