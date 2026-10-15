import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, TrendingUp, TrendingDown } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, Tooltip } from "recharts";
import { buildSeries, type HistoryPoint } from "@/lib/spyHistory";

interface Props {
  history: HistoryPoint[];
  currentActive: number;
  onSeeMore: () => void;
}

export function SpyEvolutionPreview({ history, currentActive, onSeeMore }: Props) {
  const series = useMemo(() => buildSeries(history).slice(-7), [history]);

  const chartData = series.length
    ? series.map((p) => ({ date: p.label, Ativos: p.active }))
    : [{ date: "Hoje", Ativos: currentActive }];

  // Delta entre o primeiro e o último ponto da série exibida
  const first = series[0]?.active ?? null;
  const last = series[series.length - 1]?.active ?? currentActive;
  const delta = first != null ? last - first : null;
  const pct = first && first > 0 ? ((last - first) / first) * 100 : null;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <TrendingUp className="h-4 w-4 text-primary mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold">Evolução de Anúncios</h3>
            <p className="text-[11px] text-muted-foreground">
              {series.length <= 1
                ? "Aguardando segundo snapshot para comparar dias."
                : `Comparativo dos últimos ${series.length} dias.`}
            </p>
            {delta != null && series.length >= 2 && (
              <p className={`text-[11px] mt-0.5 flex items-center gap-1 ${delta >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {delta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {delta >= 0 ? "+" : ""}{delta.toLocaleString("pt-BR")} ads
                {pct != null && <span>({pct >= 0 ? "+" : ""}{pct.toFixed(1)}%)</span>}
              </p>
            )}
          </div>
        </div>
        <Button size="sm" variant="ghost" className="text-xs h-7" onClick={onSeeMore}>
          Ver mais <ExternalLink className="h-3 w-3 ml-1" />
        </Button>
      </div>
      <div className="h-32">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
            <defs>
              <linearGradient id="spyEvoPreview" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 11, borderRadius: 8 }}
            />
            <Area type="monotone" dataKey="Ativos" stroke="hsl(var(--primary))" fill="url(#spyEvoPreview)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
