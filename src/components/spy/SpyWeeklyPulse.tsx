// Spy — Pulse semanal do mercado (novas, mortas, escalando, top nicho)
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, Skull, TrendingUp, Plus, Activity } from "lucide-react";
import { useOperationId } from "@/contexts/OperationContext";

export function SpyWeeklyPulse() {
  const operationId = useOperationId();
  const { data, isLoading } = useQuery({
    queryKey: ["spy-weekly-pulse", operationId],
    enabled: !!operationId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

      const [novasRes, alertsRes, allOffersRes] = await Promise.all([
        supabase
          .from("spy_offers")
          .select("id, nicho", { count: "exact" })
          .eq("operation_id", operationId)
          .gte("created_at", since),
        supabase
          .from("spy_alerts")
          .select("event_type, payload")
          .eq("operation_id", operationId)
          .gte("created_at", since)
          .in("event_type", ["constant_growth", "dead_offer"]),
        supabase
          .from("spy_offers")
          .select("nicho, active_ads_count")
          .eq("operation_id", operationId)
          .gt("active_ads_count", 0),
      ]);

      const novas = novasRes.count ?? 0;
      const alerts = alertsRes.data ?? [];
      const escalando = alerts.filter((a) => a.event_type === "constant_growth").length;
      const mortas = alerts.filter((a) => a.event_type === "dead_offer").length;

      // top nicho por volume agregado
      const nichoMap = new Map<string, number>();
      for (const o of allOffersRes.data ?? []) {
        const k = o.nicho ?? "outro";
        nichoMap.set(k, (nichoMap.get(k) ?? 0) + (o.active_ads_count ?? 0));
      }
      const topNicho = Array.from(nichoMap.entries()).sort((a, b) => b[1] - a[1])[0];
      const totalAds = Array.from(nichoMap.values()).reduce((s, v) => s + v, 0);

      return { novas, escalando, mortas, topNicho, totalAds };
    },
  });

  if (isLoading || !data) return null;
  if (data.novas === 0 && data.escalando === 0 && data.mortas === 0) return null;

  return (
    <Card className="p-3 bg-gradient-to-r from-primary/5 via-card to-card border-primary/20">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Activity className="h-3.5 w-3.5 text-primary" />
          Pulse 7d
        </div>
        <div className="flex items-center gap-4 flex-wrap text-sm">
          <Stat icon={<Plus className="h-3.5 w-3.5 text-emerald-500" />} label="novas" value={data.novas} />
          <Stat icon={<TrendingUp className="h-3.5 w-3.5 text-rose-500" />} label="escalando" value={data.escalando} />
          <Stat icon={<Skull className="h-3.5 w-3.5 text-muted-foreground" />} label="sumiram" value={data.mortas} />
          {data.topNicho && (
            <Stat
              icon={<Sparkles className="h-3.5 w-3.5 text-amber-500" />}
              label={`top nicho: ${data.topNicho[0]}`}
              value={data.topNicho[1].toLocaleString("pt-BR")}
            />
          )}
          <div className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground tabular-nums">{data.totalAds.toLocaleString("pt-BR")}</span> ads ativos no Spy
          </div>
        </div>
      </div>
    </Card>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <div className="flex items-center gap-1.5">
      {icon}
      <span className="font-bold tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
