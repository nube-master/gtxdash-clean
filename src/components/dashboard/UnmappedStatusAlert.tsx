import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle } from "lucide-react";

/**
 * Checks for RedTrack events with statuses other than the expected ones
 * and displays an alert if any are found.
 */
export function UnmappedStatusAlert() {
  const { data } = useQuery({
    queryKey: ["redtrack-unmapped-statuses"],
    queryFn: async () => {
      const knownStatuses = ["approved", "other", null];

      // Fetch distinct statuses from recent events (last 7 days)
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("redtrack_events")
        .select("status")
        .gte("created_at", since);

      if (error || !data) return { unmapped: [], counts: new Map<string, number>() };

      const counts = new Map<string, number>();
      for (const row of data) {
        const s = row.status ?? "null";
        if (!knownStatuses.includes(row.status)) {
          counts.set(s, (counts.get(s) || 0) + 1);
        }
      }

      return {
        unmapped: Array.from(counts.keys()),
        counts,
      };
    },
    refetchInterval: 5 * 60 * 1000,
    staleTime: 2 * 60 * 1000,
  });

  if (!data || data.unmapped.length === 0) return null;

  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3">
      <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
      <div>
        <p className="text-xs text-amber-400 font-medium">
          Status não mapeado detectado no RedTrack
        </p>
        <div className="text-[10px] text-muted-foreground mt-1 space-y-0.5">
          {data.unmapped.map((s) => (
            <p key={s}>
              Status <span className="font-mono font-semibold text-foreground">"{s}"</span>
              {" — "}{data.counts.get(s)} evento(s) nos últimos 7 dias
            </p>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          Esses eventos podem não estar sendo contabilizados corretamente nos KPIs.
        </p>
      </div>
    </div>
  );
}
