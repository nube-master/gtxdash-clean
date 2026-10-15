import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Shield } from "lucide-react";
import { KpiHelpIcon } from "@/components/KpiHelpIcon";

interface HealthScoreGTXProps {
  roas: number;
  roasMin: number;
  marginPct: number;
  marginGoal: number;
  revenueGrowth: number; // % change vs previous
  concentrationPct: number; // top campaign % of total spend
  stabilityScore: number; // 0-1, based on variance
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export function HealthScoreGTX({
  roas, roasMin, marginPct, marginGoal, revenueGrowth, concentrationPct, stabilityScore,
}: HealthScoreGTXProps) {
  const { score, breakdown } = useMemo(() => {
    // 1) ROAS score (0-25): full if roas >= roasMin * 1.3, zero if roas < roasMin * 0.5
    const roasNorm = roasMin > 0 ? roas / roasMin : roas;
    const roasScore = clamp((roasNorm - 0.5) / 0.8, 0, 1) * 25;

    // 2) Margin score (0-25): full if marginPct >= marginGoal, zero if <= 0
    const marginNorm = marginGoal > 0 ? marginPct / marginGoal : marginPct > 0 ? 1 : 0;
    const marginScore = clamp(marginNorm, 0, 1) * 25;

    // 3) Growth score (0-20): based on revenue growth %
    const growthScore = clamp((revenueGrowth + 10) / 30, 0, 1) * 20;

    // 4) Concentration score (0-15): lower is better, penalize > 60%
    const concScore = clamp(1 - (concentrationPct - 30) / 50, 0, 1) * 15;

    // 5) Stability score (0-15): directly from input
    const stabScore = clamp(stabilityScore, 0, 1) * 15;

    const total = Math.round(roasScore + marginScore + growthScore + concScore + stabScore);

    return {
      score: total,
      breakdown: [
        { label: "ROAS", value: Math.round(roasScore), max: 25 },
        { label: "Margem", value: Math.round(marginScore), max: 25 },
        { label: "Crescimento", value: Math.round(growthScore), max: 20 },
        { label: "Diversificação", value: Math.round(concScore), max: 15 },
        { label: "Estabilidade", value: Math.round(stabScore), max: 15 },
      ],
    };
  }, [roas, roasMin, marginPct, marginGoal, revenueGrowth, concentrationPct, stabilityScore]);

  const color =
    score >= 70 ? "text-wr-positive" :
    score >= 45 ? "text-amber-400" :
    "text-destructive";
  const bgColor =
    score >= 70 ? "bg-wr-positive" :
    score >= 45 ? "bg-amber-400" :
    "bg-destructive";
  const label =
    score >= 70 ? "Saudável" :
    score >= 45 ? "Atenção" :
    "Crítico";

  return (
    <Card className="bg-card border border-border">
      <CardContent className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Shield className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="text-xs font-semibold text-foreground flex items-center gap-1">Health Score GTX <KpiHelpIcon term="Health Score" /></h3>
            <p className="text-[9px] text-muted-foreground">Índice composto de saúde operacional</p>
          </div>
          <div className="text-right">
            <span className={`text-3xl font-bold font-data ${color}`}>{score}</span>
            <span className="text-sm text-muted-foreground">/100</span>
            <p className={`text-[10px] font-medium ${color}`}>{label}</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-2.5 bg-secondary/30 rounded-full overflow-hidden mb-4">
          <div
            className={`h-full rounded-full ${bgColor} transition-all duration-700`}
            style={{ width: `${score}%` }}
          />
        </div>

        {/* Breakdown */}
        <div className="space-y-2">
          {breakdown.map((b) => (
            <div key={b.label} className="flex items-center gap-3">
              <span className="text-[10px] text-muted-foreground w-24">{b.label}</span>
              <div className="flex-1 h-1.5 bg-secondary/20 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${bgColor}/60 transition-all duration-500`}
                  style={{ width: `${(b.value / b.max) * 100}%` }}
                />
              </div>
              <span className="text-[10px] font-data font-medium text-foreground w-10 text-right">
                {b.value}/{b.max}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
