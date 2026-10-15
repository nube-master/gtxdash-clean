CREATE OR REPLACE FUNCTION public.get_offers_traffic_stats(p_operation_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(offer_id uuid, apelido_interno text, spend_today_brl numeric, spend_7d_brl numeric, spend_30d_brl numeric, accounts_count integer, active_campaigns_count integer, last_spend_date date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH today_brt AS (
    SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d
  ),
  traffic_recent AS (
    SELECT t.account_id, t.campaign_name, t.date, t.spend,
           upper((regexp_match(t.campaign_name, '\[([^\]]+)\]\s*\[([^\]]+)\]\s*\[([^\]]+)\]'))[3]) AS tag3,
           upper((regexp_match(t.campaign_name, '\[([^\]]+)\]\s*\[([^\]]+)\]'))[2]) AS tag2,
           upper((regexp_match(t.campaign_name, '\[([^\]]+)\]'))[1]) AS tag1
    FROM public.traffic_data t
    WHERE t.date >= ((now() AT TIME ZONE 'America/Sao_Paulo')::date - INTERVAL '30 days')
      AND t.spend > 0
      AND (p_operation_id IS NULL OR t.operation_id = p_operation_id)
  ),
  traffic_tagged AS (
    SELECT account_id, campaign_name, date, spend,
           unnest(ARRAY[tag1, tag2, tag3]) AS tag
    FROM traffic_recent
  ),
  offer_traffic AS (
    SELECT DISTINCT ON (o.id, tt.campaign_name, tt.date, tt.account_id, tt.spend)
      o.id AS offer_id, o.apelido_interno,
      tt.account_id, tt.campaign_name, tt.date, tt.spend
    FROM public.offers o
    JOIN traffic_tagged tt ON tt.tag = upper(o.apelido_interno)
  )
  SELECT
    ot.offer_id,
    ot.apelido_interno,
    COALESCE(SUM(CASE WHEN ot.date = (SELECT d FROM today_brt) THEN ot.spend END), 0)::numeric,
    COALESCE(SUM(CASE WHEN ot.date >= (SELECT d FROM today_brt) - 6 THEN ot.spend END), 0)::numeric,
    COALESCE(SUM(ot.spend), 0)::numeric,
    COUNT(DISTINCT ot.account_id)::int,
    COUNT(DISTINCT CASE WHEN ot.date >= (SELECT d FROM today_brt) - 6 AND ot.spend > 0 THEN ot.campaign_name END)::int,
    MAX(ot.date)
  FROM offer_traffic ot
  GROUP BY ot.offer_id, ot.apelido_interno;
$function$;