import { useRealtimeSpend } from "@/hooks/useRealtimeSpend";
import { useDashboardTotals } from "@/hooks/useDashboardTotals";
import { useDateRange } from "@/contexts/DateRangeContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Zap, CheckCircle, AlertTriangle, Clock } from "lucide-react";

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(v);
}

function timeAgo(iso: string | null) {
  if (!iso) return "—";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.round(diff)}s atrás`;
  if (diff < 3600) return `${Math.round(diff / 60)}min atrás`;
  return `${Math.round(diff / 3600)}h atrás`;
}

/**
 * RealtimeSpendWidget — SAFE read-only comparison widget.
 * Shows realtime spend alongside official spend.
 * Does NOT replace any existing data source.
 */
export function RealtimeSpendWidget() {
  const { dateRange } = useDateRange();
  const [start, end] = dateRange;
  const todaySP = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());

  // Only show for today
  const isToday = start === todaySP && end === todaySP;

  const { data: realtime, isLoading: rtLoading } = useRealtimeSpend(isToday);
  const { data: official } = useDashboardTotals();

  if (!isToday) return null;

  const rtSpend = realtime?.totalSpendRealtime ?? 0;
  const offSpend = official?.totalSpend ?? 0;

  // Calculate divergence
  const divergence =
    offSpend > 0 ? Math.abs(rtSpend - offSpend) / offSpend * 100 : 0;
  const isConsistent = divergence < 5;

  return (
    <Card className="border border-border/50 bg-card">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-400" />
            <span className="text-xs font-semibold text-foreground">
              Investimento Realtime
            </span>
            <Badge
              variant="outline"
              className="text-[9px] px-1.5 py-0 border-amber-400/30 text-amber-400"
            >
              BETA
            </Badge>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            {rtLoading ? "..." : timeAgo(realtime?.lastFetched ?? null)}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {/* Realtime */}
          <div>
            <p className="text-[10px] text-muted-foreground mb-0.5">
              ⚡ Realtime
            </p>
            <p className="text-sm font-bold font-data text-foreground">
              {rtLoading ? "..." : fmt(rtSpend)}
            </p>
          </div>

          {/* Official */}
          <div>
            <p className="text-[10px] text-muted-foreground mb-0.5">
              🔒 Oficial
            </p>
            <p className="text-sm font-bold font-data text-foreground">
              {fmt(offSpend)}
            </p>
          </div>

          {/* Divergence */}
          <div>
            <p className="text-[10px] text-muted-foreground mb-0.5">
              Divergência
            </p>
            <div className="flex items-center gap-1">
              {isConsistent ? (
                <CheckCircle className="h-3.5 w-3.5 text-wr-positive" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
              )}
              <p
                className={`text-sm font-bold font-data ${
                  isConsistent ? "text-wr-positive" : "text-amber-400"
                }`}
              >
                {divergence.toFixed(1)}%
              </p>
            </div>
          </div>
        </div>

        {!isConsistent && (
          <p className="text-[9px] text-amber-400/80 mt-2">
            ⚠ Divergência &gt;5% — pipeline oficial é fonte de verdade
          </p>
        )}
      </CardContent>
    </Card>
  );
}
