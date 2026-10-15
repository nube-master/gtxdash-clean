DELETE FROM public.sales_data
WHERE order_id LIKE 'rt:%'
  AND store = 'cartpanda'
  AND revenue = 0;