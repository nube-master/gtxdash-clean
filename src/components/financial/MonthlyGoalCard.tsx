import { Card, CardContent } from "@/components/ui/card";
import { Target, CalendarDays, TrendingUp, PiggyBank } from "lucide-react";
import { useMonthTotals } from "@/hooks/useMonthlyGoals";
import { usePlanningGoals } from "@/hooks/usePlanningGoals";

function fmtCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
}

export function MonthlyGoalCard() {
  const { data: totals } = useMonthTotals();
  const { data: planningGoal } = usePlanningGoals();

  const currentRevenue = totals?.revenue ?? 0;
  const currentProfit = totals?.profit ?? 0;
  const goalRevenue = planningGoal?.revenue_goal ?? 0;
  const profitGoal = planningGoal?.profit_goal ?? 0;

  if (!goalRevenue || goalRevenue <= 0) return null;

  const progress = Math.min((currentRevenue / goalRevenue) * 100, 100);
  const remaining = Math.max(goalRevenue - currentRevenue, 0);

  const now = new Date();
  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const currentDay = now.getDate();
  const daysRemaining = Math.max(lastDayOfMonth - currentDay, 1);
  const dailyPaceNeeded = remaining / daysRemaining;

  // Profit calculations
  const profitRemaining = profitGoal > 0 ? Math.max(profitGoal - currentProfit, 0) : 0;
  const profitPerDay = profitGoal > 0 ? profitRemaining / daysRemaining : 0;

  const barColor =
    progress >= 80 ? "hsl(var(--wr-positive))" :
    progress >= 50 ? "hsl(45 93% 47%)" :
    "hsl(var(--destructive))";

  return (
    <Card className="bg-card border border-border overflow-hidden">
      <CardContent className="px-5 py-4 md:p-5">
        <div className="flex items-center gap-2 mb-3">
          <Target className="h-4 w-4 text-primary" />
          <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground font-semibold">
            Meta do Mês
          </span>
        </div>

        <div className="flex items-baseline gap-2 mb-3">
          <span className="text-2xl md:text-xl font-bold font-mono text-foreground">
            {fmtCurrency(currentRevenue)}
          </span>
          <span className="text-sm font-mono text-muted-foreground">
            / {fmtCurrency(goalRevenue)}
          </span>
        </div>

        <div className="relative mb-2">
          <div className="w-full h-3 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progress}%`, backgroundColor: barColor }}
            />
          </div>
        </div>

        <div className="flex justify-between text-[11px] font-mono text-muted-foreground mb-3">
          <span>{progress.toFixed(1)}% atingido</span>
          <span>Falta {fmtCurrency(remaining)}</span>
        </div>

        {/* Linha 1 — Receita */}
        <div className="grid grid-cols-3 gap-3 pt-3 border-t border-border">
          <div className="flex flex-col items-center gap-0.5">
            <div className="flex items-center gap-1 text-muted-foreground">
              <CalendarDays className="h-3 w-3" />
              <span className="text-[10px] font-mono uppercase">Dias restantes</span>
            </div>
            <span className="text-sm font-bold font-mono text-foreground">{daysRemaining}</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Target className="h-3 w-3" />
              <span className="text-[10px] font-mono uppercase">Falta</span>
            </div>
            <span className="text-sm font-bold font-mono text-foreground">{fmtCurrency(remaining)}</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <div className="flex items-center gap-1 text-muted-foreground">
              <TrendingUp className="h-3 w-3" />
              <span className="text-[10px] font-mono uppercase">Receita/dia</span>
            </div>
            <span className="text-sm font-bold font-mono text-foreground">{fmtCurrency(dailyPaceNeeded)}</span>
          </div>
        </div>

        {/* Linha 2 — Lucro */}
        {profitGoal > 0 && (
          <div className="grid grid-cols-3 gap-3 pt-3 mt-3 border-t border-border">
            <div className="flex flex-col items-center gap-0.5">
              <div className="flex items-center gap-1 text-muted-foreground">
                <PiggyBank className="h-3 w-3" />
                <span className="text-[10px] font-mono uppercase">Meta lucro</span>
              </div>
              <span className="text-sm font-bold font-mono text-foreground">{fmtCurrency(profitGoal)}</span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <div className="flex items-center gap-1 text-muted-foreground">
                <PiggyBank className="h-3 w-3" />
                <span className="text-[10px] font-mono uppercase">Falta lucro</span>
              </div>
              <span className="text-sm font-bold font-mono text-foreground">{fmtCurrency(profitRemaining)}</span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <div className="flex items-center gap-1 text-muted-foreground">
                <TrendingUp className="h-3 w-3" />
                <span className="text-[10px] font-mono uppercase">Lucro/dia</span>
              </div>
              <span className="text-sm font-bold font-mono text-foreground">{fmtCurrency(profitPerDay)}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
