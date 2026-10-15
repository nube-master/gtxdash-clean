import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";

interface HourlyHeatmapProps {
  sales: any[];
  trafficData: any[];
}

function getHourFromTimestamp(created_at: string): number {
  const d = new Date(created_at);
  return parseInt(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }).format(d)
  );
}

function fmtCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
}

function getHeatColor(value: number, min: number, max: number): string {
  if (max === min) return "bg-muted/20";
  const ratio = (value - min) / (max - min);
  if (ratio >= 0.75) return "bg-wr-positive/30 text-wr-positive";
  if (ratio >= 0.5) return "bg-wr-positive/15 text-wr-positive/80";
  if (ratio >= 0.25) return "bg-amber-400/15 text-amber-400";
  return "bg-destructive/15 text-destructive";
}

function getProfitHeatColor(value: number): string {
  if (value > 100) return "bg-wr-positive/30 text-wr-positive";
  if (value > 0) return "bg-wr-positive/15 text-wr-positive/80";
  if (value === 0) return "bg-muted/20 text-muted-foreground";
  if (value > -100) return "bg-destructive/15 text-destructive/80";
  return "bg-destructive/30 text-destructive";
}

export function HourlyHeatmap({ sales, trafficData }: HourlyHeatmapProps) {
  const heatmapData = useMemo(() => {
    const approved = (sales || []).filter((s) => s.status === "approved");
    const totalDailySpend = (trafficData || []).reduce((sum, t) => sum + Number(t.spend), 0);

    const hours: Record<number, { revenue: number; sales: number; spend: number }> = {};
    for (let h = 0; h < 24; h++) {
      hours[h] = { revenue: 0, sales: 0, spend: 0 };
    }

    for (const sale of approved) {
      const h = getHourFromTimestamp(sale.created_at);
      hours[h].revenue += Number(sale.revenue);
      hours[h].sales += 1;
    }

    const data = Array.from({ length: 24 }, (_, h) => {
      const d = hours[h];
      const roas = d.spend > 0 ? d.revenue / d.spend : (d.revenue > 0 ? d.revenue : 0);
      const lucro = d.revenue - d.spend;
      return { hour: h, roas, lucro, sales: d.sales, revenue: d.revenue };
    });

    // Only show hours with any activity (sales > 0 or spend > 0)
    const activeHours = data.filter(d => d.sales > 0);
    if (activeHours.length === 0) return null;

    const salesRange = { min: Math.min(...data.map(d => d.sales)), max: Math.max(...data.map(d => d.sales)) };
    const revenueRange = { min: Math.min(...data.map(d => d.revenue)), max: Math.max(...data.map(d => d.revenue)) };

    return { data, salesRange, revenueRange };
  }, [sales, trafficData]);

  if (!heatmapData) return null;

  const { data, salesRange, revenueRange } = heatmapData;

  return (
    <Card className="bg-card border border-border">
      <CardContent className="p-4">
        <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">
          🗺️ Heatmap de Performance — Hoje
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-2 text-muted-foreground font-medium">Hora</th>
                <th className="text-center py-2 px-2 text-muted-foreground font-medium">Vendas</th>
                <th className="text-center py-2 px-2 text-muted-foreground font-medium">Receita</th>
                <th className="text-center py-2 px-2 text-muted-foreground font-medium">Lucro</th>
              </tr>
            </thead>
            <tbody>
              {data.filter(d => d.sales > 0 || d.revenue > 0).map((d) => (
                <tr key={d.hour} className="border-b border-border/50">
                  <td className="py-1.5 px-2 font-data font-medium text-foreground">
                    {String(d.hour).padStart(2, "0")}h
                  </td>
                  <td className="py-1.5 px-2">
                    <span className={`inline-block w-full text-center py-0.5 px-1 rounded text-[10px] font-data font-medium ${getHeatColor(d.sales, salesRange.min, salesRange.max)}`}>
                      {d.sales}
                    </span>
                  </td>
                  <td className="py-1.5 px-2">
                    <span className={`inline-block w-full text-center py-0.5 px-1 rounded text-[10px] font-data font-medium ${getHeatColor(d.revenue, revenueRange.min, revenueRange.max)}`}>
                      {fmtCurrency(d.revenue)}
                    </span>
                  </td>
                  <td className="py-1.5 px-2">
                    <span className={`inline-block w-full text-center py-0.5 px-1 rounded text-[10px] font-data font-medium ${getProfitHeatColor(d.lucro)}`}>
                      {fmtCurrency(d.lucro)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-3 mt-3 text-[9px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-wr-positive/30" /> Excelente</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-wr-positive/15" /> Bom</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-amber-400/15" /> Médio</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-destructive/15" /> Crítico</span>
        </div>
      </CardContent>
    </Card>
  );
}
