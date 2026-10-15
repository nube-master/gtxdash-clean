UPDATE public.app_settings 
SET value = jsonb_set(
  value::jsonb, 
  '{}',
  (
    SELECT jsonb_agg(
      CASE 
        WHEN elem->>'id' = 'ailula' 
        THEN jsonb_set(elem, '{id}', '"crt"')
        ELSE elem 
      END
    )
    FROM jsonb_array_elements(value::jsonb) AS elem
  )
)
WHERE key = 'clickbank_vendors';