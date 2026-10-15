UPDATE public.sales_data
SET product_name = 'MON'
WHERE order_id LIKE 'rt:%'
  AND store = 'cartpanda'
  AND product_name = 'NDM';