import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Download, Globe, Package, Tags } from "lucide-react";
import { useNicheRules } from "@/hooks/useNicheRules";
import { NicheBadge } from "@/components/niche/NicheBadge";
import { NicheRulesDialog } from "@/components/niche/NicheRulesDialog";
import { nicheLabel } from "@/lib/productNiche";

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

const DELIVERED_STATUSES = ["delivered", "commission_approved", "paid"];

const STATUS_META: Record<string, { label: string; color: string }> = {
  delivered: { label: "Entregue", color: "bg-blue-500/10 text-blue-500 border-blue-500/30" },
  commission_approved: { label: "Aprovada", color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" },
  paid: { label: "Paga", color: "bg-emerald-600/10 text-emerald-600 border-emerald-600/30" },
};

function fmtEUR(v: number | null) {
  return v == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "EUR" }).format(v);
}
function fmtBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v || 0);
}
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = iso.length === 10 ? new Date(iso + "T00:00:00") : new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
function fmtBRDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function flagOf(code: string | null) {
  if (!code || code.length !== 2) return "🌐";
  return String.fromCodePoint(...code.toUpperCase().split("").map((c) => 127397 + c.charCodeAt(0)));
}

interface Props {
  open: boolean;
  from: string;
  to: string;
  operationId: string | undefined;
  title?: string;
  onClose: () => void;
  onOpenOrder: (externalId: string) => void;
}

