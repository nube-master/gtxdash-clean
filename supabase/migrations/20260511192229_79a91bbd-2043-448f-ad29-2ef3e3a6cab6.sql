CREATE OR REPLACE FUNCTION public.get_offers_traffic_stats(p_operation_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(offer_id uuid, apelido_interno text, spend_today_brl numeric, spend_7d_brl numeric, spend_30d_brl numeric, accounts_count integer, active_campaigns_count integer, last_spend_date date)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH today_brt AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d),
  traffic_recent AS (
    SELECT t.id, t.account_id, t.campaign_name, t.date, t.spend
    FROM public.traffic_data t
    WHERE t.date >= ((now() AT TIME ZONE 'America/Sao_Paulo')::date - INTERVAL '30 days')
      AND t.spend > 0
      AND (p_operation_id IS NULL OR t.operation_id = p_operation_id)
  ),
  traffic_tagged AS (
    SELECT tr.id, tr.account_id, tr.campaign_name, tr.date, tr.spend,
           upper(m[1]) AS tag
    FROM traffic_recent tr,
         LATERAL regexp_matches(tr.campaign_name, '\[([^\]]+)\]', 'g') AS m
  ),
  -- Dedupe por (offer, traffic_data.id real) — evita perder ads distintos
  -- que coincidentemente tinham mesmo (account, campaign, date, spend).
  offer_traffic AS (
    SELECT DISTINCT ON (o.id, tt.id)
      o.id AS offer_id, o.apelido_interno,
      tt.id, tt.account_id, tt.campaign_name, tt.date, tt.spend
    FROM public.offers o
    JOIN traffic_tagged tt ON tt.tag = upper(o.apelido_interno)
  )
  SELECT
    ot.offer_id, ot.apelido_interno,
    COALESCE(SUM(CASE WHEN ot.date = (SELECT d FROM today_brt) THEN ot.spend END), 0)::numeric,
    COALESCE(SUM(CASE WHEN ot.date >= (SELECT d FROM today_brt) - 6 THEN ot.spend END), 0)::numeric,
    COALESCE(SUM(ot.spend), 0)::numeric,
    COUNT(DISTINCT ot.account_id)::int,
    COUNT(DISTINCT CASE WHEN ot.date >= (SELECT d FROM today_brt) - 6 AND ot.spend > 0 THEN ot.campaign_name END)::int,
    MAX(ot.date)
  FROM offer_traffic ot
  GROUP BY ot.offer_id, ot.apelido_interno;
$function$;