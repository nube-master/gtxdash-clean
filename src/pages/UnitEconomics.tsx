import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { mockAds, getOverviewMetrics } from "@/data/mockData";
import { DollarSign, TrendingUp, Calculator, Target, Percent, PiggyBank, BarChart3, Scale } from "lucide-react";

function fmtCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
}

export default function UnitEconomics() {
  const [margin, setMargin] = useState(35);
  const [fixedCost, setFixedCost] = useState(5000);
  const metrics = useMemo(() => getOverviewMetrics(mockAds), []);

  const breakEvenRoas = margin > 0 ? 1 / (margin / 100) : 0;
  const grossProfit = metrics.faturamento * (margin / 100);
  const netProfit = grossProfit - metrics.spend - fixedCost;
  const realMargin = metrics.faturamento > 0 ? (netProfit / metrics.faturamento) * 100 : 0;
  const roi = metrics.spend > 0 ? ((netProfit) / metrics.spend) * 100 : 0;

  const cards = [
    { label: "CAC", value: fmtCurrency(metrics.cac), icon: Target, color: "text-warroom-warning" },
    { label: "ROAS", value: `${metrics.roas.toFixed(2)}x`, icon: TrendingUp, color: metrics.roas >= breakEvenRoas ? "text-warroom-positive" : "text-warroom-negative" },
    { label: "AOV", value: fmtCurrency(metrics.ticketMedio), icon: DollarSign, color: "text-warroom-info" },
    { label: "Conversão", value: `${metrics.conversao.toFixed(2)}%`, icon: Percent, color: "text-warroom-info" },
    { label: "Break Even ROAS", value: `${breakEvenRoas.toFixed(2)}x`, icon: Scale, color: "text-warroom-warning" },
    { label: "Lucro Estimado", value: fmtCurrency(netProfit), icon: PiggyBank, color: netProfit >= 0 ? "text-warroom-positive" : "text-warroom-negative" },
    { label: "Margem Real", value: `${realMargin.toFixed(1)}%`, icon: BarChart3, color: realMargin >= 0 ? "text-warroom-positive" : "text-warroom-negative" },
    { label: "ROI Líquido", value: `${roi.toFixed(0)}%`, icon: Calculator, color: roi >= 0 ? "text-warroom-positive" : "text-warroom-negative" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Unit Economics</h1>
        <p className="text-sm text-muted-foreground font-mono">Rentabilidade real da operação</p>
      </div>

      {/* Editable Fields */}
      <Card className="warroom-card border-primary/20">
        <CardHeader>
          <CardTitle className="text-sm font-mono uppercase tracking-wider text-muted-foreground">
            Parâmetros
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-6">
          <div className="space-y-2">
            <Label htmlFor="margin" className="text-xs font-mono text-muted-foreground">
              Margem do Produto (%)
            </Label>
            <Input
              id="margin"
              type="number"
              value={margin}
              onChange={(e) => setMargin(Number(e.target.value))}
              className="w-32 font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fixed" className="text-xs font-mono text-muted-foreground">
              Custo Fixo Mensal (R$)
            </Label>
            <Input
              id="fixed"
              type="number"
              value={fixedCost}
              onChange={(e) => setFixedCost(Number(e.target.value))}
              className="w-32 font-mono"
            />
          </div>
        </CardContent>
      </Card>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="warroom-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                {label}
              </CardTitle>
              <Icon className={`h-4 w-4 ${color}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-xl font-bold font-mono ${color}`}>{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
