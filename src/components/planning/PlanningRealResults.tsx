import { DollarSign } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { fmt, type RealMetrics, type GoalConfig } from "@/lib/planningUtils";

interface Props {
  metrics: RealMetrics;
  config: GoalConfig;
}

export function PlanningRealResults({ metrics, config }: Props) {
  return (
    <Card className="bg-card border border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-success" />
          Resultado Real
          <Badge variant="outline" className="text-[9px] border-success/30 text-success bg-success/5 ml-auto">LIVE</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          <MetricCell label="Lucro Líquido" value={fmt(metrics.lucroLiquido, "currency")} colorBySign signValue={metrics.lucroLiquido} />
          <MetricCell label="Margem" value={fmt(metrics.margemPct, "percent")} colorBySign signValue={metrics.margemPct - config.marginGoal} />
          <MetricCell label="Investido" value={fmt(metrics.totalSpend, "currency")} />
          <MetricCell label="Faturado" value={fmt(metrics.totalRevenue, "currency")} className="text-success" />
          <MetricCell label="Vendas" value={fmt(metrics.totalSales, "number")} />
          <MetricCell label="CPA Real" value={fmt(metrics.cpaReal, "currency")} />
          <MetricCell label="ROI" value={fmt(metrics.roi, "roas")} colorBySign signValue={metrics.roi} />
          <div className="space-y-2">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">% Meta Lucro</span>
            <p className={`text-lg font-semibold font-data ${metrics.metaPct >= 100 ? "text-success" : metrics.metaPct >= 70 ? "text-foreground" : "text-red"}`}>
              {metrics.metaPct.toFixed(1)}%
            </p>
            <Progress value={Math.min(metrics.metaPct, 100)} className="h-1.5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricCell({ label, value, className, colorBySign, signValue }: {
  label: string; value: string; className?: string; colorBySign?: boolean; signValue?: number;
}) {
  const color = colorBySign && signValue !== undefined
    ? signValue >= 0 ? "text-success" : "text-red"
    : className || "text-foreground";

  return (
    <div className="space-y-1">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{label}</span>
      <p className={`text-lg font-semibold font-data ${color}`}>{value}</p>
    </div>
  );
}
