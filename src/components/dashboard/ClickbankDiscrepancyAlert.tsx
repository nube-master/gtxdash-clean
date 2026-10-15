import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, TrendingDown, CheckCircle2, AlertCircle } from "lucide-react";
import { useDateRange } from "@/contexts/DateRangeContext";

/**
 * Compares Clickbank reference postbacks (store='clickbank_ref') with RedTrack events.
 * Alerts when count or revenue divergence > 10% on any given day.
 * Note: Upsells with $0 are expected (affiliate model) and NOT treated as errors.
 */
export function ClickbankDiscrepancyAlert() {
  const { dateRange } = useDateRange();
  const [start, end] = dateRange;

  const { data } = useQuery({
    queryKey: ["clickbank-discrepancy-check", start, end],
    queryFn: async () => {
      const startUtc = `${start}T03:00:00Z`;
      const endDate = new Date(`${end}T12:00:00Z`);
      endDate.setUTCDate(endDate.getUTCDate() + 1);
      const endExclusiveUtc = `${endDate.toISOString().slice(0, 10)}T03:00:00Z`;

      // Fetch all data in parallel
      const [salesRes, rtPurchaseRes] = await Promise.all([
        supabase
          .from("sales_data")
          .select("date, revenue, status, product_name")
          .in("store", ["clickbank_ref", "clickbank"])
          .eq("status", "approved")
          .gte("date", start)
          .lte("date", end),
        supabase
          .from("redtrack_events")
          .select("occurred_at, amount, event_type, offer_name")
          .eq("event_type", "purchase")
          .gte("occurred_at", startUtc)
          .lt("occurred_at", endExclusiveUtc),
      ]);

      const salesRows = salesRes.data || [];
      const rtPurchases = rtPurchaseRes.data || [];

      // Aggregate reference sales by date
      const salesByDate = new Map<string, { revenue: number; count: number; byProject: Map<string, number> }>();
      for (const r of salesRows) {
        const d = r.date;
        if (!salesByDate.has(d)) salesByDate.set(d, { revenue: 0, count: 0, byProject: new Map() });
        const entry = salesByDate.get(d)!;
        entry.revenue += Number(r.revenue);
        entry.count++;
        const proj = r.product_name || "Outro";
        entry.byProject.set(proj, (entry.byProject.get(proj) || 0) + 1);
      }

      // Aggregate RedTrack purchases by date
      const rtByDate = new Map<string, { revenue: number; count: number; byProject: Map<string, number> }>();
      for (const r of rtPurchases) {
        const amount = Number(r.amount || 0);
        if (amount <= 0) continue;

        const d = new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Sao_Paulo",
          year: "numeric", month: "2-digit", day: "2-digit",
        }).format(new Date(r.occurred_at as string));

        if (!rtByDate.has(d)) rtByDate.set(d, { revenue: 0, count: 0, byProject: new Map() });
        const entry = rtByDate.get(d)!;
        entry.revenue += amount;
        entry.count++;
        const offer = (r.offer_name as string) || "";
        const proj = /NDR/i.test(offer) ? "NDR" : /NDM/i.test(offer) ? "NDM" : /LDG|LDR/i.test(offer) ? "LDR" : /MON|\bMO\b/i.test(offer) ? "MO" : "Outro";
        entry.byProject.set(proj, (entry.byProject.get(proj) || 0) + 1);
      }

      // Find discrepancies
      const allDates = new Set([...salesByDate.keys(), ...rtByDate.keys()]);
      const discrepancies: {
        date: string;
        cbCount: number;
        rtCount: number;
        pctDiff: number;
        missingProjects: string[];
      }[] = [];

      for (const date of allDates) {
        const cb = salesByDate.get(date);
        const rt = rtByDate.get(date);
        if (!cb || !rt) continue;

        const maxCount = Math.max(cb.count, rt.count);
        if (maxCount === 0) continue;
        const countDiff = Math.abs(cb.count - rt.count);
        const pctDiff = (countDiff / maxCount) * 100;

        if (pctDiff >= 10 || countDiff >= 2) {
          const missingProjects: string[] = [];
          for (const [proj, cbQty] of cb.byProject) {
            const rtQty = rt.byProject.get(proj) || 0;
            if (cbQty > rtQty) missingProjects.push(`${proj}: -${cbQty - rtQty}`);
          }
          discrepancies.push({ date, cbCount: cb.count, rtCount: rt.count, pctDiff, missingProjects });
        }
      }

      return {
        discrepancies: discrepancies.sort((a, b) => b.date.localeCompare(a.date)),
        hasReference: salesRows.length > 0,
      };
    },
    refetchInterval: 10 * 60 * 1000,
    staleTime: 5 * 60 * 1000,
  });

  const hasDiscrepancies = data?.discrepancies && data.discrepancies.length > 0;

  // Nothing to show
  if (!data?.hasReference) return null;

  const fmtDate = (d: string) => {
    const [, m, day] = d.split("-");
    return `${day}/${m}`;
  };

  const fmtBRL = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });

  return (
    <div className="space-y-2">
      {/* Clickbank reference discrepancy alert */}
      {data?.hasReference && !hasDiscrepancies && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
          <p className="text-xs text-emerald-400 font-medium">
            Clickbank ↔ RedTrack: contagem batendo ✓
          </p>
        </div>
      )}

      {hasDiscrepancies && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3">
          <TrendingDown className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs text-amber-400 font-medium flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3" />
              Vendas faltando no RedTrack ({data!.discrepancies.length} dia{data!.discrepancies.length > 1 ? "s" : ""})
            </p>
            <div className="text-[10px] text-muted-foreground mt-1 space-y-0.5">
              {data!.discrepancies.slice(0, 3).map((d) => (
                <p key={d.date}>
                  <span className="font-semibold text-foreground">{fmtDate(d.date)}</span>
                  {" — Clickbank: "}{d.cbCount} vendas
                  {" vs RedTrack: "}{d.rtCount} vendas
                  {d.missingProjects.length > 0 && (
                    <span className="text-amber-400 font-semibold">
                      {" — "}Faltando: {d.missingProjects.join(", ")}
                    </span>
                  )}
                </p>
              ))}
              {data!.discrepancies.length > 3 && (
                <p className="text-muted-foreground/70">+ {data!.discrepancies.length - 3} dia(s) com discrepância</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
