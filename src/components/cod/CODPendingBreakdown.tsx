import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperation } from "@/contexts/OperationContext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CODDayOrdersSheet } from "@/components/cod/CODDayOrdersSheet";
import { CODOrderDetailSheet } from "@/components/cod/CODOrderDetailSheet";
import { Hourglass, AlertTriangle, ChevronRight } from "lucide-react";

const CUTOFF_DAYS = 10;

function isoDaysAgo(n: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
function fmtBRDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function fmtEUR(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "EUR" }).format(v || 0);
}
function daysBetween(iso: string) {
  const d = new Date(iso + "T00:00:00Z").getTime();
  const now = new Date(isoDaysAgo(0) + "T00:00:00Z").getTime();
  return Math.floor((now - d) / 86400000);
}

type Row = { order_date: string; commission_value: number | null };

export function CODPendingBreakdown() {
  const { operationId } = useOperation();
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [openOrder, setOpenOrder] = useState<string | null>(null);

  const { data: historicalRate } = useQuery({
    queryKey: ["cod-historical-rate", operationId],
    enabled: !!operationId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_cod_historical_approval_rate_v2" as any, {
        _operation_id: operationId
      });
      if (error) return 52.38;
      return data as number;
    }
  });

  const rate = (historicalRate ?? 52.38) / 100;

  const { data, isLoading } = useQuery({
    queryKey: ["cod-pending-breakdown", operationId],
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async () => {
      if (!operationId) return { inWindow: [], expired: [] };
      const today = isoDaysAgo(0);
      const { data: rows } = await supabase
        .from("cod_orders")
        .select("order_date, commission_value")
        .eq("operation_id", operationId)
        .eq("status", "pending")
        .lte("order_date", today)
        .limit(5000);

      const cutoff = isoDaysAgo(CUTOFF_DAYS);
      const grouped: Record<string, { count: number; commissionEur: number }> = {};
      for (const r of (rows as Row[]) ?? []) {
        const od = r.order_date;
        if (!grouped[od]) grouped[od] = { count: 0, commissionEur: 0 };
        grouped[od].count++;
        grouped[od].commissionEur += Number(r.commission_value) || 0;
      }
      const all = Object.entries(grouped)
        .map(([date, v]) => ({ date, ...v, ageDays: daysBetween(date) }))
        .sort((a, b) => b.date.localeCompare(a.date));
      return {
        inWindow: all.filter((r) => r.date >= cutoff),
        expired: all.filter((r) => r.date < cutoff),
      };
    },
  });

  const totals = useMemo(() => {
    const inW = (data?.inWindow ?? []).reduce((a, r) => ({ c: a.c + r.count, e: a.e + r.commissionEur }), { c: 0, e: 0 });
    const exp = (data?.expired ?? []).reduce((a, r) => ({ c: a.c + r.count, e: a.e + r.commissionEur }), { c: 0, e: 0 });
    return { inW, exp };
  }, [data]);

  if (isLoading || !data) return <Skeleton className="h-48 w-full" />;

  return (
    <>
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Hourglass className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-semibold">Detalhamento de Pendentes por Dia</h2>
            <Badge variant="outline" className="text-[10px] font-mono">Corte: {CUTOFF_DAYS} dias</Badge>
          </div>
          <div className="text-[11px] text-muted-foreground">
            Clique em um dia para ver os pedidos daquele cohort.
          </div>
        </div>

        <Tabs defaultValue="in_window">
          <TabsList className="mb-3">
            <TabsTrigger value="in_window" className="gap-2">
              <Hourglass className="h-3.5 w-3.5" />
              No prazo
              <Badge variant="secondary" className="ml-1 text-[10px]">{totals.inW.c}</Badge>
            </TabsTrigger>
            <TabsTrigger value="expired" className="gap-2">
              <AlertTriangle className="h-3.5 w-3.5" />
              Vencidos
              <Badge variant="secondary" className="ml-1 text-[10px]">{totals.exp.c}</Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="in_window">
            <DayTable
              rows={data.inWindow}
              emptyLabel="Nenhum pedido pendente dentro dos últimos 10 dias."
              onPick={setOpenDate}
              variant="in_window"
              totalCount={totals.inW.c}
              totalEur={totals.inW.e}
              rate={rate}
            />
          </TabsContent>

          <TabsContent value="expired">
            <DayTable
              rows={data.expired}
              emptyLabel="Nenhum pedido vencido (todos ainda estão no prazo)."
              onPick={setOpenDate}
              variant="expired"
              totalCount={totals.exp.c}
              totalEur={totals.exp.e}
              rate={rate}
            />
          </TabsContent>
        </Tabs>
      </Card>

      <CODDayOrdersSheet
        date={openDate}
        operationId={operationId}
        onClose={() => setOpenDate(null)}
        onOpenOrder={(id) => setOpenOrder(id)}
      />
      <CODOrderDetailSheet
        orderId={openOrder}
        onClose={() => setOpenOrder(null)}
      />
    </>
  );
}

