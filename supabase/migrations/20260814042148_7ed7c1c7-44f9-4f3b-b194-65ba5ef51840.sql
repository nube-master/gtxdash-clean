
CREATE TABLE IF NOT EXISTS public.taboola_ad_accounts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    operation_id uuid NOT NULL REFERENCES public.operations(id) ON DELETE CASCADE,
    account_id text NOT NULL, -- Taboola account_id (e.g. 'ndm-principal')
    account_name text,
    client_id text NOT NULL,
    client_secret text NOT NULL,
    is_active boolean DEFAULT true,
    last_sync_at timestamptz,
    last_sync_status text,
    last_sync_error text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(operation_id, account_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.taboola_ad_accounts TO authenticated;
GRANT ALL ON public.taboola_ad_accounts TO service_role;

ALTER TABLE public.taboola_ad_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their operation taboola accounts"
ON public.taboola_ad_accounts
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.taboola_traffic_data (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    operation_id uuid NOT NULL REFERENCES public.operations(id) ON DELETE CASCADE,
    date date NOT NULL,
    account_id text NOT NULL,
    campaign_id text NOT NULL,
    campaign_name text,
    spend numeric(12,2) DEFAULT 0,
    impressions bigint DEFAULT 0,
    clicks bigint DEFAULT 0,
    ctr numeric(10,4) DEFAULT 0,
    cpc numeric(12,4) DEFAULT 0,
    cpm numeric(12,4) DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    UNIQUE(date, operation_id, account_id, campaign_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.taboola_traffic_data TO authenticated;
GRANT ALL ON public.taboola_traffic_data TO service_role;

ALTER TABLE public.taboola_traffic_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their operation taboola traffic"
ON public.taboola_traffic_data
FOR SELECT
TO authenticated
USING (true); -- Simplified for now, or based on authenticated
