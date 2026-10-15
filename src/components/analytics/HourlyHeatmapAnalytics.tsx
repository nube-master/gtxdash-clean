import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type HeatmapMode = "sales" | "revenue" | "profit";

interface HourlyHeatmapProps {
  sales: any[];
  traffic: any[];
}

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 }).format(v);
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAYS_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function getColor(intensity: number): string {
  if (intensity <= 0) return "hsl(220, 8%, 12%)";
  if (intensity < 0.2) return "hsl(145, 60%, 18%)";
  if (intensity < 0.4) return "hsl(145, 65%, 25%)";
  if (intensity < 0.6) return "hsl(145, 70%, 32%)";
  if (intensity < 0.8) return "hsl(145, 75%, 40%)";
  return "hsl(145, 80%, 48%)";
}

export function HourlyHeatmapAnalytics({ sales, traffic }: HourlyHeatmapProps) {
  const [mode, setMode] = useState<HeatmapMode>("sales");

  const { grid, maxVal, hourTotals, dayTotals } = useMemo(() => {
    const grid: { sales: number; revenue: number; spend: number }[][] = Array.from({ length: 7 }, () =>
      Array.from({ length: 24 }, () => ({ sales: 0, revenue: 0, spend: 0 }))
    );

    const SAO_PAULO_TZ = "America/Sao_Paulo";
    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

    for (const s of sales) {
      if (s.status !== "approved") continue;
      const createdAt = s.click_time || s.created_at || s.occurred_at;
      if (!createdAt) continue;
      const d = new Date(createdAt);
      if (isNaN(d.getTime())) continue;
      const spStr = new Intl.DateTimeFormat("en-US", { timeZone: SAO_PAULO_TZ, hour: "numeric", hour12: false, weekday: "short" }).formatToParts(d);
      const hour = parseInt(spStr.find(p => p.type === "hour")?.value || "0");
      const dayIdx = dayMap[spStr.find(p => p.type === "weekday")?.value || "Mon"] ?? 1;
      grid[dayIdx][hour].sales++;
      grid[dayIdx][hour].revenue += Number(s.revenue || 0);
    }

    // Distribute traffic spend across hours when hour info exists; otherwise spread evenly across the day's weekday slot
    for (const t of traffic) {
      const spend = Number(t.spend || 0);
      if (!spend || !t.date) continue;
      const d = new Date(t.date + "T12:00:00");
      if (isNaN(d.getTime())) continue;
      const spStr = new Intl.DateTimeFormat("en-US", { timeZone: SAO_PAULO_TZ, weekday: "short" }).formatToParts(d);
      const dayIdx = dayMap[spStr.find(p => p.type === "weekday")?.value || "Mon"] ?? 1;
      // even spread (no hourly granularity available)
      const per = spend / 24;
      for (let h = 0; h < 24; h++) grid[dayIdx][h].spend += per;
    }

    const valueOf = (c: { sales: number; revenue: number; spend: number }) =>
      mode === "sales" ? c.sales : mode === "revenue" ? c.revenue : c.revenue - c.spend;

    let maxVal = 0;
    const hourTotals = Array(24).fill(0);
    const dayTotals = Array(7).fill(0);
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        const v = valueOf(grid[d][h]);
        if (v > maxVal) maxVal = v;
        hourTotals[h] += grid[d][h].sales;
        dayTotals[d] += grid[d][h].sales;
      }
    }

    return { grid, maxVal, hourTotals, dayTotals };
  }, [sales, traffic, mode]);

  const totalSales = dayTotals.reduce((a: number, b: number) => a + b, 0);
  if (totalSales < 5) return null;


  // Find peak hour
  const peakHour = hourTotals.indexOf(Math.max(...hourTotals));
  const peakDay = dayTotals.indexOf(Math.max(...dayTotals));

  const modeLabel = mode === "sales" ? "Vendas" : mode === "revenue" ? "Receita" : "Lucro";
  const ModeBtn = ({ k, label }: { k: HeatmapMode; label: string }) => (
    <Button size="sm" variant={mode === k ? "default" : "outline"} className="h-6 text-[10px] px-2" onClick={() => setMode(k)}>
      {label}
    </Button>
  );

  return (
    <Card className="bg-card border border-border">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Heatmap — Dia × Hora ({modeLabel})</h3>
            <span className="text-[10px] text-muted-foreground">🔥 Pico: <strong className="text-foreground">{peakHour}h ({DAYS_PT[peakDay]})</strong></span>
          </div>
          <div className="flex items-center gap-1">
            <ModeBtn k="sales" label="Vendas" />
            <ModeBtn k="revenue" label="Receita" />
            <ModeBtn k="profit" label="Lucro" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <TooltipProvider delayDuration={100}>
            <div className="inline-grid gap-[2px]" style={{ gridTemplateColumns: `40px repeat(24, minmax(24px, 1fr))` }}>
              <div />
              {HOURS.map((h) => (
                <div key={h} className="text-center text-[9px] font-mono text-muted-foreground pb-1">{h}h</div>
              ))}

              {[1, 2, 3, 4, 5, 6, 0].map((dayIdx) => (
                <>
                  <div key={`label-${dayIdx}`} className="text-[10px] font-medium text-muted-foreground flex items-center pr-2">{DAYS_PT[dayIdx]}</div>
                  {HOURS.map((h) => {
                    const cell = grid[dayIdx][h];
                    const profit = cell.revenue - cell.spend;
                    const v = mode === "sales" ? cell.sales : mode === "revenue" ? cell.revenue : profit;
                    const intensity = maxVal > 0 ? Math.max(0, v) / maxVal : 0;
                    const label = mode === "sales" ? `${cell.sales}` : mode === "revenue" ? `${Math.round(cell.revenue)}` : `${Math.round(profit)}`;
                    return (
                      <Tooltip key={`${dayIdx}-${h}`}>
                        <TooltipTrigger asChild>
                          <div
                            className="aspect-square rounded-[3px] cursor-default transition-all hover:ring-1 hover:ring-foreground/30 flex items-center justify-center"
                            style={{ backgroundColor: v <= 0 && mode === "profit" && cell.spend > 0 ? "hsl(0, 60%, 22%)" : getColor(intensity), minWidth: 24, minHeight: 24 }}
                          >
                            {v > 0 && mode === "sales" && <span className="text-[8px] font-mono font-bold text-white/80">{label}</span>}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent className="text-[11px]">
                          <p className="font-medium">{DAYS_PT[dayIdx]} {h}:00</p>
                          <p>{cell.sales} vendas — {fmt(cell.revenue)}</p>
                          <p className="text-muted-foreground">Gasto: {fmt(cell.spend)} · Lucro: {fmt(profit)}</p>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </>
              ))}
            </div>
          </TooltipProvider>
        </div>


        {/* Legend */}
        <div className="flex items-center justify-end gap-1 mt-3">
          <span className="text-[9px] text-muted-foreground mr-1">Menos</span>
          {[0, 0.2, 0.4, 0.6, 0.8, 1].map((i) => (
            <div key={i} className="w-3 h-3 rounded-[2px]" style={{ backgroundColor: getColor(i) }} />
          ))}
          <span className="text-[9px] text-muted-foreground ml-1">Mais</span>
        </div>
      </CardContent>
    </Card>
  );
}
