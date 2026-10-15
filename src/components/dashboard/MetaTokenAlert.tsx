import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Info } from "lucide-react";

/**
 * Detects when Meta ingestion is truly stopped.
 */
export function MetaTokenAlert() {
  const { data } = useQuery({
    queryKey: ["meta-token-health"],
    queryFn: async () => {
      const todaySP = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
      }).format(new Date());

      // Try current day first with type casting to bypass TS missing table error
      const { data: realtimeRows } = await (supabase
        .from("meta_spend_realtime_safe" as any)
        .select("fetched_at")
        .eq("sp_date", todaySP)
        .order("fetched_at", { ascending: false })
        .limit(1) as any);

      const rows = realtimeRows as Array<{ fetched_at: string | null }> | null;
      
      let lastAt: Date | null = null;
      if (rows && rows.length > 0 && rows[0].fetched_at) {
        lastAt = new Date(rows[0].fetched_at);
      } else {
        // Fallback to check if anything arrived in the last 24h regardless of sp_date grouping
        const { data: recentRows } = await (supabase
          .from("meta_spend_realtime_safe" as any)
          .select("fetched_at")
          .order("fetched_at", { ascending: false })
          .limit(1) as any);
        
        const recent = recentRows as Array<{ fetched_at: string | null }> | null;
        if (recent && recent.length > 0 && recent[0].fetched_at) {
          lastAt = new Date(recent[0].fetched_at);
        }
      }

      const now = Date.now();
      // Relax threshold to 75 minutes. The 2-minute cron pulls 15 accounts at a time.
      // With 140 accounts, a full cycle takes ~20 minutes. 75m gives room for 3 full cycles.
      const isHealthy = !!lastAt && now - lastAt.getTime() <= 75 * 60 * 1000;

      return { isHealthy, lastSyncAt: lastAt };
    },
    refetchInterval: 2 * 60 * 1000,
  });

  // Force hide if data looks healthy or if user explicitly wants to suppress while healthy
  // Permanently removed as requested by user ("remove essa merda desse lembrete")
  return null;

  const lastSyncStr = data.lastSyncAt
    ? data.lastSyncAt.toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "desconhecido";

  const minutesAgo = data.lastSyncAt
    ? Math.floor((Date.now() - data.lastSyncAt.getTime()) / 60000)
    : null;

  return (
    <div className="mx-4 mb-4">
      <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
        <Info className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-amber-600">
            Processamento de Gastos Meta Ads
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Últimos dados recebidos: <span className="font-mono text-foreground">{lastSyncStr} BRT</span>
            {minutesAgo !== null && (
              <span className="ml-1">({minutesAgo} min atrás)</span>
            )}
          </p>
          <p className="text-[11px] text-muted-foreground/80 mt-1">
            Os gastos estão sendo processados em lotes para garantir estabilidade. Cliques no Link e LP Views (Meta API) auditados. Verifique os tokens em <span className="font-medium">Audit Tokens</span> se o atraso for superior a 2 horas.
          </p>
        </div>
      </div>
    </div>
  );
}
