-- Remove vendas NewsBreak com revenue=0 (eventos RedTrack sem valor; ClickBank IPN é a fonte autoritativa)
DELETE FROM public.sales_data
WHERE store = 'newsbreak' AND revenue = 0;