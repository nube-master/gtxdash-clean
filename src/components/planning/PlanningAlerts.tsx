import { AlertTriangle, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmt } from "@/lib/planningUtils";
import type { RealMetrics, Projections, GoalConfig } from "@/lib/planningUtils";

interface Props {
  realMetrics: RealMetrics;
  projections: Projections;
  config: GoalConfig;
  remaining: number;
  elapsed: number;
}

export function PlanningAlerts({ realMetrics, projections, config, remaining, elapsed }: Props) {
  const msgs: { type: "info" | "warn" | "danger"; text: string }[] = [];

  // PRIMARY: Profit goal alerts
  if (config.profitGoal > 0) {
    const profitDiffPct = ((projections.projLucroLiquido - config.profitGoal) / config.profitGoal) * 100;
    if (profitDiffPct < -5) {
      msgs.push({ type: "danger", text: `Lucro projetado ficará ${Math.abs(profitDiffPct).toFixed(0)}% abaixo da meta de ${fmt(config.profitGoal, "currency")}.` });
    } else if (profitDiffPct >= -5 && profitDiffPct <= 5) {
      msgs.push({ type: "warn", text: `Lucro projetado está dentro de ±5% da meta de ${fmt(config.profitGoal, "currency")}.` });
    } else {
      msgs.push({ type: "info", text: `Lucro projetado ficará ${profitDiffPct.toFixed(0)}% acima da meta de lucro!` });
    }

    // Daily profit pace
    if (remaining > 0) {
      const profitRemaining = config.profitGoal - realMetrics.lucroLiquido;
      if (profitRemaining > 0) {
        const neededPerDay = profitRemaining / remaining;
        const currentPerDay = elapsed > 0 ? realMetrics.lucroLiquido / elapsed : 0;
        msgs.push({
          type: currentPerDay >= neededPerDay ? "info" : "warn",
          text: `Precisa de ${fmt(neededPerDay, "currency")}/dia de lucro nos próximos ${remaining} dias. Ritmo atual: ${fmt(currentPerDay, "currency")}/dia.`,
        });
      }
    }
  }

  // MARGIN alert
  if (config.marginGoal > 0 && realMetrics.totalSpend > 0) {
    const marginDiff = realMetrics.margemPct - config.marginGoal;
    if (marginDiff < -3) {
      msgs.push({ type: "danger", text: `Margem está em ${fmt(realMetrics.margemPct, "percent")}, abaixo da meta de ${fmt(config.marginGoal, "percent")}.` });
    } else if (marginDiff >= -3 && marginDiff <= 3) {
      msgs.push({ type: "warn", text: `Margem sobre investimento ${fmt(realMetrics.marginOnInvest, "percent")} está próxima da meta de ${fmt(config.marginGoal, "percent")}.` });
    } else {
      msgs.push({ type: "info", text: `Margem sobre investimento ${fmt(realMetrics.marginOnInvest, "percent")} está acima da meta de ${fmt(config.marginGoal, "percent")}!` });
    }
  }

  // CPA alert (secondary)
  if (config.cpaGoal > 0 && realMetrics.cpaReal > 0) {
    const cpaDiff = ((realMetrics.cpaReal - config.cpaGoal) / config.cpaGoal) * 100;
    if (cpaDiff > 10) {
      msgs.push({ type: "warn", text: `CPA real ${fmt(realMetrics.cpaReal, "currency")} está ${cpaDiff.toFixed(0)}% acima da meta de ${fmt(config.cpaGoal, "currency")}.` });
    }
  }

  if (msgs.length === 0) return null;

  return (
    <Card className="bg-card border border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-wr-warning" />
          Alertas & Insights
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {msgs.map((alert, i) => (
          <div
            key={i}
            className={`flex items-start gap-3 p-3 rounded-md border ${
              alert.type === "danger" ? "border-destructive/20 bg-destructive/5" :
              alert.type === "warn" ? "border-amber-400/20 bg-amber-400/5" :
              "border-wr-info/20 bg-wr-info/5"
            }`}
          >
            {alert.type === "danger" ? (
              <ArrowDownRight className="h-4 w-4 text-red shrink-0 mt-0.5" />
            ) : alert.type === "warn" ? (
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            ) : (
              <ArrowUpRight className="h-4 w-4 text-wr-info shrink-0 mt-0.5" />
            )}
            <p className="text-xs text-foreground">{alert.text}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
