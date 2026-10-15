CREATE OR REPLACE FUNCTION public.get_cb_creative_sales(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(campaign_name text, revenue_brl numeric, receipt text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  IF p_operation_id IS NULL THEN
    IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  ELSE
    IF NOT (public.is_super_admin(auth.uid()) OR EXISTS(SELECT 1 FROM public.operation_members WHERE user_id=auth.uid() AND operation_id=p_operation_id AND status='active')) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN QUERY
  SELECT mcs.campaign_name, cb.amount_brl, cb.receipt
  FROM clickbank_audit cb
  JOIN meta_campaign_status mcs ON cb.aff_sub2 = mcs.campaign_id
  WHERE cb.date >= p_start_date AND cb.date <= p_end_date
    AND cb.transaction_type = 'SALE' AND cb.amount_usd BETWEEN 200 AND 260
    AND (p_operation_id IS NULL OR cb.operation_id = p_operation_id);
END; $fn$;

CREATE OR REPLACE FUNCTION public.get_cb_creative_sales_daily(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(date date, campaign_name text, revenue_brl numeric, receipt text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  IF p_operation_id IS NULL THEN
    IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  ELSE
    IF NOT (public.is_super_admin(auth.uid()) OR EXISTS(SELECT 1 FROM public.operation_members WHERE user_id=auth.uid() AND operation_id=p_operation_id AND status='active')) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN QUERY
  SELECT cb.date, mcs.campaign_name, cb.amount_brl, cb.receipt
  FROM clickbank_audit cb
  JOIN meta_campaign_status mcs ON cb.aff_sub2 = mcs.campaign_id
  WHERE cb.date >= p_start_date AND cb.date <= p_end_date
    AND cb.transaction_type = 'SALE' AND cb.amount_usd BETWEEN 180 AND 250
    AND (p_operation_id IS NULL OR cb.operation_id = p_operation_id);
END; $fn$;

CREATE OR REPLACE FUNCTION public.get_creative_traffic_aggregated(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(account_id text, campaign_name text, ad_name text, status text, total_spend numeric, total_clicks bigint, total_impressions bigint, total_video_3s_views bigint, total_video_25_percent bigint, total_video_50_percent bigint, total_video_75_percent bigint, total_video_100_percent bigint, total_thruplays bigint, total_inline_link_clicks bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  IF p_operation_id IS NULL THEN
    IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  ELSE
    IF NOT (public.is_super_admin(auth.uid()) OR EXISTS(SELECT 1 FROM public.operation_members WHERE user_id=auth.uid() AND operation_id=p_operation_id AND status='active')) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN QUERY
  SELECT t.account_id, t.campaign_name, t.ad_name, MAX(t.status) AS status,
    COALESCE(SUM(t.spend),0), COALESCE(SUM(t.clicks),0), COALESCE(SUM(t.impressions),0),
    COALESCE(SUM(t.video_3s_views),0), COALESCE(SUM(t.video_25_percent),0),
    COALESCE(SUM(t.video_50_percent),0), COALESCE(SUM(t.video_75_percent),0),
    COALESCE(SUM(t.video_100_percent),0), COALESCE(SUM(t.thruplays),0),
    COALESCE(SUM(t.inline_link_clicks),0)
  FROM public.traffic_data t
  WHERE t.date >= p_start_date AND t.date <= p_end_date
    AND (p_operation_id IS NULL OR t.operation_id = p_operation_id)
  GROUP BY t.account_id, t.campaign_name, t.ad_name;
END; $fn$;

CREATE OR REPLACE FUNCTION public.get_hourly_sales_by_account(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(account_id text, hour integer, total_revenue numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  IF p_operation_id IS NULL THEN
    IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  ELSE
    IF NOT (public.is_super_admin(auth.uid()) OR EXISTS(SELECT 1 FROM public.operation_members WHERE user_id=auth.uid() AND operation_id=p_operation_id AND status='active')) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN QUERY
  WITH sale_hours AS (
    SELECT mcs.account_id, EXTRACT(HOUR FROM s.created_at AT TIME ZONE 'America/Sao_Paulo')::int AS hour, s.revenue
    FROM sales_data s JOIN meta_campaign_status mcs ON lower(trim(s.utm_campaign)) = lower(trim(mcs.campaign_name))
    WHERE s.date >= p_start_date AND s.date <= p_end_date AND s.status='approved'
      AND (p_operation_id IS NULL OR s.operation_id = p_operation_id)
    UNION ALL
    SELECT mcs.account_id, EXTRACT(HOUR FROM r.occurred_at AT TIME ZONE 'America/Sao_Paulo')::int AS hour, r.amount
    FROM redtrack_events r JOIN meta_campaign_status mcs ON lower(trim(r.utm_campaign)) = lower(trim(mcs.campaign_name))
    WHERE r.event_type IN ('purchase','upsell')
      AND r.occurred_at >= (p_start_date::text || 'T03:00:00Z')::timestamptz
      AND r.occurred_at < ((p_end_date + interval '1 day')::date::text || 'T03:00:00Z')::timestamptz
      AND (p_operation_id IS NULL OR r.operation_id = p_operation_id)
  )
  SELECT sh.account_id, sh.hour, COALESCE(SUM(sh.revenue),0) FROM sale_hours sh GROUP BY sh.account_id, sh.hour;
END; $fn$;

CREATE OR REPLACE FUNCTION public.get_leaderboard_cb_sales(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(campaign_name text, revenue_brl numeric, receipt text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  IF p_operation_id IS NULL THEN
    IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  ELSE
    IF NOT (public.is_super_admin(auth.uid()) OR EXISTS(SELECT 1 FROM public.operation_members WHERE user_id=auth.uid() AND operation_id=p_operation_id AND status='active')) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN QUERY
  SELECT mcs.campaign_name, cb.amount_brl, cb.receipt
  FROM clickbank_audit cb JOIN meta_campaign_status mcs ON cb.aff_sub2 = mcs.campaign_id
  WHERE cb.date >= p_start_date AND cb.date <= p_end_date
    AND cb.transaction_type='SALE' AND cb.amount_usd BETWEEN 180 AND 250
    AND (p_operation_id IS NULL OR cb.operation_id = p_operation_id);
END; $fn$;

CREATE OR REPLACE FUNCTION public.get_leaderboard_redtrack(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(utm_campaign text, event_type text, total_revenue numeric, sale_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  IF p_operation_id IS NULL THEN
    IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  ELSE
    IF NOT (public.is_super_admin(auth.uid()) OR EXISTS(SELECT 1 FROM public.operation_members WHERE user_id=auth.uid() AND operation_id=p_operation_id AND status='active')) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN QUERY
  SELECT r.utm_campaign, r.event_type, COALESCE(SUM(r.amount),0), COUNT(*)::bigint
  FROM public.redtrack_events r
  WHERE r.event_type IN ('purchase','upsell')
    AND r.occurred_at >= (p_start_date::TEXT || 'T03:00:00Z')::TIMESTAMPTZ
    AND r.occurred_at < ((p_end_date + INTERVAL '1 day')::DATE::TEXT || 'T03:00:00Z')::TIMESTAMPTZ
    AND (p_operation_id IS NULL OR r.operation_id = p_operation_id)
  GROUP BY r.utm_campaign, r.event_type;
END; $fn$;

CREATE OR REPLACE FUNCTION public.get_leaderboard_sales(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(utm_campaign text, total_revenue numeric, sale_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  IF p_operation_id IS NULL THEN
    IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  ELSE
    IF NOT (public.is_super_admin(auth.uid()) OR EXISTS(SELECT 1 FROM public.operation_members WHERE user_id=auth.uid() AND operation_id=p_operation_id AND status='active')) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN QUERY
  SELECT s.utm_campaign, COALESCE(SUM(s.revenue),0), COUNT(*)::bigint
  FROM public.sales_data s
  WHERE s.date >= p_start_date AND s.date <= p_end_date AND s.status='approved'
    AND (p_operation_id IS NULL OR s.operation_id = p_operation_id)
  GROUP BY s.utm_campaign;
END; $fn$;

CREATE OR REPLACE FUNCTION public.get_leaderboard_traffic(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(campaign_name text, ad_name text, account_id text, total_spend numeric, total_impressions bigint, total_clicks bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  IF p_operation_id IS NULL THEN
    IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  ELSE
    IF NOT (public.is_super_admin(auth.uid()) OR EXISTS(SELECT 1 FROM public.operation_members WHERE user_id=auth.uid() AND operation_id=p_operation_id AND status='active')) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN QUERY
  SELECT t.campaign_name, t.ad_name, t.account_id,
    COALESCE(SUM(t.spend),0), COALESCE(SUM(t.impressions),0), COALESCE(SUM(t.clicks),0)
  FROM public.traffic_data t
  WHERE t.date >= p_start_date AND t.date <= p_end_date
    AND (p_operation_id IS NULL OR t.operation_id = p_operation_id)
  GROUP BY t.campaign_name, t.ad_name, t.account_id;
END; $fn$;