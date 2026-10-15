INSERT INTO public.media_channels (operation_id, name, slug, color, icon, rt_source_patterns, utm_source_patterns, campaign_name_patterns, spend_source, revenue_source, is_active, sort_order)
SELECT '8707b3f8-ab41-4a63-902c-9ab97fe50c8a'::uuid, name, slug, color, icon, rt_source_patterns, utm_source_patterns, campaign_name_patterns, spend_source, revenue_source, is_active, sort_order
FROM public.media_channels
WHERE operation_id = '0b758a2b-1b92-4769-b47b-416c567e320d'
AND NOT EXISTS (
  SELECT 1 FROM public.media_channels m2
  WHERE m2.operation_id = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a'
    AND m2.slug = media_channels.slug
);