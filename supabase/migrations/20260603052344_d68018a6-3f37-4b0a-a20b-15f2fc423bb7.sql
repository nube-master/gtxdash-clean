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
  offer_traffic AS (
    SELECT DISTINCT ON (o.id, tt.id)
      o.id AS offer_id, o.apelido_interno,
      tt.id, tt.account_id, tt.campaign_name, tt.date, tt.spend
    FROM public.offers o
    JOIN traffic_tagged tt ON tt.tag = upper(o.apelido_interno)
  ),
  -- "Agora" = últimas 24h (hoje + ontem BRT) com spend > 0
  active_now AS (
    SELECT offer_id,
           COUNT(DISTINCT campaign_name)::int AS active_now_count,
           COUNT(DISTINCT account_id)::int   AS accounts_now_count
    FROM offer_traffic
    WHERE date >= (SELECT d FROM today_brt) - 1
    GROUP BY offer_id
  )
  SELECT
    ot.offer_id, ot.apelido_interno,
    COALESCE(SUM(CASE WHEN ot.date = (SELECT d FROM today_brt) THEN ot.spend END), 0)::numeric,
    COALESCE(SUM(CASE WHEN ot.date >= (SELECT d FROM today_brt) - 6 THEN ot.spend END), 0)::numeric,
    COALESCE(SUM(ot.spend), 0)::numeric,
    COALESCE((SELECT accounts_now_count FROM active_now an WHERE an.offer_id = ot.offer_id), 0)::int,
    COALESCE((SELECT active_now_count   FROM active_now an WHERE an.offer_id = ot.offer_id), 0)::int,
    MAX(ot.date)
  FROM offer_traffic ot
  GROUP BY ot.offer_id, ot.apelido_interno;
$function$;