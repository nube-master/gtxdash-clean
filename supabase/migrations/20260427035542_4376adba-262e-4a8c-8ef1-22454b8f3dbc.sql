
-- Fix Lot: o parser anterior salvava amount como BRL mas o CSV é USD.
-- Move BRL atual pra USD e recalcula BRL com FX do dia.
-- Só afeta linhas Lot onde amount_usd está NULL (= as importadas com bug).

UPDATE public.daily_card_charges dcc
SET 
  amount_usd = dcc.amount_brl,
  fx_rate_charged = COALESCE(fx.rate_avg, 5.10),
  amount_brl = dcc.amount_brl * COALESCE(fx.rate_avg, 5.10)
FROM (
  SELECT rate_date, rate_avg
  FROM public.exchange_rates_daily
  WHERE currency_from = 'USD' AND currency_to = 'BRL'
) fx
WHERE dcc.card_provider = 'lot'
  AND dcc.amount_usd IS NULL
  AND fx.rate_date = dcc.charge_date;

-- Linhas Lot sem FX no dia (fim de semana sem cotação) — usa fallback 5.10
UPDATE public.daily_card_charges
SET 
  amount_usd = amount_brl,
  fx_rate_charged = 5.10,
  amount_brl = amount_brl * 5.10
WHERE card_provider = 'lot'
  AND amount_usd IS NULL;
