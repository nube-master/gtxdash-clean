import { useMemo, useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { usePlanningGoals, useSavePlanningGoal } from "@/hooks/usePlanningGoals";
import { useRealSalesByRange, useTrafficDataByRange } from "@/hooks/useDataByRange";
import { toast } from "sonner";
import {
  toISO, diffDays, remainingDays, elapsedDays,
  computeRealMetrics, computeProfitTargets, computeProjections,
  type GoalConfig,
} from "@/lib/planningUtils";
import { PlanningGoalConfig } from "@/components/planning/PlanningGoalConfig";
import { PlanningRealResults } from "@/components/planning/PlanningRealResults";
import { PlanningBreakdown } from "@/components/planning/PlanningBreakdown";
import { PlanningProjections } from "@/components/planning/PlanningProjections";
import { PlanningAlerts } from "@/components/planning/PlanningAlerts";
import { PlanningSimulation } from "@/components/planning/PlanningSimulation";
import { PlanningProgressBars } from "@/components/planning/PlanningProgressBars";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "lucide-react";
import { fmt } from "@/lib/planningUtils";

export default function Planning() {
  const { data: savedGoal, isLoading: goalLoading } = usePlanningGoals();
  const saveMutation = useSavePlanningGoal();

  const [config, setConfig] = useState<GoalConfig>({
    revenueGoal: 0, salesGoal: 0, cpaGoal: 0, avgPrice: 0,
    profitGoal: 0, marginGoal: 30, cogs: 0, taxRate: 0, feeRate: 0,
    startDate: toISO(new Date()),
    endDate: (() => { const d = new Date(); d.setDate(d.getDate() + 30); return toISO(d); })(),
  });
  const [goalId, setGoalId] = useState<string | undefined>();

  useEffect(() => {
    if (savedGoal) {
      setConfig({
        revenueGoal: savedGoal.revenue_goal,
        salesGoal: savedGoal.sales_goal,
        cpaGoal: savedGoal.cpa_goal,
        avgPrice: savedGoal.average_product_price,
        profitGoal: savedGoal.profit_goal,
        marginGoal: savedGoal.margin_goal || 30,
        cogs: savedGoal.cogs,
        taxRate: savedGoal.tax_rate,
        feeRate: savedGoal.fee_rate,
        startDate: savedGoal.start_date,
        endDate: savedGoal.end_date,
      });
      setGoalId(savedGoal.id);
    }
  }, [savedGoal]);

  const handleChange = (key: keyof GoalConfig, value: string) => {
    setConfig((prev) => {
      const next = {
        ...prev,
        [key]: key === "startDate" || key === "endDate" ? value : Number(value) || 0,
      };

      // Auto-calculate revenue & sales from profit goal + margin + CPA + avg price
      const { profitGoal, avgPrice, cogs, taxRate, feeRate, cpaGoal } = next;
      if (profitGoal > 0 && avgPrice > 0) {
        const deductionsPerUnit = cogs + avgPrice * ((feeRate + taxRate) / 100);
        const netPerUnit = avgPrice - deductionsPerUnit;
        const effectiveCpa = cpaGoal > 0 ? cpaGoal : 0;
        const profitPerSale = netPerUnit - effectiveCpa;
        if (profitPerSale > 0) {
          next.salesGoal = Math.ceil(profitGoal / profitPerSale);
          next.revenueGoal = next.salesGoal * avgPrice;
        }
      }

      return next;
    });
  };

  const handleSave = () => {
    saveMutation.mutate(
      {
        id: goalId,
        revenue_goal: config.revenueGoal,
        sales_goal: config.salesGoal,
        cpa_goal: config.cpaGoal,
        average_product_price: config.avgPrice,
        profit_goal: config.profitGoal,
        margin_goal: config.marginGoal,
        cogs: config.cogs,
        tax_rate: config.taxRate,
        fee_rate: config.feeRate,
        start_date: config.startDate,
        end_date: config.endDate,
      },
      { onSuccess: (data) => { setGoalId(data.id); toast.success("Meta salva com sucesso!"); } }
    );
  };

  const totalDays = diffDays(config.startDate, config.endDate);
  const remaining = remainingDays(config.endDate);
  const elapsed = elapsedDays(config.startDate);

  const { data: allSales } = useRealSalesByRange(config.startDate, config.endDate);
  const { data: allTraffic } = useTrafficDataByRange(config.startDate, config.endDate);

  const realMetrics = useMemo(
    () => computeRealMetrics(allSales || [], allTraffic || [], config),
    [allSales, allTraffic, config]
  );

  const profitTargets = useMemo(() => computeProfitTargets(config), [config]);

  const projections = useMemo(
    () => computeProjections(realMetrics, elapsed, totalDays, config),
    [realMetrics, elapsed, totalDays, config]
  );

  // Daily targets — profit-centric
  const dailyTargets = useMemo(() => {
    const profitPerDay = totalDays > 0 ? config.profitGoal / totalDays : 0;
    const revenuePerDay = totalDays > 0 ? config.revenueGoal / totalDays : 0;
    const salesPerDay = totalDays > 0 ? config.salesGoal / totalDays : 0;
    const maxDailyInvest = salesPerDay > 0 ? salesPerDay * config.cpaGoal : 0;

    // Real daily profit so far
    const realProfitPerDay = elapsed > 0 ? realMetrics.lucroLiquido / elapsed : 0;

    return { profitPerDay, revenuePerDay, salesPerDay, maxDailyInvest, realProfitPerDay };
  }, [config, totalDays, elapsed, realMetrics]);

  if (goalLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 full-width-page w-full">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Planejamento & Metas</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Central financeira de escala — decisões baseadas em lucro real e margem</p>
      </div>

      <PlanningGoalConfig config={config} onChange={handleChange} onSave={handleSave} saving={saveMutation.isPending} profitTargets={profitTargets} />

      {/* Daily Targets Summary — Profit First */}
      <Card className="bg-card border border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Calendar className="h-4 w-4 text-wr-info" />
            Metas Diárias
            <span className="text-[10px] text-muted-foreground font-normal ml-2">{totalDays} dias totais • {remaining} restantes</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <DailyCell label="Lucro/Dia (Meta)" value={fmt(dailyTargets.profitPerDay, "currency")} highlight />
            <DailyCell label="Lucro/Dia (Real)" value={fmt(dailyTargets.realProfitPerDay, "currency")} positive={dailyTargets.realProfitPerDay >= dailyTargets.profitPerDay * 0.7} />
            <DailyCell label="Margem Meta" value={fmt(config.marginGoal, "percent")} highlight />
            <DailyCell label="Margem Real" value={fmt(realMetrics.margemPct, "percent")} positive={realMetrics.margemPct >= config.marginGoal * 0.7} />
            <DailyCell label="Invest. Máx/Dia" value={fmt(dailyTargets.maxDailyInvest, "currency")} />
          </div>
        </CardContent>
      </Card>

      {/* Progress Bars — Profit & Margin first */}
      <PlanningProgressBars
        items={[
          { label: "Meta Lucro", current: realMetrics.lucroLiquido, goal: config.profitGoal, format: "currency" },
          { label: "Meta Margem", current: realMetrics.margemPct, goal: config.marginGoal, format: "percent" },
          { label: "Meta Receita", current: realMetrics.totalRevenue, goal: config.revenueGoal, format: "currency" },
          { label: "Meta Vendas", current: realMetrics.totalSales, goal: config.salesGoal, format: "number" },
        ]}
      />

      <PlanningRealResults metrics={realMetrics} config={config} />
      <PlanningBreakdown metrics={realMetrics} totalSpend={realMetrics.totalSpend} cogs={config.cogs} totalSales={realMetrics.totalSales} feeRate={config.feeRate} taxRate={config.taxRate} />
      <PlanningProjections projections={projections} elapsed={elapsed} cpaMax={profitTargets.cpaMax} />
      <PlanningAlerts realMetrics={realMetrics} projections={projections} config={config} remaining={remaining} elapsed={elapsed} />
      <PlanningSimulation config={config} totalDays={totalDays} />
    </div>
  );
}

function DailyCell({ label, value, highlight, positive }: { label: string; value: string; highlight?: boolean; positive?: boolean }) {
  const borderClass = highlight ? "border-primary/30" : positive !== undefined ? (positive ? "border-emerald-500/30" : "border-amber-400/30") : "border-border";
  const valueColor = positive !== undefined ? (positive ? "text-emerald-500" : "text-amber-400") : "text-foreground";

  return (
    <div className={`p-3 rounded-md bg-secondary/30 border ${borderClass} space-y-1`}>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{label}</span>
      <p className={`text-base font-semibold font-data ${valueColor}`}>{value}</p>
    </div>
  );
}
