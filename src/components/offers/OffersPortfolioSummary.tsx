import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import {
  Package, Flame, FlaskConical, Pause, Skull, TrendingUp, DollarSign,
  Target, Sparkles,
} from "lucide-react";
import type { Offer, OfferStatus } from "@/types/offers";
import type { OfferPerformanceStats } from "@/hooks/useOffersTraffic";
import { cn } from "@/lib/utils";

const fmtBRL0 = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

interface Props {
  offers: Offer[];
  trafficMap: Map<string, OfferPerformanceStats> | undefined;
  activeStatusFilter: Set<OfferStatus>;
  onStatusClick: (s: OfferStatus | "all") => void;
}

export function OffersPortfolioSummary({ offers, trafficMap, activeStatusFilter, onStatusClick }: Props) {
  const m = useMemo(() => {
    const byStatus: Record<OfferStatus, number> = {
      ativa: 0, em_teste: 0, pausada: 0, morta: 0, arquivada: 0,
    };
    let spend7d = 0, revenue7d = 0, sales7d = 0;
    let activeSpend7d = 0, activeRevenue7d = 0;
    let bestId: string | null = null, bestRoi = -Infinity;

    offers.forEach((o) => {
      byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;
      const t = trafficMap?.get(o.id);
      if (!t) return;
      const s = t.spend_7d_brl ?? 0;
      const r = t.revenue_7d_brl ?? 0;
      spend7d += s;
      revenue7d += r;
      sales7d += t.sales_7d ?? 0;
      if (o.status === "ativa" || o.status === "em_teste") {
        activeSpend7d += s;
        activeRevenue7d += r;
      }
      // melhor ROI 7d com spend mínimo relevante
      if (s > 1000 && t.roi_7d != null && t.roi_7d > bestRoi) {
        bestRoi = t.roi_7d;
        bestId = o.id;
      }
    });

    const portfolioRoi = spend7d > 0 ? revenue7d / spend7d : null;
    const activeRoi = activeSpend7d > 0 ? activeRevenue7d / activeSpend7d : null;
    const champion = bestId ? offers.find((x) => x.id === bestId) : null;

    return {
      total: offers.length, byStatus, spend7d, revenue7d, sales7d,
      portfolioRoi, activeRoi, champion, championRoi: bestRoi,
    };
  }, [offers, trafficMap]);

  const statusCards: Array<{
    key: OfferStatus | "all";
    label: string; count: number; Icon: any; tone: string; bar: string;
  }> = [
    { key: "all",      label: "Total",     count: m.total,            Icon: Package,       tone: "text-foreground",      bar: "bg-foreground/30" },
    { key: "ativa",    label: "Escalando", count: m.byStatus.ativa,    Icon: Flame,         tone: "text-emerald-500",     bar: "bg-emerald-500" },
    { key: "em_teste", label: "Em teste",  count: m.byStatus.em_teste, Icon: FlaskConical,  tone: "text-amber-500",       bar: "bg-amber-500" },
    { key: "pausada",  label: "Pausadas",  count: m.byStatus.pausada,  Icon: Pause,         tone: "text-red-500",         bar: "bg-red-500" },
    { key: "morta",    label: "Mortas",    count: m.byStatus.morta,    Icon: Skull,         tone: "text-muted-foreground",bar: "bg-muted-foreground/40" },
  ];

  const RoiTone = (roi: number | null) =>
    roi == null ? "text-muted-foreground"
    : roi >= 1.2 ? "text-emerald-500"
    : roi >= 1.0 ? "text-amber-500"
    : "text-red-500";

  return (
    <Card className="overflow-hidden border-border bg-card">
      {/* Header strip */}
      <div className="px-4 py-2.5 border-b border-border/60 bg-muted/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">
            Portfólio · últimos 7 dias
          </span>
        </div>
        {m.champion && Number.isFinite(m.championRoi) && (
          <div className="text-[11px] text-muted-foreground hidden md:flex items-center gap-1.5">
            <TrendingUp className="h-3 w-3 text-emerald-500" />
            Campeã 7d: <span className="font-mono font-bold text-foreground">{m.champion.apelido_interno}</span>
            <span className="text-emerald-500 font-mono font-bold">{m.championRoi.toFixed(2)}x</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-8 divide-x divide-y lg:divide-y-0 divide-border/60">
        {/* Status counters (5) */}
        {statusCards.map(({ key, label, count, Icon, tone, bar }) => {
          const isActive = key === "all"
            ? activeStatusFilter.size === 0
            : activeStatusFilter.has(key as OfferStatus);
          return (
            <button
              key={key}
              onClick={() => onStatusClick(key)}
              className={cn(
                "relative px-3 py-3 text-left transition-colors hover:bg-accent/40",
                isActive && "bg-accent/60",
              )}
            >
              <div className={cn("absolute left-0 top-0 bottom-0 w-[2px] transition-opacity", bar, isActive ? "opacity-100" : "opacity-30")} />
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                <Icon className={cn("h-3 w-3", tone)} />
                {label}
              </div>
              <div className="text-2xl font-mono font-bold tabular-nums mt-0.5 text-foreground">{count}</div>
            </button>
          );
        })}

        {/* Spend 7d */}
        <div className="px-3 py-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
            <DollarSign className="h-3 w-3" /> Spend 7d
          </div>
          <div className="text-base font-mono font-bold tabular-nums mt-0.5 text-foreground">
            {m.spend7d > 0 ? fmtBRL0(m.spend7d) : "—"}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
            {m.sales7d} {m.sales7d === 1 ? "venda" : "vendas"}
          </div>
        </div>

        {/* Receita 7d */}
        <div className="px-3 py-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
            <TrendingUp className="h-3 w-3" /> Receita 7d
          </div>
          <div className="text-base font-mono font-bold tabular-nums mt-0.5 text-foreground">
            {m.revenue7d > 0 ? fmtBRL0(m.revenue7d) : "—"}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5 truncate">front-end ($200-260)</div>
        </div>

        {/* ROI portfólio */}
        <div className="px-3 py-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
            <Target className="h-3 w-3" /> ROI 7d
          </div>
          <div className={cn("text-base font-mono font-bold tabular-nums mt-0.5", RoiTone(m.portfolioRoi))}>
            {m.portfolioRoi != null ? `${m.portfolioRoi.toFixed(2)}x` : "—"}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
            ativas: <span className={cn("font-mono font-bold", RoiTone(m.activeRoi))}>
              {m.activeRoi != null ? `${m.activeRoi.toFixed(2)}x` : "—"}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}
