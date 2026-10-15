import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, Activity, CheckCircle } from "lucide-react";

export function SystemHealthAlert() {
  const { data: healthStatus } = useQuery({
    queryKey: ["system-health-alert"],
    queryFn: async () => {
      // Check for recent errors in system_logs (last 1h)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: recentErrors, error: errError } = await supabase
        .from("system_logs" as any)
        .select("id, type, function_name, message, created_at")
        .eq("type", "EDGE_ERROR")
        .gte("created_at", oneHourAgo)
        .order("created_at", { ascending: false })
        .limit(5);

      const errors = (recentErrors as any[]) || [];
      const hasRecentErrors = errors.length > 0;

      return { hasRecentErrors, errors };
    },
    refetchInterval: 5 * 60 * 1000, // check every 5 min
    staleTime: 2 * 60 * 1000,
  });

  if (!healthStatus) return null;
  const { hasRecentErrors, errors } = healthStatus;

  if (!hasRecentErrors) return null;

  return (
    <div className="mx-4 mb-4">
      {hasRecentErrors && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
          <Activity className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="text-xs text-destructive font-medium">
              {errors.length} erro(s) nas Edge Functions na última hora
            </p>
            {errors.slice(0, 2).map((err: any) => (
              <p key={err.id} className="text-[10px] text-muted-foreground mt-1">
                [{err.function_name}] {err.message?.slice(0, 100)}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
