-- Remove backfill sintético agora que o polling real da API RedTrack está ativo
DELETE FROM public.redtrack_conversions
WHERE operation_id = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a'
  AND (rt_id LIKE 'ext_fahto_%' OR clickid LIKE 'rt_fahto_%');