export function CODDeliveriesSheet({ open, from, to, operationId, title, onClose, onOpenOrder }: Props) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [fx, setFx] = useState(5.85);

  useEffect(() => {
    supabase
      .from("exchange_rates_cache")
      .select("rate")
      .eq("base_currency", "EUR")
      .eq("target_currency", "BRL")
      .maybeSingle()
      .then(({ data }) => {
        const r = Number((data as any)?.rate);
        if (r > 0) setFx(r);
      });
  }, []);

  useEffect(() => {
    if (!open || !operationId) return;
    setLoading(true);
    supabase
      .from("cod_orders")
      .select(
        "id, external_order_id, product_key, order_date, delivery_date, payment_date, status, commission_value, customer_country, updated_at",
      )
      .eq("operation_id", operationId)
      .in("status", DELIVERED_STATUSES)
      // Entregues = data de ENTREGA dentro do período (fallback: data do pedido quando não há delivery_date)
      .or(
        `and(delivery_date.gte.${from},delivery_date.lte.${to}),and(delivery_date.is.null,order_date.gte.${from},order_date.lte.${to})`,
      )
      .order("delivery_date", { ascending: false })
      .limit(1000)
      .then(({ data }) => {
        setRows((data as Row[]) ?? []);
        setLoading(false);
      });
  }, [open, operationId, from, to]);

  const commissionEur = rows.reduce((s, r) => s + (Number(r.commission_value) || 0), 0);

  const { detect } = useNicheRules();

  const byNiche = useMemo(() => {
    const m = new Map<string, { count: number; eur: number }>();
    rows.forEach((r) => {
      const k = detect(r.product_key);
      const cur = m.get(k) ?? { count: 0, eur: 0 };
      cur.count++;
      cur.eur += Number(r.commission_value) || 0;
      m.set(k, cur);
    });
    return [...m.entries()].sort((a, b) => b[1].count - a[1].count);
  }, [rows, detect]);



  const byProduct = useMemo(() => {
    const m = new Map<string, { count: number; eur: number }>();
    rows.forEach((r) => {
      const k = r.product_key || "—";
      const cur = m.get(k) ?? { count: 0, eur: 0 };
      cur.count++;
      cur.eur += Number(r.commission_value) || 0;
      m.set(k, cur);
    });
    return [...m.entries()].sort((a, b) => b[1].count - a[1].count);
  }, [rows]);

  const byCountry = useMemo(() => {
    const m = new Map<string, { count: number; eur: number }>();
    rows.forEach((r) => {
      const k = (r.customer_country || "").toUpperCase() || "??";
      const cur = m.get(k) ?? { count: 0, eur: 0 };
      cur.count++;
      cur.eur += Number(r.commission_value) || 0;
      m.set(k, cur);
    });
    return [...m.entries()].sort((a, b) => b[1].count - a[1].count);
  }, [rows]);

  const exportCsv = () => {
    const header = ["ID", "Produto", "Nicho", "País", "Order Date", "Entrega", "Pagamento", "Status", "Comissão EUR"].join(",");
    const lines = rows.map((r) =>
      [
        r.external_order_id,
        r.product_key ?? "",
        nicheLabel(detect(r.product_key)),
        r.customer_country ?? "",
        r.order_date,
        r.delivery_date ?? "",
        r.payment_date ?? "",
        r.status,
        (r.commission_value ?? 0).toFixed(2),
      ].join(","),
    );
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cod-entregas-${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="sm:max-w-3xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            {title ?? "Entregas"} — {fmtBRDate(from)} a {fmtBRDate(to)}
          </SheetTitle>
          <SheetDescription>
            Histórico de pedidos entregues/comissionados — produtos, países e comissão. Clique num ID pra ver a timeline.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
          <Stat label="Entregas" value={String(rows.length)} />
          <Stat label="Comissão €" value={fmtEUR(commissionEur)} />
          <Stat label="Comissão R$" value={fmtBRL(commissionEur * fx)} />
        </div>

        {/* Produtos */}
        <Section icon={<Package className="h-3.5 w-3.5 text-primary" />} title="Por produto">
          {loading ? (
            <Skeleton className="h-20 w-full" />
          ) : byProduct.length === 0 ? (
            <Empty />
          ) : (
            <div className="space-y-1">
              {byProduct.map(([k, v]) => (
                <BreakRow
                  key={k}
                  label={k}
                  count={v.count}
                  total={rows.length}
                  right={`${fmtEUR(v.eur)} · ${fmtBRL(v.eur * fx)}`}
                />
              ))}
            </div>
          )}
        </Section>

        {/* Nichos */}
        <Section
          icon={<Tags className="h-3.5 w-3.5 text-primary" />}
          title="Por nicho (automático)"
          action={<NicheRulesDialog />}
        >
          {loading ? (
            <Skeleton className="h-20 w-full" />
          ) : byNiche.length === 0 ? (
            <Empty />
          ) : (
            <div className="space-y-1">
              {byNiche.map(([k, v]) => (
                <BreakRow
                  key={k}
                  label={nicheLabel(k)}
                  count={v.count}
                  total={rows.length}
                  right={`${fmtEUR(v.eur)} · ${fmtBRL(v.eur * fx)}`}
                />
              ))}
            </div>
          )}
        </Section>


        {/* Países */}
        <Section icon={<Globe className="h-3.5 w-3.5 text-primary" />} title="Por país">
          {loading ? (
            <Skeleton className="h-20 w-full" />
          ) : byCountry.length === 0 ? (
            <Empty />
          ) : (
            <div className="space-y-1">
              {byCountry.map(([k, v]) => (
                <BreakRow
                  key={k}
                  label={`${flagOf(k === "??" ? null : k)} ${k}`}
                  count={v.count}
                  total={rows.length}
                  right={`${fmtEUR(v.eur)} · ${fmtBRL(v.eur * fx)}`}
                />
              ))}
            </div>
          )}
        </Section>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Pedidos entregues</span>
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={rows.length === 0} className="h-7 text-xs">
            <Download className="h-3 w-3 mr-1" /> CSV
          </Button>
        </div>

        <div className="mt-2 overflow-x-auto border border-border/60 rounded-md">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-2 py-2 font-medium">ID</th>
                <th className="text-left px-2 py-2 font-medium">Produto</th>
                <th className="text-center px-2 py-2 font-medium">Nicho</th>
                <th className="text-center px-2 py-2 font-medium">País</th>
                <th className="text-center px-2 py-2 font-medium">Origem</th>
                <th className="text-center px-2 py-2 font-medium">Entrega</th>
                <th className="text-center px-2 py-2 font-medium">Status</th>
                <th className="text-right px-2 py-2 font-medium">€</th>
              </tr>
            </thead>
            <tbody>
              {loading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-t border-border/40">
                    <td colSpan={8} className="p-1">
                      <Skeleton className="h-6 w-full" />
                    </td>
                  </tr>
                ))}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-muted-foreground">
                    Nenhuma entrega nesse período
                  </td>
                </tr>
              )}
              {!loading &&
                rows.map((r) => {
                  const meta = STATUS_META[r.status] ?? { label: r.status, color: "bg-muted" };
                  return (
                    <tr
                      key={r.id}
                      className="border-t border-border/40 hover:bg-muted/30 cursor-pointer"
                      onClick={() => onOpenOrder(r.external_order_id)}
                    >
                      <td className="px-2 py-1.5 font-mono text-primary underline-offset-2 hover:underline">
                        #{r.external_order_id}
                      </td>
                      <td className="px-2 py-1.5 font-mono text-[10px]">{r.product_key ?? "—"}</td>
                      <td className="px-2 py-1.5 text-center">
                        <NicheBadge niche={detect(r.product_key)} />
                      </td>
                      <td className="px-2 py-1.5 text-center font-mono text-[10px]">
                        {flagOf(r.customer_country)} {r.customer_country ?? "—"}
                      </td>
                      <td className="px-2 py-1.5 text-center font-mono text-[10px] text-muted-foreground">
                        {fmtDate(r.order_date)}
                      </td>
                      <td className="px-2 py-1.5 text-center font-mono text-[10px] text-muted-foreground">
                        {fmtDate(r.delivery_date ?? r.payment_date)}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <Badge variant="outline" className={`text-[9px] ${meta.color}`}>
                          {meta.label}
                        </Badge>
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums">{fmtEUR(r.commission_value)}</td>
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

function Section({
  icon,
  title,
  children,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mt-4">
      <div className="flex items-center gap-1.5 mb-1.5">
        {icon}
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{title}</span>
        {action && <span className="ml-auto">{action}</span>}
      </div>
      {children}
    </div>
  );
}

function Empty() {
  return <p className="text-xs text-muted-foreground py-2">Sem dados</p>;
}

function BreakRow({ label, count, total, right }: { label: string; count: number; total: number; right: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="rounded-md border border-border/50 bg-background/50 px-2 py-1.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-mono truncate">{label}</span>
        <span className="tabular-nums text-muted-foreground whitespace-nowrap">
          {count} · {pct.toFixed(0)}% · {right}
        </span>
      </div>
      <div className="mt-1 h-1 rounded bg-muted overflow-hidden">
        <div className="h-full bg-primary/70" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-background/60 p-2">
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground font-medium truncate">{label}</div>
      <div className="text-sm font-semibold tabular-nums mt-0.5 truncate">{value}</div>
    </div>
  );
}
