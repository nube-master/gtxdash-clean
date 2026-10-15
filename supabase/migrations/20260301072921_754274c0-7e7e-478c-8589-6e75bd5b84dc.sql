
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_traffic_spend_by_account AS
SELECT
  account_id,
  date,
  SUM(spend) AS total_spend,
  SUM(impressions) AS total_impressions,
  SUM(clicks) AS total_clicks
FROM traffic_data
GROUP BY account_id, date
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_traffic_spend_account_date
ON mv_traffic_spend_by_account (account_id, date);
