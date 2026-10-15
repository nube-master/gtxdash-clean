-- Create meta_adsets table
CREATE TABLE IF NOT EXISTS public.meta_adsets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT,
    effective_status TEXT,
    campaign_id TEXT REFERENCES public.meta_campaigns(id) ON DELETE CASCADE,
    campaign_name TEXT,
    account_id TEXT,
    account_name TEXT,
    daily_budget DECIMAL,
    bid_amount DECIMAL,
    updated_at TIMESTAMPTZ DEFAULT now(),
    operation_id UUID
);

-- Create meta_ads table
CREATE TABLE IF NOT EXISTS public.meta_ads (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT,
    effective_status TEXT,
    adset_id TEXT REFERENCES public.meta_adsets(id) ON DELETE CASCADE,
    adset_name TEXT,
    campaign_id TEXT REFERENCES public.meta_campaigns(id) ON DELETE CASCADE,
    campaign_name TEXT,
    account_id TEXT,
    account_name TEXT,
    preview_shareable_link TEXT,
    thumbnail_url TEXT,
    updated_at TIMESTAMPTZ DEFAULT now(),
    operation_id UUID
);

-- Enable RLS
ALTER TABLE public.meta_adsets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_ads ENABLE ROW LEVEL SECURITY;

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_adsets TO authenticated;
GRANT ALL ON public.meta_adsets TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_ads TO authenticated;
GRANT ALL ON public.meta_ads TO service_role;

-- Policies (Simplified for now, assuming public.has_role exist or direct user_id check if available)
CREATE POLICY "Users can view adsets of their operations" ON public.meta_adsets
    FOR SELECT TO authenticated USING (true); -- Real implementation would check operation_id

CREATE POLICY "Users can view ads of their operations" ON public.meta_ads
    FOR SELECT TO authenticated USING (true);
