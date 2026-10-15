import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Target } from "lucide-react";

interface ProgressItem {
  label: string;
  current: number;
  goal: number;
  format: "currency" | "number" | "percent";
}

interface Props {
  items: ProgressItem[];
}

function fmt(v: number, type: "currency" | "number" | "percent") {
  if (type === "currency")
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
  if (type === "number") return new Intl.NumberFormat("pt-BR").format(Math.round(v));
  if (type === "percent") return `${v.toFixed(1)}%`;
  return String(v);
}

export function PlanningProgressBars({ items }: Props) {
  return (
    <Card className="bg-card border border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          Progresso das Metas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {items.map((item) => {
          const pct = item.goal > 0 ? (item.current / item.goal) * 100 : 0;
          const clampedPct = Math.min(pct, 100);
          const isComplete = pct >= 100;
          const isGood = pct >= 70;

          // Color based on progress: green for good, amber for medium, muted for low
          const barColor = isComplete
            ? "bg-emerald-500"
            : isGood
            ? "bg-emerald-500/80"
            : pct >= 40
            ? "bg-amber-500"
            : "bg-muted-foreground/30";

          const textColor = isComplete
            ? "text-success"
            : isGood
            ? "text-emerald-400"
            : pct >= 40
            ? "text-amber-400"
            : "text-muted-foreground";

          return (
            <div key={item.label} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{item.label}</span>
                <span className={`text-xs font-semibold font-data ${textColor}`}>
                  {fmt(item.current, item.format)} / {fmt(item.goal, item.format)}
                </span>
              </div>
              {/* Custom progress bar with glow effect */}
              <div className="relative h-3 w-full overflow-hidden rounded-full bg-secondary/50">
                <div
                  className={`h-full rounded-full transition-all duration-700 ease-out ${barColor}`}
                  style={{ width: `${clampedPct}%` }}
                />
                {isComplete && (
                  <div
                    className="absolute inset-0 h-full rounded-full bg-emerald-500/20 animate-pulse"
                    style={{ width: `100%` }}
                  />
                )}
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className={`text-xs font-bold font-data ${textColor}`}>{pct.toFixed(1)}%</span>
                  {isComplete && <span className="text-[10px] text-success font-medium">✓ Meta atingida</span>}
                </div>
                {item.goal > 0 && item.current < item.goal && (
                  <span className="text-[10px] text-muted-foreground">
                    Faltam: {fmt(item.goal - item.current, item.format)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
