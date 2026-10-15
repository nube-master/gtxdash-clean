import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useOperationId } from "@/contexts/OperationContext";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2 } from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAYS_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function color(intensity: number): string {
  if (intensity <= 0) return "hsl(var(--muted) / 0.3)";
  if (intensity < 0.2) return "hsl(145, 60%, 18%)";
  if (intensity < 0.4) return "hsl(145, 65%, 25%)";
  if (intensity < 0.6) return "hsl(145, 70%, 32%)";
  if (intensity < 0.8) return "hsl(145, 75%, 40%)";
  return "hsl(145, 80%, 48%)";
}

interface Props {
  filters: { player_id?: string; product?: string; ad_id?: string };
}

type HeatmapData = {
  grid: number[][];
  max: number;
  total: number;
  peak: { day: number; hour: number; viewers: number };
  days_window: number;
  samples: number;
};

export function LiveViewersHeatmapCard({ filters }: Props) {
  const operationId = useOperationId();
  const [data, setData] = useState<HeatmapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  useEffect(() => {
    if (!operationId) return;
    let canceled = false;
    setLoading(true);
    (async () => {
      try {
        const { data: session } = await supabase.auth.getSession();
        const token = session.session?.access_token ?? ANON_KEY;
        const params = new URLSearchParams();
        params.set("days", String(days));
        params.set("operation_id", operationId);
        if (filters.player_id && filters.player_id !== "all") params.set("player_id", filters.player_id);
        if (filters.product && filters.product !== "all") params.set("product", filters.product);
        if (filters.ad_id && filters.ad_id !== "all") params.set("ad_id", filters.ad_id);
        const url = `${SUPABASE_URL}/functions/v1/live-heatmap?${params.toString()}`;
        const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, apikey: ANON_KEY } });
        if (!r.ok) throw new Error(`live-heatmap ${r.status}`);
        const j = await r.json();
        if (!canceled) setData(j);
      } catch (e) {
        console.error("heatmap error", e);
      } finally {
        if (!canceled) setLoading(false);
      }
    })();
    return () => { canceled = true; };
  }, [filters.player_id, filters.product, filters.ad_id, days, operationId]);


  // Reordena: começa segunda
  const orderedDays = useMemo(() => [1, 2, 3, 4, 5, 6, 0], []);

  if (loading && !data) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Heatmap de viewers · 24×7</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }
  if (!data || data.total === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Heatmap de viewers · 24×7</CardTitle>
        </CardHeader>
        <CardContent className="py-8 text-xs text-muted-foreground text-center">
          Sem dados nos últimos {days} dias.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <span>Heatmap de viewers · 24×7</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              últimos {data.days_window} dias · BRT
            </span>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span>🔥 Pico: <strong className="text-foreground">{DAYS_PT[data.peak.day]} {data.peak.hour}h</strong> ({data.peak.viewers} viewers)</span>
            <div className="flex items-center gap-1">
              {[3, 7, 14].map((d) => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`px-2 py-0.5 rounded text-[10px] tabular-nums transition-colors ${
                    days === d ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="w-full overflow-x-auto">
          <TooltipProvider delayDuration={100}>
            <div
              className="grid gap-[2px] w-full min-w-[700px]"
              style={{ gridTemplateColumns: `40px repeat(24, minmax(0, 1fr))` }}
            >
              <div />
              {HOURS.map((h) => (
                <div key={h} className="text-center text-[9px] font-mono text-muted-foreground pb-1">
                  {h}h
                </div>
              ))}
              {orderedDays.map((dayIdx) => (
                <>
                  <div key={`l-${dayIdx}`} className="text-[10px] font-medium text-muted-foreground flex items-center pr-2">
                    {DAYS_PT[dayIdx]}
                  </div>
                  {HOURS.map((h) => {
                    const v = data.grid[dayIdx][h];
                    const intensity = data.max > 0 ? v / data.max : 0;
                    return (
                      <Tooltip key={`${dayIdx}-${h}`}>
                        <TooltipTrigger asChild>
                          <div
                            className="aspect-square rounded-[3px] cursor-default transition-all hover:ring-1 hover:ring-foreground/30 flex items-center justify-center w-full"
                            style={{ backgroundColor: color(intensity) }}
                          >
                            {v > 0 && intensity > 0.4 && (
                              <span className="text-[8px] font-mono font-bold text-white/80">{v}</span>
                            )}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent className="text-[11px]">
                          <p className="font-medium">{DAYS_PT[dayIdx]} {h}:00 BRT</p>
                          <p>{v} viewers únicos</p>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </>
              ))}
            </div>
          </TooltipProvider>
        </div>
        {(() => {
          // Insights derivados do grid
          let total = 0;
          let nonZeroCells = 0;
          let dead = { day: 0, hour: 0, viewers: Infinity };
          const dayTotals: number[] = Array(7).fill(0);
          const hourTotals: number[] = Array(24).fill(0);
          for (let d = 0; d < 7; d++) {
            for (let h = 0; h < 24; h++) {
              const v = data.grid[d]?.[h] ?? 0;
              total += v;
              if (v > 0) {
                nonZeroCells++;
                if (v < dead.viewers) dead = { day: d, hour: h, viewers: v };
              }
              dayTotals[d] += v;
              hourTotals[h] += v;
            }
          }
          const avgPerHour = nonZeroCells > 0 ? Math.round(total / nonZeroCells) : 0;
          // Melhor janela de 3h (somando hourTotals)
          let bestWin = { start: 0, sum: 0 };
          for (let h = 0; h < 22; h++) {
            const s = hourTotals[h] + hourTotals[h + 1] + hourTotals[h + 2];
            if (s > bestWin.sum) bestWin = { start: h, sum: s };
          }
          // Melhor dia da semana
          let bestDay = 0;
          for (let d = 1; d < 7; d++) if (dayTotals[d] > dayTotals[bestDay]) bestDay = d;

          const Stat = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
            <div className="flex flex-col leading-tight">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</span>
              <span className="text-xs font-semibold tabular-nums text-foreground">{value}</span>
              {sub && <span className="text-[9px] text-muted-foreground">{sub}</span>}
            </div>
          );

          return (
            <div className="flex flex-wrap items-center justify-between gap-4 mt-4 pt-3 border-t border-border/50">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <Stat label="Total viewers" value={total.toLocaleString("pt-BR")} sub={`${data.days_window}d`} />
                <Stat label="Média / hora ativa" value={avgPerHour.toLocaleString("pt-BR")} />
                <Stat
                  label="Melhor janela 3h"
                  value={`${bestWin.start}h–${bestWin.start + 3}h`}
                  sub={`${bestWin.sum.toLocaleString("pt-BR")} viewers`}
                />
                <Stat label="Dia mais forte" value={DAYS_PT[bestDay]} sub={`${dayTotals[bestDay].toLocaleString("pt-BR")} viewers`} />
                {Number.isFinite(dead.viewers) && (
                  <Stat
                    label="Hora morta"
                    value={`${DAYS_PT[dead.day]} ${dead.hour}h`}
                    sub={`${dead.viewers} viewers`}
                  />
                )}
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-muted-foreground mr-1">Menos</span>
                {[0, 0.2, 0.4, 0.6, 0.8, 1].map((i) => (
                  <div key={i} className="w-3 h-3 rounded-[2px]" style={{ backgroundColor: color(i) }} />
                ))}
                <span className="text-[9px] text-muted-foreground ml-1">Mais</span>
              </div>
            </div>
          );
        })()}
      </CardContent>
    </Card>
  );
}
