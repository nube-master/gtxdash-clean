
ALTER TABLE public.operations
ADD COLUMN IF NOT EXISTS enabled_features jsonb NOT NULL DEFAULT '["academy", "jarvis"]'::jsonb;

-- GTX Mídia keeps everything enabled (already matches default)
-- New operations will get academy + jarvis by default, admin can toggle them off
