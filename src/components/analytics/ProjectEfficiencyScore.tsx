import { Card, CardContent } from "@/components/ui/card";
import { Gauge, Trophy, TrendingDown } from "lucide-react";

interface ProjectScore {
  code: string;
  score: number;
  sales: number;
  revenue: number;
  spend: number;
  roas: number;
  cac: number;
}

interface ProjectEfficiencyScoreProps {
  overallScore: number;
  projectScores: ProjectScore[];
  ctr: number;
  playRate: number;
  cvr: number;
  roas: number;
}

function calcScore(ctr: number, playRate: number, cvr: number, roas: number): number {
  const ctrScore = Math.min(ctr / 10, 1) * 20;
  const playScore = Math.min(playRate / 5, 1) * 20;
  const cvrScore = Math.min(cvr / 2, 1) * 30;
  const roasScore = Math.min(roas / 3, 1) * 30;
  return Math.round(ctrScore + playScore + cvrScore + roasScore);
}

function scoreColor(score: number) {
  if (score >= 70) return "text-emerald-400";
  if (score >= 40) return "text-amber-400";
  return "text-destructive";
}

function scoreBg(score: number) {
  if (score >= 70) return "bg-emerald-500/10 border-emerald-500/20";
  if (score >= 40) return "bg-amber-500/10 border-amber-500/20";
  return "bg-destructive/10 border-destructive/20";
}

function fmt(v: number, type: "currency" | "roas") {
  if (type === "currency")
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
  return `${v.toFixed(2)}x`;
}

export function ProjectEfficiencyScore({ overallScore, projectScores }: ProjectEfficiencyScoreProps) {
  const sorted = [...projectScores].sort((a, b) => b.score - a.score);

  return (
    <Card className={`border ${scoreBg(overallScore)}`}>
      <CardContent className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <Gauge className={`h-5 w-5 ${scoreColor(overallScore)} shrink-0`} />
          <div className="flex-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Eficiência de Funil</p>
            <p className={`text-2xl font-bold font-data ${scoreColor(overallScore)}`}>
              {overallScore}<span className="text-sm font-normal text-muted-foreground">/100 Geral</span>
            </p>
          </div>
        </div>

        {sorted.length > 0 && (
          <div className="space-y-2 mt-3">
            {sorted.map((p, i) => (
              <div key={p.code} className="flex items-center gap-3">
                <div className="w-5 text-center">
                  {i === 0 ? (
                    <Trophy className="h-3.5 w-3.5 text-amber-400 inline" />
                  ) : i === sorted.length - 1 && sorted.length > 1 ? (
                    <TrendingDown className="h-3.5 w-3.5 text-destructive inline" />
                  ) : (
                    <span className="text-[10px] text-muted-foreground">{i + 1}</span>
                  )}
                </div>
                <span className="text-xs font-semibold text-foreground w-10">{p.code}</span>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      p.score >= 70 ? "bg-emerald-500" : p.score >= 40 ? "bg-amber-500" : "bg-destructive"
                    }`}
                    style={{ width: `${p.score}%` }}
                  />
                </div>
                <span className={`text-xs font-bold font-data w-10 text-right ${scoreColor(p.score)}`}>
                  {p.score}
                </span>
                <span className="text-[10px] text-muted-foreground w-20 text-right">
                  {fmt(p.revenue, "currency")} · {fmt(p.roas, "roas")}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export { calcScore };
