import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCallback, useState } from "react";
import { useMobilePerformance, activePolling } from "@/hooks/useMobilePerformance";
import { useOperationId } from "@/contexts/OperationContext";

export interface AccountWithStatus {
  account_id: string;
  account_name: string;
  currency: string;
  is_active: boolean;
  account_status: number;
  disable_reason: string;
  category: string;
  bm_id: string | null;
}

const ACCOUNT_STATUS_LABELS: Record<number, string> = {
  1: "Ativa", 2: "Desabilitada", 3: "Pendente", 7: "Em Revisão",
  9: "Período de Graça", 100: "Fechamento Pendente", 101: "Fechada",
};

const ACCOUNT_STATUS_COLORS: Record<string, string> = {
  Ativa: "text-wr-positive border-wr-positive/30 bg-wr-positive/5",
  Desabilitada: "text-destructive border-destructive/30 bg-destructive/5",
  Pendente: "text-amber-400 border-amber-400/30 bg-amber-400/5",
  "Em Revisão": "text-destructive border-destructive/30 bg-destructive/5",
  "Período de Graça": "text-amber-400 border-amber-400/30 bg-amber-400/5",
  "Fechamento Pendente": "text-destructive border-destructive/30 bg-destructive/5",
  Fechada: "text-muted-foreground border-muted-foreground/30 bg-muted/50",
};

export function getAccountStatusLabel(status: number): string {
  return ACCOUNT_STATUS_LABELS[status] || "Desconhecido";
}

export function getAccountStatusColor(status: number): string {
  const label = getAccountStatusLabel(status);
  return ACCOUNT_STATUS_COLORS[label] || "text-muted-foreground border-muted-foreground/30";
}

export function useAccountStatuses() {
  const queryClient = useQueryClient();
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const perf = useMobilePerformance();
  const opId = useOperationId();

  const query = useQuery({
    queryKey: ["account-statuses", opId],
    queryFn: async (): Promise<AccountWithStatus[]> => {
      let q = supabase
        .from("meta_ad_accounts")
        .select("account_id, account_name, currency, is_active, account_status, disable_reason, category, bm_id")
        .eq("is_active", true)
        .order("account_name", { ascending: true });
      if (opId) q = q.eq("operation_id", opId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as AccountWithStatus[];
    },
    refetchInterval: activePolling(perf.secondaryPollingMs, perf.isTabActive),
    staleTime: perf.staleTimeMs,
  });

  const syncNow = useCallback(async () => {
    const res = await supabase.functions.invoke("sync-campaign-status", {
      body: opId ? { operation_id: opId } : {},
    });
    if (res.error) throw res.error;
    setLastSyncTime(new Date());
    queryClient.invalidateQueries({ queryKey: ["account-statuses"] });
    queryClient.invalidateQueries({ queryKey: ["campaign-statuses"] });
    return res.data;
  }, [queryClient, opId]);

  return { ...query, syncNow, lastSyncTime };
}
