-- Reclassificar eventos RedTrack incorretamente marcados como 'purchase'
-- Critério: purchase com amount=0 NÃO é venda real. É view/lead disfarçado.
-- Tenta inferir o tipo correto pelo offer_name/raw_payload, senão marca como 'event'.

UPDATE public.redtrack_events
SET event_type = CASE
  WHEN LOWER(COALESCE(raw_payload->>'type','')) IN ('presellview','presell_view') THEN 'presell_view'
  WHEN LOWER(COALESCE(raw_payload->>'type','')) IN ('vslview','vsl_view') THEN 'vsl_view'
  WHEN LOWER(COALESCE(raw_payload->>'type','')) = 'lead' THEN 'lead'
  WHEN LOWER(COALESCE(raw_payload->>'type','')) IN ('viewcontent','view_content') THEN 'view_content'
  WHEN LOWER(COALESCE(raw_payload->>'type','')) <> '' THEN LOWER(raw_payload->>'type')
  ELSE 'event'
END
WHERE event_type = 'purchase'
  AND COALESCE(amount, 0) = 0
  AND COALESCE((raw_payload->>'is_transaction')::int, 0) = 0
  AND COALESCE((raw_payload->>'payout')::numeric, 0) = 0;