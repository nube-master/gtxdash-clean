
-- Function to get hourly sales aggregated by account for timezone analysis
-- Uses meta_campaign_status to map UTM campaign → account_id
CREATE OR REPLACE FUNCTION public.get_hourly_sales_by_account(
  p_start_date date,
  p_end_date date,
  p_operation_id uuid DEFAULT NULL
)
RETURNS TABLE(account_id text, hour int, total_revenue numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH sale_hours AS (
    -- CartPanda / sales_data: extract hour, join to campaign_status for account
    SELECT
      mcs.account_id,
      EXTRACT(HOUR FROM s.created_at AT TIME ZONE 'America/Sao_Paulo')::int AS hour,
      s.revenue
    FROM sales_data s
    JOIN meta_campaign_status mcs ON lower(trim(s.utm_campaign)) = lower(trim(mcs.campaign_name))
    WHERE s.date >= p_start_date
      AND s.date <= p_end_date
      AND s.status = 'approved'
      AND (p_operation_id IS NULL OR s.operation_id = p_operation_id)

    UNION ALL

    -- RedTrack events
    SELECT
      mcs.account_id,
      EXTRACT(HOUR FROM r.occurred_at AT TIME ZONE 'America/Sao_Paulo')::int AS hour,
      r.amount AS revenue
    FROM redtrack_events r
    JOIN meta_campaign_status mcs ON lower(trim(r.utm_campaign)) = lower(trim(mcs.campaign_name))
    WHERE r.event_type IN ('purchase', 'upsell')
      AND r.occurred_at >= (p_start_date::text || 'T03:00:00Z')::timestamptz
      AND r.occurred_at < ((p_end_date + interval '1 day')::date::text || 'T03:00:00Z')::timestamptz
      AND (p_operation_id IS NULL OR r.operation_id = p_operation_id)
  )
  SELECT
    sh.account_id,
    sh.hour,
    COALESCE(SUM(sh.revenue), 0) AS total_revenue
  FROM sale_hours sh
  GROUP BY sh.account_id, sh.hour;
$$;