function DayTable({
  rows, emptyLabel, onPick, variant, totalCount, totalEur, rate,
}: {
  rows: { date: string; count: number; commissionEur: number; ageDays: number }[];
  emptyLabel: string;
  onPick: (d: string) => void;
  variant: "in_window" | "expired";
  totalCount: number;
  totalEur: number;
  rate: number;
}) {
  if (rows.length === 0) {
    return <div className="text-xs text-muted-foreground py-6 text-center">{emptyLabel}</div>;
  }
  const isExp = variant === "expired";
  return (
    <div className="rounded-md border border-border/60 overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="text-left px-3 py-2">Data do pedido</th>
            <th className="text-left px-3 py-2">Idade</th>
            <th className="text-right px-3 py-2">Pendentes</th>
            <th className="text-right px-3 py-2">Comissão potencial (EUR)</th>
            <th className="text-right px-3 py-2">Projeção (Est.)</th>
            <th className="text-right px-3 py-2 w-20"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const daysLeft = CUTOFF_DAYS - r.ageDays;
            return (
              <tr
                key={r.date}
                className="border-t border-border/50 hover:bg-muted/30 cursor-pointer"
                onClick={() => onPick(r.date)}
              >
                <td className="px-3 py-2 font-medium">{fmtBRDate(r.date)}</td>
                <td className="px-3 py-2">
                  <Badge
                    variant="outline"
                    className={
                      isExp
                        ? "text-destructive border-destructive/40"
                        : daysLeft <= 2
                        ? "text-amber-500 border-amber-500/40"
                        : "text-muted-foreground"
                    }
                  >
                    {r.ageDays}d {isExp ? "" : `• restam ${daysLeft}d`}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-right font-mono">{r.count}</td>
                <td className="px-3 py-2 text-right font-mono" data-monkey-patch-skip="true">{fmtEUR(r.commissionEur)}</td>
                <td className="px-3 py-2 text-right font-mono text-emerald-500">
                  {Math.round(r.count * rate)} apr. (<span data-monkey-patch-skip="true">{fmtEUR(r.commissionEur * rate)}</span>)
                </td>
                <td className="px-3 py-2 text-right">
                  <Button variant="ghost" size="sm" className="h-7 gap-1 text-[11px]">
                    Ver <ChevronRight className="h-3 w-3" />
                  </Button>
                </td>
              </tr>
            );
          })}
          <tr className="border-t border-border/60 bg-muted/20 font-semibold">
            <td className="px-3 py-2" colSpan={2}>Total</td>
            <td className="px-3 py-2 text-right font-mono">{totalCount}</td>
            <td className="px-3 py-2 text-right font-mono" data-monkey-patch-skip="true">{fmtEUR(totalEur)}</td>
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}
