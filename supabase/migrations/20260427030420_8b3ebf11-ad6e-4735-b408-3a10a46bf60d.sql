-- Vínculo de cobranças/transações ao log do upload, para permitir rollback.
ALTER TABLE public.daily_card_charges
  ADD COLUMN IF NOT EXISTS upload_log_id uuid REFERENCES public.integration_logs(id) ON DELETE SET NULL;

ALTER TABLE public.payoneer_transactions
  ADD COLUMN IF NOT EXISTS upload_log_id uuid REFERENCES public.integration_logs(id) ON DELETE SET NULL;

ALTER TABLE public.treasury_topups
  ADD COLUMN IF NOT EXISTS upload_log_id uuid REFERENCES public.integration_logs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_card_charges_upload_log ON public.daily_card_charges(upload_log_id);
CREATE INDEX IF NOT EXISTS idx_payoneer_tx_upload_log ON public.payoneer_transactions(upload_log_id);
CREATE INDEX IF NOT EXISTS idx_treasury_topups_upload_log ON public.treasury_topups(upload_log_id);

-- Política de DELETE para integration_logs (admins removem logs de upload).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='integration_logs' AND policyname='Admins can delete integration_logs'
  ) THEN
    CREATE POLICY "Admins can delete integration_logs"
      ON public.integration_logs
      FOR DELETE
      TO authenticated
      USING (public.has_role(auth.uid(), 'admin'::app_role));
  END IF;
END$$;

-- Política de DELETE para daily_card_charges (admins removem cobranças oriundas de upload).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='daily_card_charges' AND policyname='Admins can delete daily_card_charges'
  ) THEN
    CREATE POLICY "Admins can delete daily_card_charges"
      ON public.daily_card_charges
      FOR DELETE
      TO authenticated
      USING (public.has_role(auth.uid(), 'admin'::app_role));
  END IF;
END$$;

-- Política de DELETE para treasury_topups (admins removem topups auto-criados).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='treasury_topups' AND policyname='Admins can delete treasury_topups'
  ) THEN
    CREATE POLICY "Admins can delete treasury_topups"
      ON public.treasury_topups
      FOR DELETE
      TO authenticated
      USING (public.has_role(auth.uid(), 'admin'::app_role));
  END IF;
END$$;