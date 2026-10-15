import { useOperation } from "@/contexts/OperationContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Fetches the historical log of operations performed for the current tenant.
 * Used to answer questions like "what did I do today in Escuela del Dólar?".
 */
export function useOperationHistory(limit = 20) {
  const { operationId } = useOperation();

  return useQuery({
    queryKey: ["operation-history", operationId, limit],
    enabled: !!operationId,
    queryFn: async () => {
      // We look into pacing_action_log which stores manual/automatic campaign changes
      const { data, error } = await supabase
        .from("pacing_action_log")
        .select("*")
        .eq("operation_id", operationId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;

      return data.map((item: any) => ({
        id: item.id,
        timestamp: item.created_at,
        action: item.action, // e.g., 'update_budget', 'pause_campaign', '⚡ Liga Tudo'
        entity: item.campaign_name || item.account_id,
        details: item.details, // JSON with old/new values
        performedBy: item.performed_by,
        status: item.status
      }));
    }
  });
}
