import { TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmt, type Projections } from "@/lib/planningUtils";

interface Props {
  projections: Projections;
  elapsed: number;
  cpaMax: number;
}

function StatusBadge({ status }: { status: "green" | "yellow" | "red" }) {
  const config = {
    green: { label: "Acima da Meta", className: "border-success/30 text-success bg-success/5" },
    yellow: { label: "Dentro do Esperado", className: "border-amber-400/30 text-amber-400 bg-amber-400/5" },
    red: { label: "Abaixo da Meta", className: "border-red/30 text-red bg-red/5" },
  };
  const c = config[status];
  return <Badge variant="outline" className={`text-[9px] font-semibold ${c.className}`}>{c.label}</Badge>;
}

export function PlanningProjections({ projections, elapsed, cpaMax }: Props) {
  return (
    <Card className="bg-card border border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-wr-info" />
          Projeção Automática
          <span className="text-[10px] text-muted-foreground font-normal ml-2">Baseado no ritmo dos últimos {elapsed} dias</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <ProjectionCard label="Lucro Líquido" value={fmt(projections.projLucroLiquido, "currency")} status={projections.profitStatus} />
          <ProjectionCard label="Margem" value={fmt(projections.projMargemPct, "percent")} status={projections.marginStatus} />
          <ProjectionCard label="Faturamento" value={fmt(projections.projRevenue, "currency")} status={projections.revenueStatus} />
          <ProjectionCard label="Vendas" value={fmt(projections.projSales, "number")} status={projections.salesStatus} />
          <ProjectionCard label="CPA Projetado" value={fmt(projections.projCpa, "currency")} status={projections.cpaStatus} subLabel={cpaMax > 0 ? `Máx: ${fmt(cpaMax, "currency")}` : undefined} />
          <ProjectionCard label="Lucro Bruto" value={fmt(projections.projLucro, "currency")} status={projections.projLucro >= 0 ? "green" : "red"} />
        </div>
      </CardContent>
    </Card>
  );
}

function ProjectionCard({ label, value, status, subLabel }: { label: string; value: string; status: "green" | "yellow" | "red"; subLabel?: string }) {
  const borderColor = status === "green" ? "border-success/20" : status === "yellow" ? "border-amber-400/20" : "border-red/20";

  return (
    <div className={`p-3 rounded-md border ${borderColor} bg-secondary/30 space-y-2`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{label}</span>
        <StatusBadge status={status} />
      </div>
      <p className="text-lg font-semibold font-data text-foreground">{value}</p>
      {subLabel && <p className="text-[10px] text-muted-foreground">{subLabel}</p>}
    </div>
  );
}
