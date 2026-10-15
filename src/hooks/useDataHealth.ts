import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface HealthLog {
  id: string;
  type: string;
  status: string;
  source: string;
  message: string;
  metadata: any;
  created_at: string;
}

export interface DailySnapshot {
  id: string;
  snapshot_date: string;
  total_campaigns_meta: number;
  total_campaigns_dash: number;
  total_spend: number;
  total_revenue: number;
  total_sales: number;
  divergence_percent: number;
  api_write_errors_24h: number;
  api_read_errors_24h: number;
  calculation_errors: number;
  decision_errors: number;
  overall_status: string;
  created_at: string;
}

export function useDataHealth() {
  const { data: latestSnapshot, isLoading: snapshotLoading } = useQuery({
    queryKey: ["data-health-snapshot"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_daily_snapshot" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return (data as unknown) as DailySnapshot | null;
    },
    refetchInterval: 5 * 60 * 1000,
    staleTime: 2 * 60 * 1000,
  });

  const { data: recentLogs, isLoading: logsLoading } = useQuery({
    queryKey: ["data-health-logs"],
    queryFn: async () => {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("system_health_logs" as any)
        .select("*")
        .gte("created_at", oneDayAgo)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return ((data as unknown) as HealthLog[]) || [];
    },
    refetchInterval: 5 * 60 * 1000,
    staleTime: 2 * 60 * 1000,
  });

  // Derive overall status from latest snapshot
  const overallStatus: "ok" | "warning" | "error" = (latestSnapshot?.overall_status as any) || "ok";

  // Check if snapshot is fresh (less than 6h old)
  const isFresh = latestSnapshot
    ? (Date.now() - new Date(latestSnapshot.created_at).getTime()) < 6 * 60 * 60 * 1000
    : false;

  return {
    snapshot: latestSnapshot,
    logs: recentLogs || [],
    overallStatus: isFresh ? overallStatus : "warning",
    isFresh,
    isLoading: snapshotLoading || logsLoading,
  };
}
