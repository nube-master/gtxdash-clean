UPDATE public.redtrack_events
SET amount = 240, updated_at = now()
WHERE event_type = 'purchase'
  AND redtrack_id LIKE 'reconcile-2026-03-14-receipt-%'
  AND amount = 235
  AND (
    upper(concat_ws(' ', coalesce(utm_campaign,''), coalesce(offer_name,''), coalesce(product_name,''))) ~ '(\[NDM\]|\mNDM\M|NEURODYNE)'
    OR coalesce(product_name,'') = 'NDM'
  );