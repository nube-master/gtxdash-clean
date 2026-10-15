-- Remove test sale (TeleMed/GLP-1) that was incorrectly captured by RedTrack sync
-- This is not a real operation sale; it leaked into RedTrack and was synced as redtrack_unknown

DELETE FROM public.sales_data 
WHERE order_id = 'rt:69ea3bd9ba5a5e1f80028e34';

DELETE FROM public.redtrack_events 
WHERE id = 'f2a3c654-0b93-48d5-ac57-3960fc294119';