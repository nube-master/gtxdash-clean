ALTER TABLE public.daily_card_charges
  ADD COLUMN IF NOT EXISTS match_method text;

ALTER TABLE public.daily_card_charges
  DROP CONSTRAINT IF EXISTS daily_card_charges_match_method_check;

ALTER TABLE public.daily_card_charges
  ADD CONSTRAINT daily_card_charges_match_method_check
  CHECK (match_method IS NULL OR match_method = ANY (ARRAY[
    'heuristic_value_date'::text,
    'exact_account_date'::text,
    'manual'::text,
    'mapping'::text,
    'api'::text
  ]));

CREATE INDEX IF NOT EXISTS idx_card_charges_match_method
  ON public.daily_card_charges (match_method, charge_date DESC);