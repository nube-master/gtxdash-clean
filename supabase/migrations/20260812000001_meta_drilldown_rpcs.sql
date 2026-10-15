-- RPC for listing adsets with aggregated metrics
CREATE OR REPLACE FUNCTION public.list_adsets(
    p_start_date DATE,
    p_end_date DATE,
    p_campaign_ids TEXT[] DEFAULT NULL,
    p_operation_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id TEXT,
    name TEXT,
    status TEXT,
    campaign_id TEXT,
    campaign_name TEXT,
    account_id TEXT,
    account_name TEXT,
    orcamento DECIMAL,
    teto DECIMAL,
    gasto DECIMAL,
    pace DECIMAL,
    impressoes BIGINT,
    ctr DECIMAL,
    cpc DECIMAL,
    cpa DECIMAL,
    vendas BIGINT,
    ic BIGINT,
    conv_checkout DECIMAL,
    roas DECIMAL,
    lucro DECIMAL,
    faturamento DECIMAL,
    margem DECIMAL,
    score DECIMAL,
    regras_count INTEGER
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ma.id,
        ma.name,
        ma.effective_status as status,
        ma.campaign_id,
        ma.campaign_name,
        ma.account_id,
        ma.account_name,
        COALESCE(ma.daily_budget, 0) as orcamento,
        COALESCE(ma.bid_amount, 0) as teto,
        COALESCE(SUM(mtd.spend), 0) as gasto,
        0::DECIMAL as pace, -- Placeholder
        COALESCE(SUM(mtd.impressions), 0)::BIGINT as impressoes,
        CASE WHEN SUM(mtd.impressions) > 0 THEN (SUM(mtd.inline_link_clicks)::DECIMAL / SUM(mtd.impressions)) * 100 ELSE 0 END as ctr,
        CASE WHEN SUM(mtd.inline_link_clicks) > 0 THEN SUM(mtd.spend) / SUM(mtd.inline_link_clicks) ELSE 0 END as cpc,
        CASE WHEN COUNT(re.id) > 0 THEN SUM(mtd.spend) / COUNT(re.id) ELSE 0 END as cpa,
        COUNT(re.id)::BIGINT as vendas,
        COALESCE(SUM(mtd.initiate_checkouts), 0)::BIGINT as ic,
        CASE WHEN COALESCE(SUM(mtd.initiate_checkouts), 0) > 0 THEN (COUNT(re.id)::DECIMAL / SUM(mtd.initiate_checkouts)) * 100 ELSE 0 END as conv_checkout,
        CASE WHEN SUM(mtd.spend) > 0 THEN SUM(re.amount_brl) / SUM(mtd.spend) ELSE 0 END as roas,
        COALESCE(SUM(re.amount_brl), 0) - COALESCE(SUM(mtd.spend), 0) as lucro,
        COALESCE(SUM(re.amount_brl), 0) as faturamento,
        CASE WHEN SUM(re.amount_brl) > 0 THEN ((SUM(re.amount_brl) - SUM(mtd.spend)) / SUM(re.amount_brl)) * 100 ELSE 0 END as margem,
        0::DECIMAL as score, -- Placeholder
        0 as regras_count -- Placeholder
    FROM public.meta_adsets ma
    LEFT JOIN public.meta_traffic_data mtd ON ma.id = mtd.adset_id AND mtd.date >= p_start_date AND mtd.date <= p_end_date
    LEFT JOIN public.redtrack_events re ON ma.id = re.adset_id AND re.date >= p_start_date AND re.date <= p_end_date
    WHERE (p_campaign_ids IS NULL OR ma.campaign_id = ANY(p_campaign_ids))
      AND (p_operation_id IS NULL OR ma.operation_id = p_operation_id)
    GROUP BY ma.id, ma.name, ma.effective_status, ma.campaign_id, ma.campaign_name, ma.account_id, ma.account_name, ma.daily_budget, ma.bid_amount;
END;
$$;

-- RPC for listing ads with aggregated metrics
CREATE OR REPLACE FUNCTION public.list_ads(
    p_start_date DATE,
    p_end_date DATE,
    p_adset_ids TEXT[] DEFAULT NULL,
    p_operation_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id TEXT,
    name TEXT,
    hook_name TEXT,
    thumbnail_url TEXT,
    status TEXT,
    adset_id TEXT,
    adset_name TEXT,
    campaign_name TEXT,
    account_name TEXT,
    gasto DECIMAL,
    impressoes BIGINT,
    ctr DECIMAL,
    cpc DECIMAL,
    cpa DECIMAL,
    vendas BIGINT,
    ic BIGINT,
    conv_checkout DECIMAL,
    roas DECIMAL,
    lucro DECIMAL,
    faturamento DECIMAL,
    margem DECIMAL,
    score DECIMAL
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ma.id,
        ma.name,
        ''::TEXT as hook_name, -- Placeholder
        ma.thumbnail_url,
        ma.effective_status as status,
        ma.adset_id,
        ma.adset_name,
        ma.campaign_name,
        ma.account_name,
        COALESCE(SUM(mtd.spend), 0) as gasto,
        COALESCE(SUM(mtd.impressions), 0)::BIGINT as impressoes,
        CASE WHEN SUM(mtd.impressions) > 0 THEN (SUM(mtd.inline_link_clicks)::DECIMAL / SUM(mtd.impressions)) * 100 ELSE 0 END as ctr,
        CASE WHEN SUM(mtd.inline_link_clicks) > 0 THEN SUM(mtd.spend) / SUM(mtd.inline_link_clicks) ELSE 0 END as cpc,
        CASE WHEN COUNT(re.id) > 0 THEN SUM(mtd.spend) / COUNT(re.id) ELSE 0 END as cpa,
        COUNT(re.id)::BIGINT as vendas,
        COALESCE(SUM(mtd.initiate_checkouts), 0)::BIGINT as ic,
        CASE WHEN COALESCE(SUM(mtd.initiate_checkouts), 0) > 0 THEN (COUNT(re.id)::DECIMAL / SUM(mtd.initiate_checkouts)) * 100 ELSE 0 END as conv_checkout,
        CASE WHEN SUM(mtd.spend) > 0 THEN SUM(re.amount_brl) / SUM(mtd.spend) ELSE 0 END as roas,
        COALESCE(SUM(re.amount_brl), 0) - COALESCE(SUM(mtd.spend), 0) as lucro,
        COALESCE(SUM(re.amount_brl), 0) as faturamento,
        CASE WHEN SUM(re.amount_brl) > 0 THEN ((SUM(re.amount_brl) - SUM(mtd.spend)) / SUM(re.amount_brl)) * 100 ELSE 0 END as margem,
        0::DECIMAL as score -- Placeholder
    FROM public.meta_ads ma
    LEFT JOIN public.meta_traffic_data mtd ON ma.id = mtd.ad_id AND mtd.date >= p_start_date AND mtd.date <= p_end_date
    LEFT JOIN public.redtrack_events re ON ma.id = re.ad_id AND re.date >= p_start_date AND re.date <= p_end_date
    WHERE (p_adset_ids IS NULL OR ma.adset_id = ANY(p_adset_ids))
      AND (p_operation_id IS NULL OR ma.operation_id = p_operation_id)
    GROUP BY ma.id, ma.name, ma.thumbnail_url, ma.effective_status, ma.adset_id, ma.adset_name, ma.campaign_name, ma.account_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_adsets(DATE, DATE, TEXT[], UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_ads(DATE, DATE, TEXT[], UUID) TO authenticated;
