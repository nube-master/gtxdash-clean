
-- Table for specialized Meta Ads country insights with strict deduplication
CREATE TABLE public.meta_country_insights (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    date DATE NOT NULL,
    operation_id UUID REFERENCES public.operations(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL,
    campaign_id TEXT NOT NULL,
    campaign_name TEXT NOT NULL,
    country_code TEXT NOT NULL,
    spend NUMERIC NOT NULL DEFAULT 0,
    impressions BIGINT NOT NULL DEFAULT 0,
    clicks BIGINT NOT NULL DEFAULT 0,
    link_clicks BIGINT NOT NULL DEFAULT 0,
    lp_views BIGINT NOT NULL DEFAULT 0,
    initiate_checkouts BIGINT NOT NULL DEFAULT 0,
    purchases BIGINT NOT NULL DEFAULT 0,
    revenue NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint for idempotency
CREATE UNIQUE INDEX idx_meta_country_insights_unique ON public.meta_country_insights (
    date, operation_id, account_id, campaign_id, country_code
);

-- Indexes
CREATE INDEX idx_meta_country_insights_date_op ON public.meta_country_insights (date, operation_id);
CREATE INDEX idx_meta_country_insights_country ON public.meta_country_insights (country_code);

-- Permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_country_insights TO authenticated;
GRANT ALL ON public.meta_country_insights TO service_role;

-- RLS
ALTER TABLE public.meta_country_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view insights for their operations"
    ON public.meta_country_insights
    FOR SELECT
    TO authenticated
    USING (public._op_scope_check(operation_id));

-- Trigger for updated_at (check if function exists first)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
        CREATE FUNCTION public.update_updated_at_column()
        RETURNS TRIGGER AS $func$
        BEGIN
            NEW.updated_at = now();
            RETURN NEW;
        END;
        $func$ language 'plpgsql';
    END IF;
END $$;

CREATE TRIGGER update_meta_country_insights_updated_at
    BEFORE UPDATE ON public.meta_country_insights
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- RPC for aggregated country performance
CREATE OR REPLACE FUNCTION public.get_country_performance(
    p_operation_id UUID,
    p_start_date DATE,
    p_end_date DATE,
    p_min_spend NUMERIC DEFAULT 0
)
RETURNS TABLE (
    country_code TEXT,
    total_spend NUMERIC,
    total_impressions BIGINT,
    total_clicks BIGINT,
    total_link_clicks BIGINT,
    total_lp_views BIGINT,
    total_ics BIGINT,
    total_purchases BIGINT,
    total_revenue NUMERIC,
    roas NUMERIC,
    cpc NUMERIC,
    cpa NUMERIC,
    connect_rate NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        mci.country_code,
        COALESCE(SUM(mci.spend), 0) as total_spend,
        COALESCE(SUM(mci.impressions), 0) as total_impressions,
        COALESCE(SUM(mci.clicks), 0) as total_clicks,
        COALESCE(SUM(mci.link_clicks), 0) as total_link_clicks,
        COALESCE(SUM(mci.lp_views), 0) as total_lp_views,
        COALESCE(SUM(mci.initiate_checkouts), 0) as total_ics,
        COALESCE(SUM(mci.purchases), 0) as total_purchases,
        COALESCE(SUM(mci.revenue), 0) as total_revenue,
        CASE WHEN SUM(mci.spend) > 0 THEN SUM(mci.revenue) / SUM(mci.spend) ELSE 0 END as roas,
        CASE WHEN SUM(mci.link_clicks) > 0 THEN SUM(mci.spend) / SUM(mci.link_clicks) ELSE 0 END as cpc,
        CASE WHEN SUM(mci.purchases) > 0 THEN SUM(mci.spend) / SUM(mci.purchases) ELSE 0 END as cpa,
        CASE WHEN SUM(mci.link_clicks) > 0 THEN (SUM(mci.lp_views)::numeric / NULLIF(SUM(mci.link_clicks), 0)) * 100 ELSE 0 END as connect_rate
    FROM
        public.meta_country_insights mci
    WHERE
        mci.operation_id = p_operation_id
        AND mci.date >= p_start_date
        AND mci.date <= p_end_date
    GROUP BY
        mci.country_code
    HAVING
        SUM(mci.spend) >= p_min_spend
    ORDER BY
        total_spend DESC;
END;
$$;
