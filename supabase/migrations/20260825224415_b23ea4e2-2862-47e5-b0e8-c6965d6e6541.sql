DO $mig$
DECLARE d text;
BEGIN
  d := pg_get_functiondef(12182149::oid);
  d := replace(d, '    SELECT t.id, t.account_id, t.campaign_name, t.date, t.spend', '    SELECT t.id, t.account_id, t.campaign_name, t.date, t.spend_brl AS spend');
  d := replace(d, '      AND t.spend > 0', '      AND t.spend_brl > 0');
  EXECUTE d;
  d := pg_get_functiondef(12182150::oid);
  d := replace(d, '  SELECT t.date, COALESCE(SUM(t.spend), 0)::numeric AS spend_brl', '  SELECT t.date, COALESCE(SUM(t.spend_brl), 0)::numeric AS spend_brl');
  EXECUTE d;
  d := pg_get_functiondef(12513118::oid);
  d := replace(d, '      COALESCE(SUM(t.spend), 0)::numeric AS spend_brl,', '      COALESCE(SUM(t.spend_brl), 0)::numeric AS spend_brl,');
  EXECUTE d;
  d := pg_get_functiondef(12716914::oid);
  d := replace(d, '      COALESCE(SUM(t.spend), 0)::numeric AS spend_brl,', '      COALESCE(SUM(t.spend_brl), 0)::numeric AS spend_brl,');
  EXECUTE d;
  d := pg_get_functiondef(12796126::oid);
  d := replace(d, '    SELECT t.campaign_name, t.date, SUM(t.spend) AS spend', '    SELECT t.campaign_name, t.date, SUM(t.spend_brl) AS spend');
  EXECUTE d;
  d := pg_get_functiondef(12799495::oid);
  d := replace(d, '      SUM(t.spend) AS spend, SUM(t.impressions) AS imps, SUM(t.inline_link_clicks) AS clicks', '      SUM(t.spend_brl) AS spend, SUM(t.impressions) AS imps, SUM(t.inline_link_clicks) AS clicks');
  EXECUTE d;
  d := pg_get_functiondef(12809870::oid);
  d := replace(d, '    SELECT o.id AS offer_id, o.apelido_interno, t.account_id, t.campaign_name, t.spend', '    SELECT o.id AS offer_id, o.apelido_interno, t.account_id, t.campaign_name, t.spend_brl AS spend');
  EXECUTE d;
  d := pg_get_functiondef(1288350::oid);
  d := replace(d, '    COALESCE(SUM(t.spend), 0) AS total_spend', '    COALESCE(SUM(t.spend_brl), 0) AS total_spend');
  EXECUTE d;
  d := pg_get_functiondef(1295605::oid);
  d := replace(d, '  SELECT COALESCE(SUM(spend), 0)::NUMERIC', '  SELECT COALESCE(SUM(spend_brl), 0)::NUMERIC');
  EXECUTE d;
  d := pg_get_functiondef(13620144::oid);
  d := replace(d, '    SELECT t.account_id AS acc_id, t.date AS business_date, SUM(t.spend) AS spend', '    SELECT t.account_id AS acc_id, t.date AS business_date, SUM(t.spend_brl) AS spend');
  d := replace(d, '    SELECT h.account_id AS acc_id, h.date AS business_date, SUM(h.spend) AS spend', '    SELECT h.account_id AS acc_id, h.date AS business_date, SUM(h.spend_brl) AS spend');
  EXECUTE d;
  d := pg_get_functiondef(1488804::oid);
  d := replace(d, '    COALESCE(SUM(t.spend), 0) AS total_spend,', '    COALESCE(SUM(t.spend_brl), 0) AS total_spend,');
  EXECUTE d;
  d := pg_get_functiondef(175922681::oid);
  d := replace(d, '      SUM(td.spend) as spend,', '      SUM(td.spend_brl) as spend,');
  EXECUTE d;
  d := pg_get_functiondef(175922682::oid);
  d := replace(d, '      SUM(td.spend) as spend,', '      SUM(td.spend_brl) as spend,');
  EXECUTE d;
  d := pg_get_functiondef(189370057::oid);
  d := replace(d, '        COALESCE(SUM(t.spend), 0)::numeric as total_spend,', '        COALESCE(SUM(t.spend_brl), 0)::numeric as total_spend,');
  EXECUTE d;
  d := pg_get_functiondef(189373838::oid);
  d := replace(d, '            COALESCE(SUM(
                CASE 
                    WHEN COALESCE(acc.currency, ''USD'') = ''USD'' THEN t.spend * v_usd_to_brl
                    WHEN acc.currency = ''EUR'' THEN t.spend * v_eur_to_brl
                    WHEN acc.currency = ''BRL'' THEN t.spend
                    ELSE t.spend * v_usd_to_brl
                END
            ), 0)::NUMERIC as t_spend,', '            COALESCE(SUM(t.spend_brl), 0)::NUMERIC as t_spend,');
  d := replace(d, '            COALESCE(SUM(
                CASE 
                    WHEN COALESCE(acc.currency, ''USD'') = ''USD'' THEN t.spend * v_usd_to_brl
                    WHEN acc.currency = ''EUR'' THEN t.spend * v_eur_to_brl
                    WHEN acc.currency = ''BRL'' THEN t.spend
                    ELSE t.spend * v_usd_to_brl
                END
            ), 0)::NUMERIC as h_spend,', '            COALESCE(SUM(t.spend_brl), 0)::NUMERIC as h_spend,');
  EXECUTE d;
  d := pg_get_functiondef(190206220::oid);
  d := replace(d, '          SUM(td.spend)::numeric AS spend,', '          SUM(td.spend_brl)::numeric AS spend,');
  d := replace(d, '          SUM(td.spend)::numeric AS spend', '          SUM(td.spend_brl)::numeric AS spend');
  EXECUTE d;
  d := pg_get_functiondef(197417032::oid);
  d := replace(d, '            SUM(t.spend) as total_spend,', '            SUM(t.spend_brl) as total_spend,');
  EXECUTE d;
  d := pg_get_functiondef(198152424::oid);
  d := replace(d, '    SELECT td.date as t_date, td.operation_id as t_op_id, SUM(td.spend) as total_spend', '    SELECT td.date as t_date, td.operation_id as t_op_id, SUM(td.spend_brl) as total_spend');
  EXECUTE d;
  d := pg_get_functiondef(198152425::oid);
  d := replace(d, '    SUM(t.spend)::DECIMAL', '    SUM(t.spend_brl)::DECIMAL');
  EXECUTE d;
  d := pg_get_functiondef(198152426::oid);
  d := replace(d, '    COALESCE(SUM(t.spend), 0)::DECIMAL,', '    COALESCE(SUM(t.spend_brl), 0)::DECIMAL,');
  EXECUTE d;
  d := pg_get_functiondef(198152427::oid);
  d := replace(d, '    SUM(t.spend)::DECIMAL', '    SUM(t.spend_brl)::DECIMAL');
  d := replace(d, '  ORDER BY SUM(t.spend) DESC;', '  ORDER BY SUM(t.spend_brl) DESC;');
  EXECUTE d;
  d := pg_get_functiondef(198152429::oid);
  d := replace(d, '    SUM(t.spend)::DECIMAL,', '    SUM(t.spend_brl)::DECIMAL,');
  d := replace(d, '  ORDER BY SUM(t.spend) DESC;', '  ORDER BY SUM(t.spend_brl) DESC;');
  EXECUTE d;
  d := pg_get_functiondef(204516885::oid);
  d := replace(d, '    SELECT SUM(spend * v_fx_rate), SUM(impressions), SUM(clicks) ', '    SELECT SUM(spend_brl), SUM(impressions), SUM(clicks) ');
  EXECUTE d;
  d := pg_get_functiondef(207827164::oid);
  d := replace(d, '            SUM(
                CASE 
                    WHEN COALESCE(a.currency, ''USD'') = ''USD'' THEN t.spend * v_usd_rate
                    WHEN a.currency = ''EUR'' THEN t.spend * v_eur_rate
                    WHEN a.currency = ''BRL'' THEN t.spend
                    ELSE t.spend * v_usd_rate
                END
            ) as invest_brl', '            SUM(t.spend_brl) as invest_brl');
  EXECUTE d;
  d := pg_get_functiondef(225742357::oid);
  d := replace(d, '      COALESCE(SUM(t.spend), 0) AS spend,', '      COALESCE(SUM(t.spend_brl), 0) AS spend,');
  d := replace(d, '      SUM(h.spend) AS hourly_spend', '      SUM(h.spend_brl) AS hourly_spend');
  EXECUTE d;
  d := pg_get_functiondef(26662299::oid);
  d := replace(d, '           SUM(spend)::numeric AS spend,', '           SUM(spend_brl)::numeric AS spend,');
  d := replace(d, '    SELECT account_id, campaign_name, SUM(spend)::numeric AS spend', '    SELECT account_id, campaign_name, SUM(spend_brl)::numeric AS spend');
  EXECUTE d;
  d := pg_get_functiondef(3172156::oid);
  d := replace(d, 'SELECT t.campaign_name, t.date, COALESCE(SUM(t.spend), 0), COALESCE(SUM(t.clicks), 0),', 'SELECT t.campaign_name, t.date, COALESCE(SUM(t.spend_brl), 0), COALESCE(SUM(t.clicks), 0),');
  EXECUTE d;
  d := pg_get_functiondef(3172158::oid);
  d := replace(d, '  SELECT COALESCE(SUM(spend), 0)::NUMERIC', '  SELECT COALESCE(SUM(spend_brl), 0)::NUMERIC');
  EXECUTE d;
  d := pg_get_functiondef(3172159::oid);
  d := replace(d, 'SELECT t.account_id, t.date, COALESCE(SUM(t.spend), 0)', 'SELECT t.account_id, t.date, COALESCE(SUM(t.spend_brl), 0)');
  EXECUTE d;
  d := pg_get_functiondef(3172160::oid);
  d := replace(d, '    COALESCE(SUM(t.spend),0), COALESCE(SUM(t.impressions),0), COALESCE(SUM(t.clicks),0)', '    COALESCE(SUM(t.spend_brl),0), COALESCE(SUM(t.impressions),0), COALESCE(SUM(t.clicks),0)');
  EXECUTE d;
  d := pg_get_functiondef(3172165::oid);
  d := replace(d, 'SELECT t.campaign_name, t.date, SUM(t.spend), SUM(t.clicks), SUM(t.impressions)', 'SELECT t.campaign_name, t.date, SUM(t.spend_brl), SUM(t.clicks), SUM(t.impressions)');
  EXECUTE d;
  d := pg_get_functiondef(3504042::oid);
  d := replace(d, '    COALESCE(SUM(t.spend),0), COALESCE(SUM(t.clicks),0), COALESCE(SUM(t.impressions),0),', '    COALESCE(SUM(t.spend_brl),0), COALESCE(SUM(t.clicks),0), COALESCE(SUM(t.impressions),0),');
  EXECUTE d;
  d := pg_get_functiondef(89033806::oid);
  d := replace(d, '      SUM(td.spend)::numeric AS spend', '      SUM(td.spend_brl)::numeric AS spend');
  EXECUTE d;
  d := pg_get_functiondef(92274367::oid);
  d := replace(d, '    COALESCE(SUM(t.spend), 0),', '    COALESCE(SUM(t.spend_brl), 0),');
  d := replace(d, '    CASE WHEN SUM(t.clicks) > 0 THEN SUM(t.spend) / SUM(t.clicks) ELSE 0 END,', '    CASE WHEN SUM(t.clicks) > 0 THEN SUM(t.spend_brl) / SUM(t.clicks) ELSE 0 END,');
  d := replace(d, '    CASE WHEN SUM(t.impressions) > 0 THEN (SUM(t.spend) / SUM(t.impressions)) * 1000 ELSE 0 END,', '    CASE WHEN SUM(t.impressions) > 0 THEN (SUM(t.spend_brl) / SUM(t.impressions)) * 1000 ELSE 0 END,');
  EXECUTE d;
  d := pg_get_functiondef(924631::oid);
  d := replace(d, '    COALESCE(SUM(t.spend), 0) AS total_spend,', '    COALESCE(SUM(t.spend_brl), 0) AS total_spend,');
  EXECUTE d;
  d := pg_get_functiondef(97771718::oid);
  d := replace(d, '           SUM(spend)::numeric AS spend,', '           SUM(spend_brl)::numeric AS spend,');
  d := replace(d, '    SELECT account_id, campaign_name, SUM(spend)::numeric AS spend', '    SELECT account_id, campaign_name, SUM(spend_brl)::numeric AS spend');
  EXECUTE d;
END
$mig$;