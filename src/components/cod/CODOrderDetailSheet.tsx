import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Package, Truck, CheckCircle2, Wallet, Clock, XCircle, AlertCircle } from "lucide-react";

type CODOrder = {
  id: string;
  external_order_id: string;
  platform: string;
  product_key: string | null;
  order_date: string;
  delivery_date: string | null;
  payment_date: string | null;
  status: string;
  order_value: number | null;
  commission_value: number | null;
  customer_country: string | null;
  raw_payload: Record<string, unknown>;
  received_via: string;
  created_at: string;
  updated_at: string;
};

interface Props {
  orderId: string | null;
  onClose: () => void;
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = iso.length === 10 ? new Date(iso + "T00:00:00") : new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function fmtEUR(v: number | null) {
  return v == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "EUR" }).format(v);
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: "Pendente", color: "bg-amber-500/10 text-amber-500 border-amber-500/30" },
  delivered: { label: "Entregue", color: "bg-blue-500/10 text-blue-500 border-blue-500/30" },
  commission_approved: { label: "Comissão aprovada", color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" },
  paid: { label: "Comissão paga", color: "bg-emerald-600/10 text-emerald-600 border-emerald-600/30" },
  expired: { label: "Expirado", color: "bg-destructive/10 text-destructive border-destructive/30" },
  canceled: { label: "Cancelado", color: "bg-muted text-muted-foreground border-border" },
  refused: { label: "Recusado", color: "bg-destructive/10 text-destructive border-destructive/30" },
};

export function CODOrderDetailSheet({ orderId, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<CODOrder | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) { setOrder(null); setError(null); return; }
    setLoading(true);
    setError(null);
    supabase
      .from("cod_orders")
      .select("*")
      .eq("external_order_id", orderId)
      .maybeSingle()
      .then(({ data, error }) => {
        setLoading(false);
        if (error) { setError(error.message); return; }
        if (!data) { setError(`Pedido ${orderId} não encontrado`); return; }
        setOrder(data as CODOrder);
      });
  }, [orderId]);

  const events = order ? buildTimeline(order) : [];
  const meta = order ? STATUS_META[order.status] ?? { label: order.status, color: "bg-muted" } : null;

  return (
    <Sheet open={!!orderId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" />
            Pedido #{orderId}
          </SheetTitle>
          <SheetDescription>Timeline completa do ciclo COD</SheetDescription>
        </SheetHeader>

        {loading && <div className="mt-6 space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-40 w-full" /></div>}

        {error && (
          <div className="mt-6 p-3 rounded-md bg-destructive/10 border border-destructive/30 text-sm text-destructive flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5" /> {error}
          </div>
        )}

        {order && meta && (
          <div className="mt-4 space-y-5">
            {/* Header info */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <Info label="Status atual" value={<Badge variant="outline" className={`text-[10px] ${meta.color}`}>{meta.label}</Badge>} />
              <Info label="Produto" value={order.product_key ?? "—"} />
              <Info label="Comissão" value={<span className="font-mono">{fmtEUR(order.commission_value)}</span>} />
              <Info label="Valor pedido" value={<span className="font-mono">{fmtEUR(order.order_value)}</span>} />
              <Info label="País" value={order.customer_country ?? "—"} />
              <Info label="Origem" value={<span className="font-mono text-[10px]">{order.received_via}</span>} />
            </div>

            {/* Timeline */}
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-3">Timeline</div>
              <ol className="relative border-l border-border/60 ml-2 space-y-4">
                {events.map((ev, i) => (
                  <li key={i} className="ml-4">
                    <span className={`absolute -left-[9px] flex h-4 w-4 items-center justify-center rounded-full ${ev.done ? ev.color : "bg-muted"} ring-2 ring-background`}>
                      <ev.icon className="h-2.5 w-2.5 text-background" />
                    </span>
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="text-sm font-medium">{ev.label}</div>
                      <div className="text-[11px] text-muted-foreground font-mono whitespace-nowrap">{ev.done ? fmtDate(ev.date) : "—"}</div>
                    </div>
                    {ev.hint && <div className="text-[11px] text-muted-foreground mt-0.5">{ev.hint}</div>}
                  </li>
                ))}
              </ol>
            </div>

            {/* Raw payload */}
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Ver payload bruto (auditoria)</summary>
              <pre className="mt-2 p-3 rounded-md bg-muted/40 overflow-auto max-h-64 text-[10px] font-mono">
                {JSON.stringify(order.raw_payload, null, 2)}
              </pre>
            </details>

            <div className="text-[10px] text-muted-foreground pt-2 border-t border-border/40">
              Última atualização: {fmtDate(order.updated_at)}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}

function buildTimeline(o: CODOrder) {
  const isCsv = o.received_via === "csv_import";
  const delivered = ["delivered", "paid", "commission_approved"].includes(o.status);
  const approved = ["commission_approved", "paid"].includes(o.status);
  const paid = o.status === "paid";
  const expired = o.status === "expired";

  const events = [
    {
      label: "Pedido criado",
      icon: Package,
      color: "bg-primary",
      done: true,
      date: o.order_date,
      hint: null as string | null,
    },
    {
      label: "Pedido entregue",
      icon: Truck,
      color: "bg-blue-500",
      done: delivered,
      date: o.delivery_date,
      hint: isCsv && delivered ? "Data estimada (histórico CSV, sem timestamp real)" : null,
    },
    {
      label: "Comissão aprovada",
      icon: CheckCircle2,
      color: "bg-emerald-500",
      done: approved,
      date: approved ? o.updated_at : null,
      hint: isCsv && approved ? "Data estimada (histórico CSV)" : null,
    },
    {
      label: "Comissão paga",
      icon: Wallet,
      color: "bg-emerald-600",
      done: paid,
      date: o.payment_date,
      hint: isCsv && paid ? "Data estimada (histórico CSV)" : null,
    },
  ];

  if (expired) {
    events.splice(1, 3, {
      label: "Pedido expirado",
      icon: XCircle,
      color: "bg-destructive",
      done: true,
      date: o.updated_at,
      hint: isCsv ? "Data estimada (histórico CSV)" : null,
    } as typeof events[number]);
  } else if (!delivered) {
    events[1] = { ...events[1], icon: Clock };
  }

  return events;
}
