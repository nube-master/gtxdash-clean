import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Trophy, AlertTriangle } from "lucide-react";

interface ProjectMetric {
  code: string;
  revenue: number;
  spend: number;
  sales: number;
  roas: number;
  cac: number;
  ctr?: number;
  score?: number;
  clicks?: number;
  ics?: number;
  vslViews?: number;
  costPerIc?: number;
}

function fmt(v: number, type: "currency" | "percent" | "roas" | "number") {
  if (type === "currency")
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
  if (type === "percent") return `${v.toFixed(1)}%`;
  if (type === "roas") return `${v.toFixed(2)}x`;
  return new Intl.NumberFormat("pt-BR").format(Math.round(v));
}

const PROJECT_COLORS: Record<string, string> = {
  NDM: "hsl(var(--primary))",
  NDB: "hsl(280, 70%, 55%)",
  
  NDR: "hsl(200, 80%, 55%)",
  MO: "hsl(160, 70%, 45%)",
  LDR: "hsl(185, 80%, 45%)",
  CRT: "hsl(340, 75%, 55%)",
  OUTROS: "hsl(220, 8%, 50%)",
};

const PROJECT_BG: Record<string, string> = {
  NDM: "bg-primary/10 border-primary/30",
  NDB: "bg-purple-500/10 border-purple-500/30",
  
  NDR: "bg-blue-500/10 border-blue-500/30",
  LDR: "bg-cyan-500/10 border-cyan-500/30",
  CRT: "bg-rose-500/10 border-rose-500/30",
  OUTROS: "bg-muted/30 border-border",
};

function MetricBar({ label, projects, accessor, format, higherIsBetter = true }: {
  label: string;
  projects: ProjectMetric[];
  accessor: (p: ProjectMetric) => number;
  format: "currency" | "percent" | "roas" | "number";
  higherIsBetter?: boolean;
}) {
  const values = projects.map(accessor);
  const max = Math.max(...values, 0.01);
  const bestIdx = higherIsBetter
    ? values.indexOf(Math.max(...values))
    : values.indexOf(Math.min(...values.filter(v => v > 0)));

  return (
    <div className="space-y-2">
      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
      <div className="space-y-1.5">
        {projects.map((p, i) => {
          const val = accessor(p);
          const width = max > 0 ? (val / max) * 100 : 0;
          const isBest = i === bestIdx && val > 0;
          return (
            <div key={p.code} className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-muted-foreground w-8 shrink-0">{p.code}</span>
              <div className="flex-1 h-5 bg-secondary/30 rounded-sm overflow-hidden relative">
                <div
                  className="h-full rounded-sm transition-all duration-500"
                  style={{
                    width: `${Math.max(width, 2)}%`,
                    backgroundColor: PROJECT_COLORS[p.code] || PROJECT_COLORS.OUTROS,
                    opacity: isBest ? 1 : 0.6,
                  }}
                />
                <span className="absolute inset-y-0 right-2 flex items-center text-[10px] font-mono font-semibold text-foreground">
                  {fmt(val, format)}
                </span>
              </div>
              {isBest && <Trophy className="h-3 w-3 text-amber-400 shrink-0" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ProjectComparison({ projects }: { projects: ProjectMetric[] }) {
  const sorted = [...projects].filter(p => p.code !== "OUTROS" && p.spend > 0).sort((a, b) => b.revenue - a.revenue);
  if (sorted.length < 2) return null;

  const totalRevenue = sorted.reduce((s, p) => s + p.revenue, 0);

  return (
    <Card className="bg-card border border-border">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Comparativo por Projeto</h3>
          <Badge variant="outline" className="text-[9px] text-muted-foreground">{sorted.length} projetos</Badge>
        </div>

        {/* Scorecards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {sorted.map((p) => {
            const margin = p.revenue > 0 ? ((p.revenue - p.spend) / p.revenue) * 100 : 0;
            const share = totalRevenue > 0 ? (p.revenue / totalRevenue) * 100 : 0;
            const profit = p.revenue - p.spend;
            return (
              <div key={p.code} className={`rounded-lg border p-3 ${PROJECT_BG[p.code] || PROJECT_BG.OUTROS}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold" style={{ color: PROJECT_COLORS[p.code] || PROJECT_COLORS.OUTROS }}>{p.code}</span>
                  <span className="text-[9px] text-muted-foreground">{share.toFixed(0)}% share</span>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground">Receita</span>
                    <span className="font-mono font-semibold text-foreground">{fmt(p.revenue, "currency")}</span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground">Gasto</span>
                    <span className="font-mono font-semibold text-foreground">{fmt(p.spend, "currency")}</span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground">Lucro</span>
                    <span className={`font-mono font-semibold ${profit >= 0 ? "text-wr-positive" : "text-destructive"}`}>{fmt(profit, "currency")}</span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground">ROAS</span>
                    <span className="font-mono font-semibold text-foreground">{fmt(p.roas, "roas")}</span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground">Margem</span>
                    <span className={`font-mono font-semibold ${margin >= 0 ? "text-wr-positive" : "text-destructive"}`}>{margin.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground">Custo/IC</span>
                    <span className="font-mono font-semibold text-foreground">{p.ics && p.ics > 0 ? fmt(p.costPerIc || 0, "currency") : "—"}</span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground">Cliques</span>
                    <span className="font-mono font-semibold text-foreground">{fmt(p.clicks || 0, "number")}</span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground">Views VSL</span>
                    <span className="font-mono font-semibold text-foreground">{fmt(p.vslViews || 0, "number")}</span>
                  </div>
                </div>
                <div className="mt-2 pt-2 border-t border-border/50 flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">{p.sales} vendas · {p.ics || 0} ICs</span>
                  {profit >= 0
                    ? <TrendingUp className="h-3 w-3 text-wr-positive" />
                    : <AlertTriangle className="h-3 w-3 text-destructive" />
                  }
                </div>
              </div>
            );
          })}
        </div>

        {/* Bar charts comparison */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <MetricBar label="Receita" projects={sorted} accessor={p => p.revenue} format="currency" />
          <MetricBar label="ROAS" projects={sorted} accessor={p => p.roas} format="roas" />
          <MetricBar label="CAC" projects={sorted} accessor={p => p.cac} format="currency" higherIsBetter={false} />
          <MetricBar label="Vendas" projects={sorted} accessor={p => p.sales} format="number" />
          <MetricBar label="Custo por IC" projects={sorted} accessor={p => p.costPerIc || 0} format="currency" higherIsBetter={false} />
          <MetricBar label="Cliques" projects={sorted} accessor={p => p.clicks || 0} format="number" />
          <MetricBar label="Views VSL" projects={sorted} accessor={p => p.vslViews || 0} format="number" />
        </div>
      </CardContent>
    </Card>
  );
}
