import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { History } from "lucide-react";
import { useAllMonthlyGoals, useMonthlyHistoricalRevenue } from "@/hooks/useMonthlyGoals";

function fmtCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
}

const MONTH_NAMES: Record<string, string> = {
  "01": "Jan", "02": "Fev", "03": "Mar", "04": "Abr",
  "05": "Mai", "06": "Jun", "07": "Jul", "08": "Ago",
  "09": "Set", "10": "Out", "11": "Nov", "12": "Dez",
};

export function MonthlyGoalsHistory() {
  const { data: goals = [] } = useAllMonthlyGoals();
  const months = goals.map((g) => g.month);
  const { data: revenueMap = {} } = useMonthlyHistoricalRevenue(months);

  if (goals.length === 0) return null;

  return (
    <Card className="bg-card border border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <History className="h-4 w-4" />
          Histórico de Metas
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {goals.map((goal) => {
            const [, m] = goal.month.split("-");
            const label = MONTH_NAMES[m] ?? m;
            const real = revenueMap[goal.month] ?? 0;
            const pct = goal.goal_value > 0 ? (real / goal.goal_value) * 100 : 0;
            const pctColor = pct >= 100 ? "text-wr-positive" : pct >= 50 ? "text-yellow-500" : "text-destructive";

            return (
              <div
                key={goal.month}
                className="rounded-lg border border-border bg-secondary/30 p-3 space-y-1"
              >
                <div className="text-xs font-mono font-semibold uppercase text-muted-foreground">{label}</div>
                <div className="text-[11px] font-mono text-muted-foreground">
                  Meta: {fmtCurrency(goal.goal_value)}
                </div>
                <div className="text-[11px] font-mono text-muted-foreground">
                  Real: {fmtCurrency(real)}
                </div>
                <div className={`text-sm font-bold font-mono ${pctColor}`}>
                  {pct.toFixed(0)}%
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
