import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { useCODSource, applySourceFilter } from "@/hooks/useCODSourceFilter";

type Row = {
  id: string;
  external_order_id: string;
  product_key: string | null;
  order_date: string;
  delivery_date: string | null;
  payment_date: string | null;
  status: string;
  commission_value: number | null;
  customer_country: string | null;
  updated_at: string;
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: "Pendente", color: "bg-amber-500/10 text-amber-500 border-amber-500/30" },
  delivered: { label: "Entregue", color: "bg-blue-500/10 text-blue-500 border-blue-500/30" },
  commission_approved: { label: "Comissão aprovada", color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" },
  paid: { label: "Comissão paga", color: "bg-emerald-600/10 text-emerald-600 border-emerald-600/30" },
  expired: { label: "Expirado", color: "bg-destructive/10 text-destructive border-destructive/30" },
  canceled: { label: "Cancelado", color: "bg-muted text-muted-foreground border-border" },
  refused: { label: "Recusado", color: "bg-destructive/10 text-destructive border-destructive/30" },
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = iso.length === 10 ? new Date(iso + "T00:00:00") : new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
function fmtEUR(v: number | null) {
  return v == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "EUR" }).format(v);
}

interface Props {
  operationId: string | undefined;
  from: string;
  to: string;
  statuses: string[];
  onOpenOrder: (externalId: string) => void;
}

export function CODOrdersFilteredList({ operationId, from, to, statuses, onOpenOrder }: Props) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const { source } = useCODSource();

  useEffect(() => {
    if (!operationId || statuses.length === 0) { setRows([]); return; }
    setLoading(true);
    let q = supabase
      .from("cod_orders")
      .select("id, external_order_id, product_key, order_date, delivery_date, payment_date, status, commission_value, customer_country, updated_at")
      .eq("operation_id", operationId)
      .gte("order_date", from)
      .lte("order_date", to)
      .in("status", statuses)
      .order("order_date", { ascending: false })
      .order("commission_value", { ascending: false, nullsFirst: false })
      .limit(1000);
    q = applySourceFilter(q, source);
    q.then(({ data }) => {
      setRows((data as Row[]) ?? []);
      setLoading(false);
    });
  }, [operationId, from, to, statuses.join(","), source]);


  const totalCommission = rows.reduce((a, r) => a + (Number(r.commission_value) || 0), 0);

  const exportCsv = () => {
    const header = ["ID", "Produto", "Order Date", "Delivered", "Paid", "Status", "Comissão EUR", "País"].join(",");
    const lines = rows.map((r) => [
      r.external_order_id,
      r.product_key ?? "",
      r.order_date,
      r.delivery_date ?? "",
      r.payment_date ?? "",
      r.status,
      (r.commission_value ?? 0).toFixed(2),
      r.customer_country ?? "",
    ].join(","));
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cod-orders-${from}-to-${to}-${statuses.join("+")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/60 bg-muted/30">
        <div className="text-xs">
          <span className="font-medium">{rows.length}</span>
          <span className="text-muted-foreground"> pedido(s) • </span>
          <span className="font-medium text-emerald-500">{fmtEUR(totalCommission)}</span>
          <span className="text-muted-foreground"> em comissão</span>
        </div>
        <Button size="sm" variant="outline" onClick={exportCsv} disabled={rows.length === 0} className="h-7 text-xs">
          <Download className="h-3 w-3 mr-1" /> CSV
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 font-medium">ID</th>
              <th className="text-left px-3 py-2 font-medium">Produto</th>
              <th className="text-center px-3 py-2 font-medium">Criado</th>
              <th className="text-center px-3 py-2 font-medium">Entregue</th>
              <th className="text-center px-3 py-2 font-medium">Aprovada</th>
              <th className="text-center px-3 py-2 font-medium">Paga</th>
              <th className="text-center px-3 py-2 font-medium">Status</th>
              <th className="text-right px-3 py-2 font-medium">€</th>
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 8 }).map((_, i) => (
              <tr key={i} className="border-t border-border/40"><td colSpan={8} className="p-1"><Skeleton className="h-6 w-full" /></td></tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={8} className="text-center py-10 text-muted-foreground">Nenhum pedido com esse status no período</td></tr>
            )}
            {!loading && rows.map((r) => {
              const meta = STATUS_META[r.status] ?? { label: r.status, color: "bg-muted" };
              const approvedDate = ["commission_approved", "paid"].includes(r.status) ? r.updated_at.slice(0, 10) : null;
              return (
                <tr key={r.id} className="border-t border-border/40 hover:bg-muted/30 cursor-pointer" onClick={() => onOpenOrder(r.external_order_id)}>
                  <td className="px-3 py-1.5 font-mono text-primary underline-offset-2 hover:underline">#{r.external_order_id}</td>
                  <td className="px-3 py-1.5 font-mono text-[10px]">{r.product_key ?? "—"}</td>
                  <td className="px-3 py-1.5 text-center font-mono text-[10px]">{fmtDate(r.order_date)}</td>
                  <td className="px-3 py-1.5 text-center font-mono text-[10px] text-muted-foreground">{fmtDate(r.delivery_date)}</td>
                  <td className="px-3 py-1.5 text-center font-mono text-[10px] text-muted-foreground">{fmtDate(approvedDate)}</td>
                  <td className="px-3 py-1.5 text-center font-mono text-[10px] text-muted-foreground">{fmtDate(r.payment_date)}</td>
                  <td className="px-3 py-1.5 text-center">
                    <Badge variant="outline" className={`text-[9px] ${meta.color}`}>{meta.label}</Badge>
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums">{fmtEUR(r.commission_value)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
