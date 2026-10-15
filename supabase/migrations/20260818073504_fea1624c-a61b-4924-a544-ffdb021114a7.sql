INSERT INTO public.meta_accounts (account_id, name, operation_id, status, active)
SELECT DISTINCT 
  CASE WHEN account_id LIKE 'act_%' THEN account_id ELSE 'act_' || account_id END as account_id,
  account_name as name,
  operation_id,
  'ACTIVE' as status,
  true as active
FROM public.meta_ad_accounts
WHERE operation_id = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a'
ON CONFLICT (account_id) DO UPDATE SET 
  operation_id = EXCLUDED.operation_id,
  name = EXCLUDED.name;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_accounts TO authenticated;
GRANT ALL ON public.meta_accounts TO service_role;