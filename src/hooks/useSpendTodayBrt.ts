import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperationId } from "@/contexts/OperationContext";
import { useEffect, useRef } from "react";

/**
 * Hook Autorizativo para Spend BRT (V2)
 * Fonte Única de Verdade para "Gasto Hoje"
 */
export function useSpendTodayBrt() {
  const queryClient = useQueryClient();
  const opId = useOperationId();
  const lastDayRef = useRef<string>(new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10));

  useEffect(() => {
    const checkMidnight = () => {
      const brtDay = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
      if (brtDay !== lastDayRef.current) {
        console.log(`[useSpendTodayBrt] Midnight BRT: ${lastDayRef.current} -> ${brtDay}`);
        lastDayRef.current = brtDay;
        queryClient.invalidateQueries({ queryKey: ["spend-today-brt", opId] });
      }
    };
    const timer = setInterval(checkMidnight, 30_000);
    return () => clearInterval(timer);
  }, [opId, queryClient]);

  return useQuery({
    queryKey: ["spend-today-brt", opId],
    queryFn: async () => {
      if (!opId) return { total_brl: 0 };
      
      // Busca token da operação em meta_token_configurations (tabela real)
      // Busca token da operação via RPC autoritativa (conforme getMetaToken.ts)
      const { data: token, error: tokenError } = await supabase.rpc("get_operation_credential", {
        p_operation_id: opId,
        p_provider: "meta_ads",
        p_profile_key: "default"
      });

      if (tokenError || !token) return { total_brl: 0, error: "No token" };

      const { data, error } = await supabase.functions.invoke(`get-spend-today-brt?operation_id=${opId}`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });



      if (error) throw error;
      return data as {
        total_brl: number;
        per_account: any[];
        window_utc: { since_utc: number; until_utc: number };
        fx_rate: number;
        ts: string;
      };
    },
    refetchInterval: 60_000,
    staleTime: 10_000,
    enabled: !!opId,
  });
}

