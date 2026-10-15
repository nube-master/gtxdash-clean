INSERT INTO public.media_channels (
  operation_id, name, slug, color, icon, spend_source, revenue_source, sort_order, is_active, rt_source_patterns
) VALUES (
  '0b758a2b-1b92-4769-b47b-416c567e320d', 
  'Taboola Ads', 
  'taboola', 
  '#FF5B00', 
  'Trello', 
  'taboola_api', 
  'sales_data', 
  4, 
  true, 
  '{"taboola"}'
) ON CONFLICT (operation_id, slug) DO UPDATE SET is_active = true;