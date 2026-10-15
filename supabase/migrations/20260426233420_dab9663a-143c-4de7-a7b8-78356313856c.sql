
CREATE TABLE IF NOT EXISTS public.payoneer_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id TEXT NOT NULL,
  source_row_hash TEXT NOT NULL UNIQUE,
  transaction_date DATE NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'card_charge_meta',
    'card_charge_other',
    'wire_in',
    'wire_out',
    'fee',
    'fx_conversion',
    'refund',
    'other'
  )),
  description TEXT,
  raw_description TEXT,
  store_name TEXT,
  source_label TEXT,
  target_label TEXT,
  reference_id TEXT,
  status TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  debit_amount NUMERIC NOT NULL DEFAULT 0,
  credit_amount NUMERIC NOT NULL DEFAULT 0,
  net_amount NUMERIC NOT NULL DEFAULT 0,
  amount_brl NUMERIC,
  fx_rate NUMERIC,
  running_balance NUMERIC,
  -- Reconciliação
  linked_charge_id UUID,
  linked_topup_id UUID,
  source_file_id UUID,
  -- Meta
  operation_id UUID,
  imported_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payoneer_tx_date ON public.payoneer_transactions (transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_payoneer_tx_category ON public.payoneer_transactions (category, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_payoneer_tx_txid ON public.payoneer_transactions (transaction_id);

ALTER TABLE public.payoneer_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read payoneer_transactions"
  ON public.payoneer_transactions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service can insert payoneer_transactions"
  ON public.payoneer_transactions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can update payoneer_transactions"
  ON public.payoneer_transactions FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete payoneer_transactions"
  ON public.payoneer_transactions FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_payoneer_transactions_updated_at
  BEFORE UPDATE ON public.payoneer_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- get_payoneer_summary: agregado por categoria nos últimos 30d
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_payoneer_summary(p_days INT DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'window_days', p_days,
    'by_category', COALESCE(jsonb_agg(jsonb_build_object(
      'category', category,
      'count', tx_count,
      'total_debit_usd', total_debit,
      'total_credit_usd', total_credit,
      'total_net_brl', total_net_brl
    ) ORDER BY tx_count DESC), '[]'::jsonb),
    'totals', jsonb_build_object(
      'transactions', (SELECT COUNT(*) FROM payoneer_transactions WHERE transaction_date >= CURRENT_DATE - (p_days || ' days')::interval),
      'total_debit_usd', (SELECT COALESCE(SUM(debit_amount), 0) FROM payoneer_transactions WHERE transaction_date >= CURRENT_DATE - (p_days || ' days')::interval),
      'total_credit_usd', (SELECT COALESCE(SUM(credit_amount), 0) FROM payoneer_transactions WHERE transaction_date >= CURRENT_DATE - (p_days || ' days')::interval)
    ),
    'generated_at', now()
  ) INTO result
  FROM (
    SELECT 
      category,
      COUNT(*) AS tx_count,
      SUM(debit_amount) AS total_debit,
      SUM(credit_amount) AS total_credit,
      SUM(COALESCE(amount_brl, 0)) AS total_net_brl
    FROM payoneer_transactions
    WHERE transaction_date >= CURRENT_DATE - (p_days || ' days')::interval
    GROUP BY category
  ) c;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_payoneer_summary(INT) TO authenticated;
