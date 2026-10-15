import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperationId } from "@/contexts/OperationContext";

export interface StatusLogEntry {
  id: string;
  account_id: string;
  account_name: string;
  old_status: number | null;
  new_status: number;
  changed_at: string;
}

export function useAccountStatusHistory(daysBack = 30) {
  const opId = useOperationId();

  return useQuery({
    queryKey: ["account-status-log", opId, daysBack],
    queryFn: async (): Promise<StatusLogEntry[]> => {
      const since = new Date();
      since.setDate(since.getDate() - daysBack);

      let q = supabase
        .from("account_status_log" as any)
        .select("*")
        .gte("changed_at", since.toISOString())
        .order("changed_at", { ascending: false })
        .limit(3000);

      if (opId) q = q.eq("operation_id", opId);

      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as StatusLogEntry[];
    },
    staleTime: 60_000,
  });
}
