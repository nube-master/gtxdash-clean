import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PnLResult } from "@/lib/financialEngine";

function fmtCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}

export function PnLSummary({ pnl }: { pnl: PnLResult }) {
  const lines = [
    { label: "Receita Bruta", value: pnl.revenue, indent: false, bold: true },
    { label: "(-) Investimento em Tráfego", value: -pnl.trafficSpend, indent: true },
    ...pnl.manualAdjustmentsBreakdown.map(ma => ({ label: `(-) ${ma.name}`, value: -ma.value, indent: true })),
    ...pnl.variableCostsBreakdown.map(vc => ({ label: `(-) ${vc.name}`, value: -vc.value, indent: true })),
    ...pnl.commissionsBreakdown.map(cm => ({ label: `(-) ${cm.name} (${cm.role_title})`, value: -cm.value, indent: true })),
    ...pnl.fixedCostsBreakdown.map(fc => ({ label: `(-) ${fc.name}`, value: -fc.value, indent: true })),
    { label: "= Lucro Operacional Real", value: pnl.operatingProfit, indent: false, bold: true, highlight: true },
    { label: "Margem Operacional Real", value: pnl.operatingMargin, indent: false, bold: true, highlight: true, isPercent: true },
  ];

  return (
    <Card className="bg-card border border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-mono uppercase tracking-wider text-muted-foreground">
          Demonstrativo P&L
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {lines.map((line, i) => {
          const color = line.highlight
            ? (line.isPercent ? (line.value >= 0 ? "text-wr-positive" : "text-destructive") : (line.value >= 0 ? "text-wr-positive" : "text-destructive"))
            : line.value < 0 ? "text-destructive/80" : "text-foreground";
          return (
            <div
              key={i}
              className={`flex justify-between items-center py-1 ${line.indent ? "pl-4" : ""} ${line.bold ? "font-semibold" : ""} ${line.highlight ? "border-t border-border pt-2 mt-2" : ""}`}
            >
              <span className={`text-xs font-mono ${line.indent ? "text-muted-foreground" : "text-foreground"}`}>
                {line.label}
              </span>
              <span className={`text-xs font-mono font-semibold ${color}`}>
                {line.isPercent ? `${line.value.toFixed(1)}%` : fmtCurrency(Math.abs(line.value))}
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
