import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, TrendingDown } from "lucide-react";

interface FunnelStage {
  label: string;
  volume: number;
  ratePct: number;
}

interface BottleneckDayBlockProps {
  stages: FunnelStage[];
  avgStages?: FunnelStage[]; // historical average stages for comparison
}

function fmt(v: number, type: "percent" | "number") {
  if (type === "percent") return `${v.toFixed(1)}%`;
  return new Intl.NumberFormat("pt-BR").format(Math.round(v));
}

export function BottleneckDayBlock({ stages, avgStages }: BottleneckDayBlockProps) {
  if (stages.length < 2) return null;

  const alerts: { from: string; to: string; currentRate: number; avgRate: number; diff: number; type: "drop" | "anomaly" }[] = [];

  for (let i = 1; i < stages.length; i++) {
    const stage = stages[i];
    const avgStage = avgStages && avgStages.length > i ? avgStages[i] : null;

    if (avgStage && avgStage.ratePct > 0) {
      const diff = ((stage.ratePct - avgStage.ratePct) / avgStage.ratePct) * 100;
      if (diff < -15) {
        alerts.push({
          from: stages[i - 1].label,
          to: stage.label,
          currentRate: stage.ratePct,
          avgRate: avgStage.ratePct,
          diff,
          type: "drop",
        });
      }
      // Anomaly: unusually high conversion (possible tracking error)
      if (diff > 50 && stage.ratePct > avgStage.ratePct * 1.5) {
        alerts.push({
          from: stages[i - 1].label,
          to: stage.label,
          currentRate: stage.ratePct,
          avgRate: avgStage.ratePct,
          diff,
          type: "anomaly",
        });
      }
    }
  }

  // Also check for absolute low rates
  for (let i = 1; i < stages.length; i++) {
    const stage = stages[i];
    const prev = stages[i - 1];
    if (prev.volume > 0 && stage.volume === 0) {
      const existing = alerts.find((a) => a.to === stage.label);
      if (!existing) {
        alerts.push({
          from: prev.label,
          to: stage.label,
          currentRate: 0,
          avgRate: 0,
          diff: -100,
          type: "drop",
        });
      }
    }
  }

  if (alerts.length === 0) return null;

  return (
    <Card className="border border-destructive/20 bg-destructive/5">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-6 w-6 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
          </div>
          <h3 className="text-xs font-semibold text-destructive uppercase tracking-wider">🔴 Gargalo do Dia</h3>
        </div>
        <div className="space-y-2">
          {alerts.slice(0, 4).map((alert, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <TrendingDown className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
              <div>
                {alert.type === "drop" ? (
                  <p className="text-foreground">
                    <span className="font-semibold">{alert.from} → {alert.to}</span>{" "}
                    caiu <span className="text-destructive font-bold font-data">{fmt(Math.abs(alert.diff), "percent")}</span> vs média
                    <span className="text-muted-foreground ml-1">
                      ({fmt(alert.currentRate, "percent")} atual vs {fmt(alert.avgRate, "percent")} média)
                    </span>
                  </p>
                ) : (
                  <p className="text-foreground">
                    <span className="font-semibold">{alert.from} → {alert.to}</span>{" "}
                    está <span className="text-amber-400 font-bold">anormalmente alto</span>{" "}
                    ({fmt(alert.currentRate, "percent")} vs {fmt(alert.avgRate, "percent")} média) — possível erro de tracking
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
