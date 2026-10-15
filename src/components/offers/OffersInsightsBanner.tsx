import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Flame, AlertTriangle, Skull, Trophy, Sparkles } from "lucide-react";
import type { Offer } from "@/types/offers";
import type { OfferPerformanceStats } from "@/hooks/useOffersTraffic";
import { differenceInDays, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

interface Props {
  offers: Offer[];
  trafficMap: Map<string, OfferPerformanceStats> | undefined;
  onApplyFilter: (kind: "winners" | "no_spend" | "selling_today" | "limbo") => void;
}

export function OffersInsightsBanner({ offers, trafficMap, onApplyFilter }: Props) {
  const insights = useMemo(() => {
    if (!trafficMap) return null;
    let winners = 0;
    let noSpend = 0;
    let limbo = 0;
    let topOffer: { name: string; revenue: number } | null = null;
    let topRevenueToday = 0;

    offers.forEach((o) => {
      const t = trafficMap.get(o.id);
      if (!t) return;

      if (["ativa", "em_teste"].includes(o.status)) {
        if ((t.roi_7d ?? 0) >= 1.5) winners++;
        if ((t.spend_7d_brl ?? 0) === 0) noSpend++;
      }

      // limbo: em_teste há +30d sem nenhuma venda 7d
      if (o.status === "em_teste" && o.data_inicio) {
        const days = differenceInDays(new Date(), parseISO(o.data_inicio));
        if (days > 30 && (t.sales_7d ?? 0) === 0) limbo++;
      }

      if ((t.revenue_today_brl ?? 0) > topRevenueToday) {
        topRevenueToday = t.revenue_today_brl;
        topOffer = { name: o.apelido_interno, revenue: t.revenue_today_brl };
      }
    });

    return { winners, noSpend, limbo, topOffer };
  }, [offers, trafficMap]);

  if (!insights) return null;
  const items: { key: string; show: boolean; node: React.ReactNode; tone: string; onClick?: () => void }[] = [
    {
      key: "winners",
      show: insights.winners > 0,
      tone: "border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-500",
      onClick: () => onApplyFilter("winners"),
      node: (
        <>
          <Flame className="h-4 w-4 shrink-0" />
          <span><b className="tabular-nums">{insights.winners}</b> oferta{insights.winners > 1 ? "s" : ""} cruzando <b>ROI 1.5x</b></span>
        </>
      ),
    },
    {
      key: "no_spend",
      show: insights.noSpend > 0,
      tone: "border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 text-amber-500",
      onClick: () => onApplyFilter("no_spend"),
      node: (
        <>
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span><b className="tabular-nums">{insights.noSpend}</b> ativa{insights.noSpend > 1 ? "s" : ""} <b>sem spend 7d</b></span>
        </>
      ),
    },
    {
      key: "limbo",
      show: insights.limbo > 0,
      tone: "border-red-500/30 bg-red-500/5 hover:bg-red-500/10 text-red-500",
      node: (
        <>
          <Skull className="h-4 w-4 shrink-0" />
          <span><b className="tabular-nums">{insights.limbo}</b> em teste há <b>+30d sem venda</b></span>
        </>
      ),
    },
    {
      key: "top",
      show: insights.topOffer != null && insights.topOffer.revenue > 0,
      tone: "border-primary/30 bg-primary/5 hover:bg-primary/10 text-primary",
      onClick: () => onApplyFilter("selling_today"),
      node: insights.topOffer ? (
        <>
          <Trophy className="h-4 w-4 shrink-0" />
          <span>Top hoje: <b className="font-mono">{insights.topOffer.name}</b> · <b>{fmtBRL(insights.topOffer.revenue)}</b></span>
        </>
      ) : null,
    },
  ].filter((i) => i.show);

  if (items.length === 0) return null;

  return (
    <Card className="p-2 bg-muted/20 border-dashed">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground uppercase tracking-wider px-2 shrink-0">
          <Sparkles className="h-3 w-3" />
          Insights
        </div>
        {items.map((i) => (
          <button
            key={i.key}
            onClick={i.onClick}
            disabled={!i.onClick}
            className={cn(
              "inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs transition-colors",
              i.tone,
              !i.onClick && "cursor-default",
            )}
          >
            {i.node}
          </button>
        ))}
      </div>
    </Card>
  );
}
