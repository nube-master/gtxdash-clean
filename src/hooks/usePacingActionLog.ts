import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { dbToLogEntry, type DbActionLog } from "@/components/pacing/dbAdapters";
import type { LogEntry } from "@/components/pacing/historyMock";
import { useOperationId } from "@/contexts/OperationContext";
import { shouldSkipRtPayload } from "@/lib/realtimeTenantGuard";

const TABLE = "pacing_action_log";

export function usePacingActionLog(ruleNameById?: Map<string, string>) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const operationId = useOperationId();

  const fetchAll = useCallback(async () => {
    let q: any = (supabase as any)
      .from(TABLE)
      .select("*")
      .order("triggered_at", { ascending: false })
      .limit(1000);
    if (operationId) q = q.eq("operation_id", operationId);
    const { data, error } = await q;
    if (error) {
      toast.error("Erro ao carregar log", { description: error.message });
      setLoading(false);
      return;
    }
    setEntries((data as DbActionLog[]).map((r) => dbToLogEntry(r, ruleNameById)));
    setLoading(false);
  }, [ruleNameById, operationId]);

  useEffect(() => {
    if (!operationId) return;
    fetchAll();
    const ch = (supabase as any)
      .channel(`pacing-action-log-rt-${operationId}`)
      .on(
        "postgres_changes",
        { 
          event: "INSERT", 
          schema: "public", 
          table: TABLE,
          filter: `operation_id=eq.${operationId}`
        },
        (payload: any) => {
          if (shouldSkipRtPayload(payload, operationId, "usePacingActionLog")) return;
          setEntries((p) => [dbToLogEntry(payload.new, ruleNameById), ...p]);
        }
      )
      .subscribe();
    return () => {
      (supabase as any).removeChannel(ch);
    };
  }, [fetchAll, ruleNameById, operationId]);

  return { entries, loading, refetch: fetchAll };
}
