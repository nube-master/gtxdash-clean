
ALTER TABLE public.mcp_tokens ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES public.operations(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.mcp_tokens.operation_id IS 'Escopo da operação para este token MCP. Se nulo, o token é master (super-admin).';

-- GRANT no tokens para service_role (usado pela edge function)
GRANT ALL ON public.mcp_tokens TO service_role;

-- Função para validar se um token tem acesso a uma operação
CREATE OR REPLACE FUNCTION public.mcp_token_has_operation_access(_token_id uuid, _operation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_token_op_id uuid;
BEGIN
    SELECT operation_id INTO v_token_op_id FROM public.mcp_tokens WHERE id = _token_id;
    
    -- Se o token não tiver operation_id, ele é master e acessa tudo
    IF v_token_op_id IS NULL THEN
        RETURN TRUE;
    END IF;
    
    -- Caso contrário, deve bater exatamente
    RETURN v_token_op_id = _operation_id;
END;
$$;
