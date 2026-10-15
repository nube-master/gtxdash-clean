DELETE FROM public.sales_data
WHERE order_id LIKE 'rt:%'
  AND store = 'cartpanda'
  AND date = CURRENT_DATE
  AND order_id NOT IN (
    'rt:69ea690214a38306f997b02a',
    'rt:69ea57eb02d93f1f368293a5',
    'rt:69e99a15911e97f85d164070'
  );