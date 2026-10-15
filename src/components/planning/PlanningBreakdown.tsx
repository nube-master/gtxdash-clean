import { Receipt } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmt, type RealMetrics } from "@/lib/planningUtils";

interface Props {
  metrics: RealMetrics;
  totalSpend: number;
  cogs: number;
  totalSales: number;
  feeRate: number;
  taxRate: number;
}

export function PlanningBreakdown({ metrics }: Props) {
  const { totalRevenue, totalSpend, totalSales, lucroLiquido } = metrics;

  return (
    <Card className="bg-card border border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Receipt className="h-4 w-4 text-wr-info" />
          Breakdown Financeiro
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <BreakdownRow label="Receita" value={totalRevenue} positive />
          <BreakdownRow label="− Investimento Ads" value={totalSpend} negative />
          <BreakdownRow label="− Custo Produto (COGS)" value={metrics.lucroBruto !== undefined ? totalRevenue - totalSpend - (metrics.lucroBruto) : 0} negative info={`${totalSales} vendas`} />
          <BreakdownRow label="− Taxas + Impostos" value={metrics.lucroBruto - lucroLiquido} negative />
          <div className="border-t border-border pt-2 mt-2">
            <BreakdownRow label="= Lucro Líquido" value={lucroLiquido} highlight />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BreakdownRow({ label, value, positive, negative, highlight, info }: {
  label: string; value: number; positive?: boolean; negative?: boolean; highlight?: boolean; info?: string;
}) {
  const color = highlight
    ? value >= 0 ? "text-success" : "text-red"
    : positive ? "text-success"
    : negative ? "text-muted-foreground"
    : "text-foreground";

  return (
    <div className={`flex items-center justify-between py-1 ${highlight ? "font-semibold" : ""}`}>
      <div className="flex items-center gap-2">
        <span className={`text-xs ${highlight ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
        {info && <span className="text-[10px] text-muted-foreground">({info})</span>}
      </div>
      <span className={`text-sm font-data font-medium ${color}`}>{fmt(Math.abs(value), "currency")}</span>
    </div>
  );
}
