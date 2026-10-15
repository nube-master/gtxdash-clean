import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDateRange } from "@/contexts/DateRangeContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, ArrowUpRight } from "lucide-react";
import { useMobilePerformance, activePolling } from "@/hooks/useMobilePerformance";
import { CB_TIERS, type CbTier } from "@/lib/clickbankTiers";

interface TierData {
  label: string;
  count: number;
  revenueBrl: number;
  color: string;
  bgColor: string;
}

function fmt(v: number) {
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export function ClickbankProductBreakdown() {
  const { dateRange } = useDateRange();
  const [start, end] = dateRange;
  const perf = useMobilePerformance();

  const { data: cbRows } = useQuery({
    queryKey: ["cb-product-breakdown", start, end],
    queryFn: async () => {
      const PAGE = 1000;
      let all: any[] = [];
      let from = 0;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase
          .from("clickbank_audit" as any)
          .select("amount_usd, amount_brl, product_name, quantity, item_name")
          .eq("transaction_type", "SALE")
          .gte("date", start)
          .lte("date", end)
          .range(from, from + PAGE - 1);
        if (error) break;
        all = all.concat(data || []);
        hasMore = (data?.length || 0) === PAGE;
        from += PAGE;
      }
      return all;
    },
    refetchInterval: activePolling(60_000, perf.isTabActive),
    staleTime: 30_000,
  });

  const tiers = useMemo((): TierData[] => {
    const rows = (cbRows || []).filter((r: any) => {
      const qty = r.quantity as number | null;
      // Only commission-earning tiers: 2, 3, 6 bottles
      // Upgrades and "Outros" earn R$0 commission for affiliates → exclude
      return qty === 2 || qty === 3 || qty === 6;
    });

    // Only show commission-earning tiers (exclude "Outros")
    return CB_TIERS
      .filter((tier: CbTier) => tier.quantity === 2 || tier.quantity === 3 || tier.quantity === 6)
      .map((tier: CbTier) => {
        const matching = rows.filter((r: any) => (r.quantity as number | null) === tier.quantity);

        return {
          label: tier.label,
          count: matching.length,
          revenueBrl: matching.reduce((s: number, r: any) => s + Number(r.amount_brl || 0), 0),
          color: tier.color,
          bgColor: tier.bgColor,
        };
      });
  }, [cbRows]);

  const totalCount = tiers.reduce((s, t) => s + t.count, 0);
  const totalRevenue = tiers.reduce((s, t) => s + t.revenueBrl, 0);

  if (!totalCount) return null;

  return (
    <Card className="border-border/50 bg-card/80">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Package className="h-4 w-4 text-primary" />
          Breakdown por Produto (ClickBank)
          <span className="ml-auto text-[10px] font-normal text-muted-foreground">
            {totalCount} vendas • {fmt(totalRevenue)}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {tiers.map((tier) => {
            const pct = totalCount > 0 ? ((tier.count / totalCount) * 100).toFixed(1) : "0";
            return (
              <div
                key={tier.label}
                className="rounded-lg border border-border/30 bg-muted/20 p-3 space-y-1"
              >
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                  {tier.label}
                </p>
                <p className={`text-xl font-bold tabular-nums ${tier.color}`}>
                  {tier.count}
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">{fmt(tier.revenueBrl)}</p>
                <div className="flex items-center gap-1">
                  <div className="flex-1 h-1.5 rounded-full bg-muted/40 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${tier.bgColor}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-muted-foreground tabular-nums w-[32px] text-right">
                    {pct}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Commission-only note */}
        <div className="mt-3 flex items-center gap-2 border-t border-border/30 pt-2">
          <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-[11px] text-muted-foreground">
            Apenas vendas comissionadas (afiliado) — upgrades e upsells excluídos
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
