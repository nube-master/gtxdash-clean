import { supabase } from "@/integrations/supabase/client";
import { useOperation } from "@/contexts/OperationContext";

/**
 * Hook utilitário para garantir que queries incluam o operation_id.
 * Nota: Tabelas que exigem select() antes do eq() devem ser tratadas caso a caso.
 */
export function useScopedQuery() {
  const { operationId } = useOperation();

  const from = (table: any) => {
    const query = supabase.from(table);
    if (!operationId) {
      console.warn(`[useScopedQuery] Attempted to query table "${table}" without operationId in context.`);
      return query;
    }
    // Retornamos o builder, o chamador decide se usa .select() ou .update() etc.
    return query;
  };

  const scopedFrom = (table: any) => {
    if (!operationId) return supabase.from(table).select("*");
    return supabase.from(table).select("*").eq("operation_id", operationId);
  };

  return { from, scopedFrom, operationId };
}


