import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDateRange } from "@/contexts/DateRangeContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle, ShieldCheck } from "lucide-react";

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(v);
}

export function ClickbankAuditPanel() {
  const { dateRange } = useDateRange();

  const start = dateRange[0];
  const end = dateRange[1];

  // Clickbank IPN data from audit table
  const { data: cbData } = useQuery({
    queryKey: ["clickbank-audit", start, end],
    queryFn: async () => {
      const PAGE = 1000;
      let all: any[] = [];
      let from = 0;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase
          .from("clickbank_audit" as any)
          .select("receipt, amount_usd, amount_brl, product_name, date, transaction_type")
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
    refetchInterval: 60_000,
  });

  // RedTrack purchases
  const startUtc = `${start}T03:00:00Z`;
  const nextDay = new Date(`${end}T12:00:00Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const endUtc = `${nextDay.toISOString().slice(0, 10)}T03:00:00Z`;

  const { data: rtData } = useQuery({
    queryKey: ["rt-audit-purchases", start, end],
    queryFn: async () => {
      const PAGE = 1000;
      let all: any[] = [];
      let from = 0;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase
          .from("redtrack_events")
          .select("amount, currency, occurred_at")
          .eq("event_type", "purchase")
          .gte("occurred_at", startUtc)
          .lt("occurred_at", endUtc)
          .range(from, from + PAGE - 1);
        if (error) break;
        all = all.concat(data || []);
        hasMore = (data?.length || 0) === PAGE;
        from += PAGE;
      }
      return all;
    },
    refetchInterval: 60_000,
  });

  const stats = useMemo(() => {
    const cbSales = cbData || [];
    const rtSales = rtData || [];

    const cbCount = cbSales.length;
    // Use amount_brl directly from IPN — ClickBank's own exchange rate at transaction time
    const cbRevBrl = cbSales.reduce((s: number, r: any) => s + Number(r.amount_brl || 0), 0);
    const cbRevUsd = cbSales.reduce((s: number, r: any) => s + Number(r.amount_usd || 0), 0);

    const rtCount = rtSales.length;
    const rtRevUsd = rtSales.reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
    // For RedTrack, use implied rate from IPN if available, else fallback
    const impliedRate = cbRevUsd > 0 ? cbRevBrl / cbRevUsd : 5.24;
    const rtRevBrl = rtSales.reduce((s: number, r: any) => {
      const amt = Number(r.amount || 0);
      return s + (r.currency === "BRL" ? amt : amt * impliedRate);
    }, 0);

    const gapCount = cbCount - rtCount;
    const gapBrl = cbRevBrl - rtRevBrl;
    const gapPct = cbRevBrl > 0 ? (gapBrl / cbRevBrl) * 100 : 0;

    return { cbCount, cbRevBrl, cbRevUsd, rtCount, rtRevBrl, rtRevUsd, gapCount, gapBrl, gapPct };
  }, [cbData, rtData]);

  // Don't render if no clickbank data
  if (!stats.cbCount && !stats.rtCount) return null;

  const isHealthy = Math.abs(stats.gapPct) < 3;
  const isWarning = Math.abs(stats.gapPct) >= 3 && Math.abs(stats.gapPct) < 10;

  return (
    <Card className="border-border/50 bg-card/80">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Auditoria Clickbank vs RedTrack
          {isHealthy ? (
            <Badge variant="outline" className="ml-auto text-[10px] border-emerald-500/30 text-emerald-400">
              <CheckCircle className="h-3 w-3 mr-1" /> Saudável
            </Badge>
          ) : (
            <Badge variant="outline" className={`ml-auto text-[10px] ${isWarning ? "border-yellow-500/30 text-yellow-400" : "border-destructive/30 text-destructive"}`}>
              <AlertTriangle className="h-3 w-3 mr-1" /> Gap {stats.gapPct.toFixed(1)}%
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4">
          {/* Clickbank */}
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Clickbank (IPN)</p>
            <p className="text-lg font-bold text-foreground">{stats.cbCount} <span className="text-xs font-normal text-muted-foreground">vendas</span></p>
            <p className="text-sm text-muted-foreground">{fmt(stats.cbRevBrl)}</p>
            <p className="text-[10px] text-muted-foreground/60">${stats.cbRevUsd.toLocaleString("en-US")} USD</p>
          </div>

          {/* RedTrack */}
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">RedTrack</p>
            <p className="text-lg font-bold text-foreground">{stats.rtCount} <span className="text-xs font-normal text-muted-foreground">vendas</span></p>
            <p className="text-sm text-muted-foreground">{fmt(stats.rtRevBrl)}</p>
            <p className="text-[10px] text-muted-foreground/60">${stats.rtRevUsd.toLocaleString("en-US")} USD</p>
          </div>

          {/* Gap */}
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Gap</p>
            <p className={`text-lg font-bold ${stats.gapCount > 0 ? "text-destructive" : "text-emerald-400"}`}>
              {stats.gapCount > 0 ? "+" : ""}{stats.gapCount} <span className="text-xs font-normal text-muted-foreground">vendas</span>
            </p>
            <p className={`text-sm ${stats.gapBrl > 0 ? "text-destructive" : "text-emerald-400"}`}>
              {stats.gapBrl > 0 ? "+" : ""}{fmt(stats.gapBrl)}
            </p>
            <p className="text-[10px] text-muted-foreground/60">{stats.gapPct.toFixed(1)}% do total CB</p>
          </div>
        </div>

        {stats.gapCount > 0 && (
          <p className="mt-3 text-[11px] text-muted-foreground border-t border-border/30 pt-2">
            {stats.gapCount} venda{stats.gapCount > 1 ? "s" : ""} registrada{stats.gapCount > 1 ? "s" : ""} na Clickbank não
            {stats.gapCount > 1 ? " apareceram" : " apareceu"} no RedTrack.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
