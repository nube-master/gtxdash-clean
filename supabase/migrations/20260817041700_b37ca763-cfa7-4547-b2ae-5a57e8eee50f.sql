UPDATE public.traffic_data
SET operation_id = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a'
WHERE date BETWEEN '2026-08-01' AND '2026-08-15'
  AND (campaign_name ILIKE '%AURAVITA%' OR campaign_name ILIKE '%Aeterna%' OR campaign_name ILIKE '%HT%' OR campaign_name ILIKE '%[COD]%');