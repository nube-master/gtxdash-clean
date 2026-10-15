UPDATE public.media_channels
SET spend_source = 'newsbreak_api', updated_at = now()
WHERE slug = 'newsbreak';