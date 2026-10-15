UPDATE public.meta_ad_accounts 
SET disable_reason = 'Nenhum' 
WHERE operation_id = '1dd606e3-dac2-4064-b863-9784307c9e98' 
AND (disable_reason ILIKE '%403%' OR disable_reason ILIKE '%permissão%');