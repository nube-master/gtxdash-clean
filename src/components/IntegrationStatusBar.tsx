import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Activity } from "lucide-react";
import { useOperation } from "@/contexts/OperationContext";


interface IntegrationStatus {
  name: string;
  label: string;
  ok: boolean;
  lastSync: string | null;
}

export function IntegrationStatusBar() {
  const { operationId } = useOperation();
  const { data: statuses } = useQuery({
    queryKey: ["integration-health", operationId],
    queryFn: async () => {
      let query = supabase.from("integration_logs")
        .select("integration, status, created_at");

      if (operationId) {
        query = query.eq("operation_id", operationId);
      }

      const { data, error } = await query
        .order("created_at", { ascending: false })
        .limit(50);


      if (error) throw error;

      const integrations = ["sync-meta-ads", "pull-conversions", "sync-clickbank-orders"];
      const labels: Record<string, string> = {
        "sync-meta-ads": "Meta",
        "pull-conversions": "RedTrack",
        "sync-clickbank-orders": "Clickbank",
      };

      const result: IntegrationStatus[] = integrations.map((name) => {
        const latest = (data || []).find((d) => d.integration === name);
        return {
          name,
          label: labels[name] || name,
          ok: latest?.status === "success",
          lastSync: latest?.created_at || null,
        };
      });

      return result;
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  if (!statuses) return null;

  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <button className="flex items-center gap-1 px-1.5 py-1 rounded border border-border/30 bg-muted/20 hover:bg-muted/40 transition-colors cursor-default">
            <Activity className="h-2.5 w-2.5 text-muted-foreground" />
            {statuses.map((s) => (
              <div
                key={s.name}
                className={`h-1.5 w-1.5 rounded-full ${s.ok ? "bg-emerald-500" : "bg-destructive"}`}
                style={{ boxShadow: s.ok ? "0 0 4px hsl(142 71% 45% / 0.5)" : "0 0 4px hsl(var(--destructive) / 0.5)" }}
              />
            ))}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="p-3 space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Status das Integrações</p>
          {statuses.map((s) => (
            <div key={s.name} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-1.5">
                <div
                  className={`h-1.5 w-1.5 rounded-full ${s.ok ? "bg-emerald-500" : "bg-destructive"}`}
                />
                <span className="text-xs font-medium">{s.label}</span>
              </div>
              <span className="text-[10px] text-muted-foreground font-mono">
                {s.lastSync
                  ? new Date(s.lastSync).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
                  : "—"}
              </span>
            </div>
          ))}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
