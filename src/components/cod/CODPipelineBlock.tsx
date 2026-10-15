import { useEffect, useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Hourglass, AlertTriangle, TrendingUp, Package } from "lucide-react";
import { useCODPipeline } from "@/hooks/useCODPipeline";
import { useCurrency } from "@/contexts/CurrencyContext";

export function CODPipelineBlock({ historicalRate }: { historicalRate?: number }) {
  const { data, isLoading } = useCODPipeline();
  const { currency, format: fmtCurrency } = useCurrency();

  if (isLoading || !data) return <Skeleton className="h-32 w-full" />;

  return (
    <Card className="p-2 md:p-4 border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-transparent">
      <div className="flex items-center justify-between mb-2 md:mb-3 flex-wrap gap-1.5 md:gap-2">
        <div className="flex items-center gap-1.5 md:gap-2 min-w-0 flex-wrap">
          <Hourglass className="h-3.5 w-3.5 md:h-4 md:w-4 text-amber-500 shrink-0" />
          <h2 className="text-xs md:text-sm font-semibold truncate">Pipeline em Aberto</h2>
          <Badge variant="outline" className="text-[9px] md:text-[10px] font-mono px-1.5 py-0">
            10d • €→R$ {data.fxEurBrl.toFixed(2)}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 md:gap-3">
        <Mini
          label="Pendentes no prazo"
          value={String(data.pendingInWindow)}
          sub="≤ 10 dias desde o pedido"
          icon={<Hourglass className="h-3.5 w-3.5 text-amber-500" />}
        />
        <Mini
          label="Vencidos (>10d)"
          value={String(data.expiredCount)}
          sub="tratados como perdidos"
          icon={<AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
          highlight="negative"
        />
        <Mini
          label="Comissão Projetada"
          value={fmtCurrency(data.projectedCommissionBrl, { decimals: 0 })}
          sub={`Simulando ${((historicalRate || 52.38)).toFixed(1)}%`}
          icon={<TrendingUp className="h-3.5 w-3.5 text-emerald-500" />}
          highlight="positive"
        />
        <Mini
          label="Total (Gerados - Expirados)"
          value={String(data.pendingInWindow)}
          sub="Base para simulação"
          icon={<Package className="h-3.5 w-3.5 text-primary" />}
        />
      </div>
    </Card>
  );
}

function Mini({
  label, value, sub, icon, highlight,
}: {
  label: string; value: string; sub?: string; icon?: React.ReactNode; highlight?: "positive" | "negative";
}) {
  const cls = highlight === "positive" ? "text-emerald-500" : highlight === "negative" ? "text-destructive" : "";
  return (
    <div className="rounded-md border border-border/60 bg-background/60 p-1.5 md:p-3">
      <div className="flex items-center gap-1 md:gap-1.5 text-[9px] md:text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
        {icon}<span className="truncate">{label}</span>
      </div>
      <div className={`text-[15px] md:text-xl font-semibold mt-0.5 md:mt-1 tabular-nums truncate ${cls}`}>{value}</div>
      {sub && <div className="text-[9px] md:text-[10px] text-muted-foreground mt-0.5 truncate">{sub}</div>}
    </div>
  );
}
