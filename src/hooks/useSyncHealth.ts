import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useSyncHealth() {
  return useQuery({
    queryKey: ["sync-health"],
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      // Check last 3 cron runs
      const { data, error } = await supabase.rpc("get_cron_job_history", {
        p_job_name: 'sync-meta-today-5min',
        p_limit: 3
      });

      if (error) {
        console.warn("[useSyncHealth] Failed to fetch cron history:", error);
        return { status: "unknown" as const };
      }

      const runs = (data || []) as any[];
      if (runs.length === 0) return { status: "healthy" as const };

      // If all last 3 failed
      const allFailed = runs.length >= 3 && runs.every(r => r.status === "failed");
      
      return {
        status: allFailed ? ("critical" as const) : ("healthy" as const),
        lastRun: runs[0]
      };
    }
  });
}
