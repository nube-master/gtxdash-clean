import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import type { Offer } from "@/types/offers";
import type { OfferPerformanceStats } from "@/hooks/useOffersTraffic";
import { calcOfferHealth } from "@/lib/offerHealthScore";
import { differenceInDays, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

const fmtBRL = (v: number | null | undefined) =>
  v == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(Number(v));
const fmtUSD = (v: number | null | undefined) =>
  v == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(v));

interface Props {
  offers: Offer[];
  trafficMap: Map<string, OfferPerformanceStats> | undefined;
  open: boolean;
  onClose: () => void;
}

export function OfferCompareDrawer({ offers, trafficMap, open, onClose }: Props) {
  const rows: { label: string; get: (o: Offer, t?: OfferPerformanceStats) => React.ReactNode; numericGet?: (o: Offer, t?: OfferPerformanceStats) => number | null }[] = [
    { label: "Status", get: (o) => <Badge variant="outline" className="capitalize">{o.status.replace("_", " ")}</Badge> },
    { label: "Nicho", get: (o) => <span className="capitalize">{o.nicho.replace(/_/g, " ")}</span> },
    { label: "Geo", get: (o) => o.geo },
    { label: "Vendor", get: (o) => <span className="capitalize">{o.vendor}</span> },
    { label: "CPA / Comissão", get: (o) => fmtUSD((o as any).comissao_usd ?? o.cpa_target_brl) },
    { label: "Margem", get: (o) => o.margem_pct != null ? `${o.margem_pct}%` : "—" },
    { label: "Lifetime", get: (o) => o.data_inicio ? `${differenceInDays(new Date(), parseISO(o.data_inicio))}d` : "—" },
    { label: "Spend 7d",  get: (_o, t) => fmtBRL(t?.spend_7d_brl),    numericGet: (_o, t) => t?.spend_7d_brl ?? null },
    { label: "Spend 30d", get: (_o, t) => fmtBRL(t?.spend_30d_brl),   numericGet: (_o, t) => t?.spend_30d_brl ?? null },
    { label: "Receita 7d",  get: (_o, t) => fmtBRL(t?.revenue_7d_brl),  numericGet: (_o, t) => t?.revenue_7d_brl ?? null },
    { label: "Receita 30d", get: (_o, t) => fmtBRL(t?.revenue_30d_brl), numericGet: (_o, t) => t?.revenue_30d_brl ?? null },
    { label: "Vendas hoje", get: (_o, t) => t?.sales_today ?? 0,       numericGet: (_o, t) => t?.sales_today ?? null },
    { label: "Vendas 7d",   get: (_o, t) => t?.sales_7d ?? 0,          numericGet: (_o, t) => t?.sales_7d ?? null },
    { label: "ROI 7d",  get: (_o, t) => t?.roi_7d != null ? `${t.roi_7d.toFixed(2)}x` : "—", numericGet: (_o, t) => t?.roi_7d ?? null },
    { label: "ROI 30d", get: (_o, t) => t?.roi_30d != null ? `${t.roi_30d.toFixed(2)}x` : "—", numericGet: (_o, t) => t?.roi_30d ?? null },
    { label: "Contas",  get: (_o, t) => t?.accounts_count ?? 0,        numericGet: (_o, t) => t?.accounts_count ?? null },
    { label: "Health",  get: (o, t) => {
        const h = calcOfferHealth(o, t);
        return <span className={cn("font-mono", h.tone === "good" ? "text-emerald-500" : h.tone === "warn" ? "text-amber-500" : h.tone === "bad" ? "text-red-500" : "text-muted-foreground")}>{h.score}</span>;
      },
      numericGet: (o, t) => calcOfferHealth(o, t).score,
    },
  ];

  // helper p/ destacar melhor por linha
  const bestIdxFor = (numericGet?: (o: Offer, t?: OfferPerformanceStats) => number | null) => {
    if (!numericGet) return -1;
    const vals = offers.map((o) => numericGet(o, trafficMap?.get(o.id)));
    let bestIdx = -1;
    let bestVal = -Infinity;
    vals.forEach((v, i) => {
      if (v != null && v > bestVal) { bestVal = v; bestIdx = i; }
    });
    return bestIdx;
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-4xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Comparar offers ({offers.length})</SheetTitle>
        </SheetHeader>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-2 text-xs uppercase text-muted-foreground font-medium w-32">Métrica</th>
                {offers.map((o) => (
                  <th key={o.id} className="text-left py-2 px-2 font-mono text-xs">{o.apelido_interno}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const bestIdx = bestIdxFor(r.numericGet);
                return (
                  <tr key={r.label} className="border-b border-border/40">
                    <td className="py-2 px-2 text-xs text-muted-foreground">{r.label}</td>
                    {offers.map((o, idx) => (
                      <td key={o.id} className={cn(
                        "py-2 px-2 text-sm tabular-nums",
                        idx === bestIdx && "text-emerald-500 font-semibold",
                      )}>
                        {r.get(o, trafficMap?.get(o.id))}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SheetContent>
    </Sheet>
  );
}
