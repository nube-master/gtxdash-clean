import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, TrendingUp, Package, Percent } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCODProductRanking } from "@/hooks/useCODProductRanking";
import { useNicheRules } from "@/hooks/useNicheRules";
import { NicheBadge } from "@/components/niche/NicheBadge";
import { useCurrency } from "@/contexts/CurrencyContext";

type SortKey = "commission" | "deliveryRate" | "delivered" | "generated" | "avgCommission";

const SORTS: { key: SortKey; label: string; icon: any }[] = [
  { key: "commission",    label: "Comissão",     icon: TrendingUp },
  { key: "deliveryRate",  label: "Taxa Entrega", icon: Percent },
  { key: "delivered",     label: "Entregues",    icon: Trophy },
  { key: "generated",     label: "Gerados",      icon: Package },
  { key: "avgCommission", label: "€ Médio",      icon: TrendingUp },
];

function fmtEUR(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v || 0);
}
function fmtPct(v: number) {
  return `${((v || 0) * 100).toFixed(1)}%`;
}

function rateColor(rate: number) {
  if (rate >= 0.3) return "text-emerald-500";
  if (rate >= 0.15) return "text-amber-500";
  return "text-destructive";
}

interface Props {
  from: string;
  to: string;
}

export function CODProductRankingWidget({ from, to }: Props) {
  const { data, isLoading } = useCODProductRanking({ from, to });
  const [sortKey, setSortKey] = useState<SortKey>("commission");
  const { detect } = useNicheRules();
  const { currency, format: fmtCurrency } = useCurrency();

  const sorted = useMemo(() => {
    const rows = [...(data?.rows ?? [])];
    rows.sort((a, b) => {
      switch (sortKey) {
        case "commission":    return b.commissionBrl - a.commissionBrl;
        case "deliveryRate":  return b.deliveryRate - a.deliveryRate;
        case "delivered":     return b.delivered - a.delivered;
        case "generated":     return b.generated - a.generated;
        case "avgCommission": return b.avgCommissionEur - a.avgCommissionEur;
      }
    });
    return rows;
  }, [data, sortKey]);

  const max = useMemo(() => {
    const first = sorted[0];
    if (!first) return 1;
    switch (sortKey) {
      case "commission":    return first.commissionBrl || 1;
      case "deliveryRate":  return 1;
      case "delivered":     return first.delivered || 1;
      case "generated":     return first.generated || 1;
      case "avgCommission": return first.avgCommissionEur || 1;
    }
  }, [sorted, sortKey]);

  const getVal = (r: typeof sorted[number]) => {
    switch (sortKey) {
      case "commission":    return r.commissionBrl;
      case "deliveryRate":  return r.deliveryRate;
      case "delivered":     return r.delivered;
      case "generated":     return r.generated;
      case "avgCommission": return r.avgCommissionEur;
    }
  };

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-400" />
          <div>
            <h3 className="text-sm font-semibold">Ranking por Produto</h3>
            <p className="text-[11px] text-muted-foreground">
              Onde botar mais energia — período selecionado
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SORTS.map((s) => (
            <Button
              key={s.key}
              size="sm"
              variant={sortKey === s.key ? "default" : "outline"}
              className="h-7 text-[11px] px-2.5"
              onClick={() => setSortKey(s.key)}
            >
              <s.icon className="h-3 w-3 mr-1" />
              {s.label}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Sem dados no período.</p>
      ) : (
        <div className="space-y-2">
          {sorted.map((r, i) => {
            const val = getVal(r);
            const pct = Math.min(100, (val / max) * 100);
            return (
              <div key={r.product} className="flex items-center gap-3 p-2.5 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors">
                <div className="w-6 text-center">
                  {i === 0 ? (
                    <Trophy className="h-4 w-4 text-amber-400 inline" />
                  ) : (
                    <span className="text-xs text-muted-foreground font-mono">{i + 1}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="text-sm font-semibold truncate">{r.product}</span>
                      <NicheBadge niche={detect(r.product)} className="shrink-0" />
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className={cn("text-[10px] font-mono", rateColor(r.deliveryRate))}>
                        {fmtPct(r.deliveryRate)}
                      </Badge>
                      <span className="text-sm font-bold text-emerald-500 font-mono">
                        {fmtCurrency(r.commissionBrl, { decimals: 0 })}
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-1">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        sortKey === "deliveryRate"
                          ? r.deliveryRate >= 0.3 ? "bg-emerald-500" : r.deliveryRate >= 0.15 ? "bg-amber-500" : "bg-destructive"
                          : "bg-emerald-500"
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground font-mono">
                    <span>{r.generated} gerados</span>
                    <span>·</span>
                    <span className="text-foreground/70">{r.delivered} entregues</span>
                    {r.pending > 0 && <><span>·</span><span className="text-amber-500/80">{r.pending} pendentes</span></>}
                    <span>·</span>
                    <span data-monkey-patch-skip="true">€ médio: {fmtEUR(r.avgCommissionEur)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
