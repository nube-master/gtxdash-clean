import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePacingLiveMode } from "@/contexts/PacingLiveModeContext";
import { usePacingDateRange } from "@/contexts/PacingDateRangeContext";
import { useOperationId } from "@/contexts/OperationContext";
import { shouldSkipRtPayload } from "@/lib/realtimeTenantGuard";

/**
 * Modo Live: subscreve em Realtime nas tabelas que indicam mudanças
 * relevantes pro Pacing (spend Meta, status de campanha, novas vendas).
 *
 * Cada evento dispara um refetch debounced (250ms) da query de campanhas.
 * Só roda quando liveMode=true, janela=Hoje e aba visível.
 */
export function usePacingRealtimeWatcher() {
  const { liveMode } = usePacingLiveMode();
  const { isToday } = usePacingDateRange();
  const qc = useQueryClient();
  const operationId = useOperationId();
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!liveMode || !isToday || !operationId) return;
    if (typeof document !== "undefined" && document.hidden) return;

    const triggerRefetch = (source: string) => (payload: any) => {
      // Bloco 4: guard cliente-lateral — só refetch se o evento é da op atual
      // (RLS já filtra leitura, mas evita reconexão/flash cross-tenant).
      if (shouldSkipRtPayload(payload, operationId, `pacingWatcher:${source}`)) return;
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["live-pacing-campaigns"] });
      }, 250);
    };

    const channel = supabase
      .channel(`pacing-live-watch-${operationId}`)
      .on("postgres_changes", { 
        event: "INSERT", 
        schema: "public", 
        table: "sales_data",
        filter: `operation_id=eq.${operationId}`
      }, triggerRefetch("sales_data"))
      .on("postgres_changes", { 
        event: "INSERT", 
        schema: "public", 
        table: "redtrack_events",
        filter: `operation_id=eq.${operationId}`
      }, triggerRefetch("redtrack_events"))
      .on("postgres_changes", { 
        event: "UPDATE", 
        schema: "public", 
        table: "meta_campaign_status",
        filter: `operation_id=eq.${operationId}`
      }, triggerRefetch("meta_campaign_status"))
      .on("postgres_changes", { 
        event: "INSERT", 
        schema: "public", 
        table: "traffic_data",
        filter: `operation_id=eq.${operationId}`
      }, triggerRefetch("traffic_data:insert"))
      .on("postgres_changes", { 
        event: "UPDATE", 
        schema: "public", 
        table: "traffic_data",
        filter: `operation_id=eq.${operationId}`
      }, triggerRefetch("traffic_data:update"))
      .subscribe();

    const onVis = () => {
      if (document.hidden) {
        supabase.removeChannel(channel);
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [liveMode, isToday, qc, operationId]);
}
