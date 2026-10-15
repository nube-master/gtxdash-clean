import { useState } from "react";
import { Sliders, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fmt, type GoalConfig } from "@/lib/planningUtils";

interface Props {
  config: GoalConfig;
  totalDays: number;
}

export function PlanningSimulation({ config, totalDays }: Props) {
  const [open, setOpen] = useState(false);
  const [dailyBudget, setDailyBudget] = useState("");
  const [simCpa, setSimCpa] = useState("");
  const [convRate, setConvRate] = useState("");

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Sliders className="h-3.5 w-3.5" />
        Simular Cenário
      </Button>
    );
  }

  const budget = Number(dailyBudget) || 0;
  const cpa = Number(simCpa) || 0;
  const conv = Number(convRate) || 0;

  const totalInvest = budget * totalDays;

  // Method 1: by CPA
  const salesByCpa = cpa > 0 ? totalInvest / cpa : 0;
  // Method 2: by conversion rate (clicks to sales, rough estimate using avg CPC from CPA)
  const salesByConv = conv > 0 && config.avgPrice > 0 ? (totalInvest / config.cpaGoal) * (conv / 100) * (config.cpaGoal > 0 ? 1 : 0) : 0;

  const simSales = cpa > 0 ? salesByCpa : salesByConv;
  const simRevenue = simSales * config.avgPrice;
  const simCogs = config.cogs * simSales;
  const simFees = simRevenue * (config.feeRate / 100);
  const simTaxes = simRevenue * (config.taxRate / 100);
  const simLucro = simRevenue - totalInvest - simCogs - simFees - simTaxes;
  const simRoas = totalInvest > 0 ? simRevenue / totalInvest : 0;

  const reset = () => { setDailyBudget(""); setSimCpa(""); setConvRate(""); };

  return (
    <Card className="bg-card border border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Sliders className="h-4 w-4 text-primary" />
          Simulador de Cenário
          <Badge variant="outline" className="text-[9px] border-primary/30 text-primary bg-primary/5 ml-auto">SIMULAÇÃO</Badge>
          <Button variant="ghost" size="sm" className="h-6 px-2 ml-1" onClick={() => setOpen(false)}>✕</Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Orçamento Diário</Label>
            <Input type="number" value={dailyBudget} onChange={(e) => setDailyBudget(e.target.value)} placeholder="R$ 500" className="h-9 text-sm font-data" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">CPA Projetado</Label>
            <Input type="number" value={simCpa} onChange={(e) => setSimCpa(e.target.value)} placeholder="R$ 40" className="h-9 text-sm font-data" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Taxa Conversão (%)</Label>
            <Input type="number" value={convRate} onChange={(e) => setConvRate(e.target.value)} placeholder="2.5" className="h-9 text-sm font-data" />
          </div>
        </div>

        {(budget > 0 && (cpa > 0 || conv > 0)) && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-2 border-t border-border">
            <SimResult label="Vendas" value={fmt(simSales, "number")} />
            <SimResult label="Faturamento" value={fmt(simRevenue, "currency")} />
            <SimResult label="Lucro Líquido" value={fmt(simLucro, "currency")} positive={simLucro >= 0} />
            <SimResult label="ROAS" value={fmt(simRoas, "roas")} positive={simRoas >= 1} />
            <SimResult label="Investimento Total" value={fmt(totalInvest, "currency")} />
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={reset}>
            <RotateCcw className="h-3 w-3" />
            Resetar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SimResult({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="space-y-1">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{label}</span>
      <p className={`text-base font-semibold font-data ${positive === undefined ? "text-foreground" : positive ? "text-success" : "text-red"}`}>{value}</p>
    </div>
  );
}
