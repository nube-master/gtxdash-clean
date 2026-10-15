import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface FunnelStageRate {
  label: string;
  rateLabel: string;
  ratePct: number;
  volume: number;
}

interface FunnelTrendProps {
  currentStages: FunnelStageRate[];
  previousStages: FunnelStageRate[];
}

function fmt(v: number) {
  return `${v.toFixed(1)}%`;
}

function fmtVol(v: number) {
  return new Intl.NumberFormat("pt-BR").format(Math.round(v));
}

export function FunnelTrend({ currentStages, previousStages }: FunnelTrendProps) {
  if (!previousStages.length || !currentStages.length) return null;

  // Skip "Impressões" (index 0) since it's always 100%
  const stages = currentStages.slice(1);
  const prevStages = previousStages.slice(1);

  return (
    <Card className="bg-card border border-border">
      <CardContent className="p-5">
        <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-4">
          Tendência do Funil — Atual vs Anterior
        </h3>

        <div className="overflow-x-auto">
          <div className="grid gap-2 min-w-[700px]" style={{ gridTemplateColumns: `140px repeat(${stages.length}, 1fr)` }}>
            {/* Header row */}
            <div className="text-[10px] font-medium text-muted-foreground" />
            {stages.map((s) => (
              <div key={s.label} className="text-center">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {s.label}
                </span>
                <p className="text-[9px] text-muted-foreground/60 mt-0.5">{s.rateLabel}</p>
              </div>
            ))}

            {/* Current period row */}
            <div className="flex items-center">
              <span className="text-[10px] font-medium text-foreground">Período Atual</span>
            </div>
            {stages.map((s) => (
              <div key={s.label} className="text-center py-2 rounded-md bg-primary/5 border border-primary/10">
                <p className="text-sm font-bold font-data text-foreground">{fmt(s.ratePct)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{fmtVol(s.volume)}</p>
              </div>
            ))}

            {/* Previous period row */}
            <div className="flex items-center">
              <span className="text-[10px] font-medium text-muted-foreground">Período Anterior</span>
            </div>
            {prevStages.map((s) => (
              <div key={s.label} className="text-center py-2 rounded-md bg-secondary/30">
                <p className="text-sm font-data text-muted-foreground">{fmt(s.ratePct)}</p>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">{fmtVol(s.volume)}</p>
              </div>
            ))}

            {/* Variation row */}
            <div className="flex items-center">
              <span className="text-[10px] font-medium text-muted-foreground">Variação</span>
            </div>
            {stages.map((s, i) => {
              const prev = prevStages[i];
              if (!prev || prev.ratePct === 0) {
                return (
                  <div key={s.label} className="flex items-center justify-center py-2">
                    <span className="text-[10px] text-muted-foreground">—</span>
                  </div>
                );
              }
              const diff = s.ratePct - prev.ratePct;
              const pctChange = ((s.ratePct - prev.ratePct) / prev.ratePct) * 100;
              const isPositive = diff > 0;
              const isNeutral = Math.abs(diff) < 0.5;

              return (
                <div key={s.label} className="flex flex-col items-center justify-center py-2">
                  <div className={`flex items-center gap-1 ${isNeutral ? "text-muted-foreground" : isPositive ? "text-wr-positive" : "text-destructive"}`}>
                    {isNeutral ? (
                      <Minus className="h-3 w-3" />
                    ) : isPositive ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    <span className="text-xs font-bold font-data">
                      {isPositive ? "+" : ""}{diff.toFixed(1)}pp
                    </span>
                  </div>
                  <span className={`text-[9px] font-data ${isNeutral ? "text-muted-foreground" : isPositive ? "text-wr-positive/70" : "text-destructive/70"}`}>
                    ({isPositive ? "+" : ""}{pctChange.toFixed(0)}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
