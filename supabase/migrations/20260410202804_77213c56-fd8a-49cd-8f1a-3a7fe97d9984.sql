
-- 1. Tabela de log de mudanças de status de contas
CREATE TABLE public.account_status_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id TEXT NOT NULL,
  account_name TEXT NOT NULL DEFAULT '',
  old_status INTEGER,
  new_status INTEGER NOT NULL,
  operation_id UUID REFERENCES public.operations(id),
  changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para consultas rápidas
CREATE INDEX idx_account_status_log_account ON public.account_status_log(account_id);
CREATE INDEX idx_account_status_log_changed_at ON public.account_status_log(changed_at DESC);
CREATE INDEX idx_account_status_log_operation ON public.account_status_log(operation_id);

-- Enable RLS
ALTER TABLE public.account_status_log ENABLE ROW LEVEL SECURITY;

-- Políticas: serviço pode inserir, autenticados podem ler
CREATE POLICY "Allow service insert account_status_log"
  ON public.account_status_log FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Authenticated can read account_status_log"
  ON public.account_status_log FOR SELECT
  TO authenticated
  USING (true);

-- 2. Trigger que registra mudanças de account_status automaticamente
CREATE OR REPLACE FUNCTION public.log_account_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Só loga se o status realmente mudou
  IF OLD.account_status IS DISTINCT FROM NEW.account_status THEN
    INSERT INTO public.account_status_log (account_id, account_name, old_status, new_status, operation_id)
    VALUES (NEW.account_id, NEW.account_name, OLD.account_status, NEW.account_status, NEW.operation_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_account_status_change
  AFTER UPDATE ON public.meta_ad_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.log_account_status_change();

-- 3. Snapshot inicial: registrar o status atual de todas as contas como ponto de partida
INSERT INTO public.account_status_log (account_id, account_name, old_status, new_status, operation_id)
SELECT account_id, account_name, NULL, account_status, operation_id
FROM public.meta_ad_accounts
WHERE is_active = true;
