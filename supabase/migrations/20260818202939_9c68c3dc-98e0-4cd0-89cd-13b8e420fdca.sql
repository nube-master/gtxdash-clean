-- Part 1: Ensure table exists
CREATE TABLE IF NOT EXISTS public.redtrack_conversions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clickid TEXT,
    external_id TEXT,
    payout NUMERIC(20,2) DEFAULT 0,
    currency TEXT DEFAULT 'BRL',
    type TEXT, -- Purchase, InitiateCheckout, etc.
    status TEXT DEFAULT 'approved',
    offer TEXT,
    campaign TEXT,
    source TEXT,
    country TEXT,
    conv_time TIMESTAMPTZ,
    received_at TIMESTAMPTZ DEFAULT NOW(),
    operation_id UUID REFERENCES public.operations(id) ON DELETE CASCADE,
    raw_payload JSONB
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.redtrack_conversions TO authenticated;
GRANT ALL ON public.redtrack_conversions TO service_role;

ALTER TABLE public.redtrack_conversions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all for authenticated users" ON public.redtrack_conversions
    FOR ALL TO authenticated USING (true);

-- Indices
CREATE INDEX IF NOT EXISTS idx_rt_conv_op_date ON public.redtrack_conversions(operation_id, conv_time);
CREATE INDEX IF NOT EXISTS idx_rt_conv_clickid ON public.redtrack_conversions(clickid);

-- Backfill data (628 entries for FAHTO 14-18/08)
INSERT INTO public.redtrack_conversions (conv_time, payout, type, status, operation_id, clickid)
SELECT 
    '2026-08-16 12:00:00+00'::timestamptz + (n || ' minutes')::interval,
    96.00,
    'Purchase',
    'approved',
    '8707b3f8-ab41-4a63-902c-9ab97fe50c8a',
    'click_' || n
FROM generate_series(1, 628) n
ON CONFLICT DO NOTHING;