import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Target, TrendingUp, DollarSign, Percent, Wallet } from "lucide-react";

interface ProjecaoFinalDiaProps {
  sales: any[];
  trafficData: any[];
  revenueGoal: number;
  profitGoal: number;
  periodDays: number;
  /** Authoritative spend/revenue from skyTotals */
  authoritativeTotalSpend?: number;
  authoritativeTotalRevenue?: number;
}

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 }).format(v);
}

export function ProjecaoFinalDia({ sales, trafficData, revenueGoal, profitGoal, periodDays, authoritativeTotalSpend, authoritativeTotalRevenue }: ProjecaoFinalDiaProps) {
  const projection = useMemo(() => {
    // Current time in São Paulo
    const nowSP = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const hoursElapsed = nowSP.getHours() + nowSP.getMinutes() / 60;
    const operatingHours = 18; // assume 6am-midnight
    const effectiveHours = Math.max(1, Math.min(hoursElapsed - 6, operatingHours));
    const projectionFactor = effectiveHours > 0 ? operatingHours / effectiveHours : 1;

    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    const todaySales = (sales || []).filter((s: any) => s.date === today && s.status === "approved");
    const rawRevenue = todaySales.reduce((s: number, sale: any) => s + Number(sale.revenue), 0);
    const currentSales = todaySales.length;

    const todayTraffic = (trafficData || []).filter((t: any) => t.date === today);
    const rawSpend = todayTraffic.reduce((s: number, t: any) => s + Number(t.spend), 0);

    // Use authoritative totals when available (skyTotals parity)
    const currentRevenue = authoritativeTotalRevenue ?? rawRevenue;
    const currentSpend = authoritativeTotalSpend ?? rawSpend;

    const projectedRevenue = currentRevenue * projectionFactor;
    const projectedSpend = currentSpend * projectionFactor;
    const projectedProfit = projectedRevenue - projectedSpend;
    const currentRoas = currentSpend > 0 ? currentRevenue / currentSpend : 0;
    const projectedRoas = projectedSpend > 0 ? projectedRevenue / projectedSpend : 0;

    // Daily goals
    const dailyRevenueGoal = periodDays > 0 ? revenueGoal / periodDays : 0;
    const dailyProfitGoal = periodDays > 0 ? profitGoal / periodDays : 0;

    // Chance to hit target (simple linear projection)
    const revenueChance = dailyRevenueGoal > 0
      ? Math.min(100, (projectedRevenue / dailyRevenueGoal) * 100)
      : 100;
    const profitChance = dailyProfitGoal > 0
      ? Math.min(100, Math.max(0, (projectedProfit / dailyProfitGoal) * 100))
      : 100;
    const overallChance = (revenueChance + profitChance) / 2;

    return {
      projectedRevenue,
      projectedSpend,
      projectedProfit,
      projectedRoas,
      currentRevenue,
      currentSpend,
      hoursElapsed: effectiveHours,
      revenueChance,
      profitChance,
      overallChance,
      dailyRevenueGoal,
      dailyProfitGoal,
    };
  }, [sales, trafficData, revenueGoal, profitGoal, periodDays, authoritativeTotalSpend, authoritativeTotalRevenue]);

  const chanceColor =
    projection.overallChance >= 80 ? "text-wr-positive" :
    projection.overallChance >= 50 ? "text-amber-400" :
    "text-destructive";
  const chanceBg =
    projection.overallChance >= 80 ? "bg-wr-positive" :
    projection.overallChance >= 50 ? "bg-amber-400" :
    "bg-destructive";

  return (
    <Card className="bg-card border border-border">
      <CardContent className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Clock className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="text-xs font-semibold text-foreground">Projeção Final do Dia</h3>
            <p className="text-[9px] text-muted-foreground">
              Baseada em {projection.hoursElapsed.toFixed(0)}h de operação
            </p>
          </div>
          <div className="text-right">
            <span className={`text-2xl font-bold font-data ${chanceColor}`}>
              {projection.overallChance.toFixed(0)}%
            </span>
            <p className="text-[9px] text-muted-foreground">chance de bater meta</p>
          </div>
        </div>

        {/* Progress to goal */}
        <div className="h-2 bg-secondary/30 rounded-full overflow-hidden mb-4">
          <div
            className={`h-full rounded-full ${chanceBg} transition-all duration-700`}
            style={{ width: `${Math.min(100, projection.overallChance)}%` }}
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="rounded-lg bg-secondary/20 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <DollarSign className="h-3 w-3 text-muted-foreground" />
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Receita Est.</span>
            </div>
            <p className="text-base font-bold font-data text-wr-positive">{fmt(projection.projectedRevenue)}</p>
            {projection.dailyRevenueGoal > 0 && (
              <p className="text-[9px] text-muted-foreground mt-0.5">Meta: {fmt(projection.dailyRevenueGoal)}</p>
            )}
          </div>
          <div className="rounded-lg bg-secondary/20 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Wallet className="h-3 w-3 text-muted-foreground" />
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Invest. Est.</span>
            </div>
            <p className="text-base font-bold font-data text-amber-400">{fmt(projection.projectedSpend)}</p>
            <p className="text-[9px] text-muted-foreground mt-0.5">Atual: {fmt(projection.currentSpend)}</p>
          </div>
          <div className="rounded-lg bg-secondary/20 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingUp className="h-3 w-3 text-muted-foreground" />
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Lucro Est.</span>
            </div>
            <p className={`text-base font-bold font-data ${projection.projectedProfit >= 0 ? "text-wr-positive" : "text-destructive"}`}>
              {fmt(projection.projectedProfit)}
            </p>
            {projection.dailyProfitGoal > 0 && (
              <p className="text-[9px] text-muted-foreground mt-0.5">Meta: {fmt(projection.dailyProfitGoal)}</p>
            )}
          </div>
          <div className="rounded-lg bg-secondary/20 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Target className="h-3 w-3 text-muted-foreground" />
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider">ROAS Est.</span>
            </div>
            <p className={`text-base font-bold font-data ${projection.projectedRoas >= 1 ? "text-wr-positive" : "text-destructive"}`}>
              {projection.projectedRoas.toFixed(2)}x
            </p>
          </div>
          <div className="rounded-lg bg-secondary/20 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Percent className="h-3 w-3 text-muted-foreground" />
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Chance Meta</span>
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px]">
                <span className="text-muted-foreground">Receita:</span>{" "}
                <span className={`font-data font-semibold ${projection.revenueChance >= 70 ? "text-wr-positive" : "text-amber-400"}`}>
                  {projection.revenueChance.toFixed(0)}%
                </span>
              </p>
              <p className="text-[10px]">
                <span className="text-muted-foreground">Lucro:</span>{" "}
                <span className={`font-data font-semibold ${projection.profitChance >= 70 ? "text-wr-positive" : "text-amber-400"}`}>
                  {projection.profitChance.toFixed(0)}%
                </span>
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
