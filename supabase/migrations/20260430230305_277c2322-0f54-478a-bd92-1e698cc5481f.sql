
CREATE OR REPLACE FUNCTION public.get_offers_traffic_stats(p_operation_id uuid DEFAULT NULL)
RETURNS TABLE(
  offer_id uuid,
  apelido_interno text,
  spend_today_brl numeric,
  spend_7d_brl numeric,
  spend_30d_brl numeric,
  accounts_count integer,
  active_campaigns_count integer,
  last_spend_date date
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH today_brt AS (
    SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d
  ),
  offer_traffic AS (
    SELECT
      o.id AS offer_id,
      o.apelido_interno,
      t.account_id,
      t.campaign_name,
      t.date,
      t.spend
    FROM public.offers o
    JOIN public.traffic_data t
      ON t.campaign_name ILIKE '%[' || o.apelido_interno || ']%'
    WHERE t.date >= (SELECT d FROM today_brt) - INTERVAL '30 days'
      AND (p_operation_id IS NULL OR t.operation_id = p_operation_id)
  )
  SELECT
    ot.offer_id,
    ot.apelido_interno,
    COALESCE(SUM(CASE WHEN ot.date = (SELECT d FROM today_brt) THEN ot.spend END), 0)::numeric AS spend_today_brl,
    COALESCE(SUM(CASE WHEN ot.date >= (SELECT d FROM today_brt) - 6 THEN ot.spend END), 0)::numeric AS spend_7d_brl,
    COALESCE(SUM(ot.spend), 0)::numeric AS spend_30d_brl,
    COUNT(DISTINCT ot.account_id)::int AS accounts_count,
    COUNT(DISTINCT CASE WHEN ot.date >= (SELECT d FROM today_brt) - 6 AND ot.spend > 0 THEN ot.campaign_name END)::int AS active_campaigns_count,
    MAX(ot.date) AS last_spend_date
  FROM offer_traffic ot
  GROUP BY ot.offer_id, ot.apelido_interno;
$$;

CREATE OR REPLACE FUNCTION public.get_offer_traffic_daily(p_offer_id uuid, p_operation_id uuid DEFAULT NULL)
RETURNS TABLE(date date, spend_brl numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH today_brt AS (
    SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d
  ),
  o AS (
    SELECT apelido_interno FROM public.offers WHERE id = p_offer_id
  )
  SELECT
    t.date,
    COALESCE(SUM(t.spend), 0)::numeric AS spend_brl
  FROM public.traffic_data t, o
  WHERE t.campaign_name ILIKE '%[' || o.apelido_interno || ']%'
    AND t.date >= (SELECT d FROM today_brt) - INTERVAL '29 days'
    AND t.date <= (SELECT d FROM today_brt)
    AND (p_operation_id IS NULL OR t.operation_id = p_operation_id)
  GROUP BY t.date
  ORDER BY t.date;
$$;
