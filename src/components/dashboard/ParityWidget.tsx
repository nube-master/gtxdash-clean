import { useParityStatus } from "@/hooks/useParityStatus";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ShieldCheck, AlertTriangle, CheckCircle, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v);
}

export function ParityWidget() {
  const { data, isLoading } = useParityStatus();

  if (isLoading) {
    return (
      <Card className="border-border/50 bg-card/80">
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data || (!data.clickbank.count && !data.redtrack.count)) return null;

  const { clickbank: cb, redtrack: rt, gap, coverage_pct } = data;
  const isHealthy = gap.pct < 3;
  const isWarning = gap.pct >= 3 && gap.pct < 10;

  return (
    <Card className="border-border/50 bg-card/80">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Paridade de Vendas (Tempo Real)
          {isHealthy ? (
            <Badge variant="outline" className="ml-auto text-[10px] border-emerald-500/30 text-emerald-400">
              <CheckCircle className="h-3 w-3 mr-1" /> {coverage_pct.toFixed(0)}% cobertura
            </Badge>
          ) : (
            <Badge variant="outline" className={`ml-auto text-[10px] ${isWarning ? "border-yellow-500/30 text-yellow-400" : "border-destructive/30 text-destructive"}`}>
              <AlertTriangle className="h-3 w-3 mr-1" /> Gap {gap.count} vendas
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Coverage progress bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>Cobertura RedTrack</span>
            <span className={`font-semibold ${isHealthy ? "text-emerald-400" : isWarning ? "text-yellow-400" : "text-destructive"}`}>
              {coverage_pct.toFixed(1)}%
            </span>
          </div>
          <Progress
            value={Math.min(coverage_pct, 100)}
            className="h-2"
          />
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Clickbank</p>
            <p className="text-base font-bold text-foreground">{cb.count}</p>
            <p className="text-[11px] text-muted-foreground">{fmt(cb.revenue_brl)}</p>
          </div>

          <div className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">RedTrack</p>
            <p className="text-base font-bold text-foreground">{rt.count}</p>
            <p className="text-[11px] text-muted-foreground">{fmt(rt.revenue_brl)}</p>
          </div>

          <div className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Gap</p>
            <p className={`text-base font-bold ${gap.count > 0 ? "text-destructive" : "text-emerald-400"}`}>
              {gap.count > 0 ? `+${gap.count}` : gap.count}
            </p>
            <p className="text-[11px] text-muted-foreground">{gap.pct.toFixed(1)}%</p>
          </div>
        </div>

        {gap.count > 0 && (
          <div className="flex items-start gap-2 text-[11px] text-muted-foreground border-t border-border/30 pt-2">
            <TrendingUp className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
            <span>
              O reconciliador automático monitora e corrige gaps a cada 30 min.
              {gap.count >= 2 && " Um alerta foi enviado via notificação."}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
