import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { CalendarDays, Download, TrendingUp, Percent, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";



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
  created_at: string;
  updated_at: string;
};


const STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: "Pendente", color: "bg-amber-500/10 text-amber-500 border-amber-500/30" },
  delivered: { label: "Entregue", color: "bg-blue-500/10 text-blue-500 border-blue-500/30" },
  commission_approved: { label: "Aprovada", color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" },
  paid: { label: "Paga", color: "bg-emerald-600/10 text-emerald-600 border-emerald-600/30" },
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
function fmtBRL(v: number | null) {
  return v == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
function fmtEurBrl(v: number | null, fx: number) {
  if (v == null) return "—";
  return `${fmtEUR(v)} · ${fmtBRL(v * fx)}`;
}
function fmtBRDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

interface Props {
  date: string | null;
  operationId: string | undefined;
  onClose: () => void;
  onOpenOrder: (externalId: string) => void;
}

export function CODDayOrdersSheet({ date, operationId, onClose, onOpenOrder }: Props) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [fx, setFx] = useState<number>(5.85);

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
    if (!date || !operationId) { setRows([]); return; }
    setLoading(true);
    supabase
      .from("cod_orders")
      .select("id, external_order_id, product_key, order_date, delivery_date, payment_date, status, commission_value, customer_country, created_at, updated_at")
      .eq("operation_id", operationId)
      .eq("order_date", date)
      .order("commission_value", { ascending: false, nullsFirst: false })
      .limit(500)
      .then(({ data }) => {
        setRows((data as Row[]) ?? []);
        setLoading(false);
      });
  }, [date, operationId]);

  const totals = rows.reduce(
    (a, r) => {
      a.total++;
      if (["paid", "commission_approved", "delivered"].includes(r.status)) a.delivered++;
      if (r.status === "expired") a.expired++;
      if (r.status === "pending") a.pending++;
      a.commission += Number(r.commission_value) || 0;
      return a;
    },
    { total: 0, delivered: 0, expired: 0, pending: 0, commission: 0 }
  );

  const exportCsv = () => {
    const header = ["ID", "Produto", "Order Date", "Delivered", "Approved", "Paid", "Status", "Comissão EUR", "País"].join(",");
    const lines = rows.map((r) =>
      [
        r.external_order_id,
        r.product_key ?? "",
        r.order_date,
        r.delivery_date ?? "",
        ["commission_approved", "paid"].includes(r.status) ? r.updated_at.slice(0, 10) : "",
        r.payment_date ?? "",
        r.status,
        (r.commission_value ?? 0).toFixed(2),
        r.customer_country ?? "",
      ].join(",")
    );
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cod-orders-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Sheet open={!!date} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="sm:max-w-3xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" />
            Pedidos do dia {date && fmtBRDate(date)}
          </SheetTitle>
          <SheetDescription>Auditoria — clique num ID pra ver a timeline completa</SheetDescription>
        </SheetHeader>

        <div className="mt-4 grid grid-cols-4 gap-2 text-xs">
          <Stat label="Total" value={String(totals.total)} />
          <Stat label="Entregues" value={String(totals.delivered)} tone="ok" />
          <Stat label="Pendentes" value={String(totals.pending)} tone="warn" />
          <Stat label="Comissão" value={fmtEUR(totals.commission)} tone="ok" />
        </div>

        <SevenDayComparison
          date={date}
          operationId={operationId}
          todayTotals={totals}
          fx={fx}
        />

        <HourlyEvolutionChart rows={rows} loading={loading} date={date} />

        <ProductRankingMini rows={rows} loading={loading} fx={fx} />

        <TopOrdersByStatus rows={rows} loading={loading} onOpenOrder={onOpenOrder} fx={fx} />




        <div className="mt-3 flex justify-end">
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={rows.length === 0} className="h-7 text-xs">
            <Download className="h-3 w-3 mr-1" /> CSV do dia
          </Button>
        </div>

        <div className="mt-2 overflow-x-auto border border-border/60 rounded-md">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-2 py-2 font-medium">ID</th>
                <th className="text-left px-2 py-2 font-medium">Produto</th>
                <th className="text-center px-2 py-2 font-medium">Criado</th>
                <th className="text-center px-2 py-2 font-medium">Entregue</th>
                <th className="text-center px-2 py-2 font-medium">Aprovada</th>
                <th className="text-center px-2 py-2 font-medium">Paga</th>
                <th className="text-center px-2 py-2 font-medium">Status</th>
                <th className="text-right px-2 py-2 font-medium">€</th>
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-t border-border/40"><td colSpan={8} className="p-1"><Skeleton className="h-6 w-full" /></td></tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">Nenhum pedido nesse dia</td></tr>
              )}
              {!loading && rows.map((r) => {
                const meta = STATUS_META[r.status] ?? { label: r.status, color: "bg-muted" };
                const approvedDate = ["commission_approved", "paid"].includes(r.status) ? r.updated_at.slice(0, 10) : null;
                return (
                  <tr key={r.id} className="border-t border-border/40 hover:bg-muted/30 cursor-pointer" onClick={() => onOpenOrder(r.external_order_id)}>
                    <td className="px-2 py-1.5 font-mono text-primary underline-offset-2 hover:underline">#{r.external_order_id}</td>
                    <td className="px-2 py-1.5 font-mono text-[10px]">{r.product_key ?? "—"}</td>
                    <td className="px-2 py-1.5 text-center font-mono text-[10px]">{fmtDate(r.order_date)}</td>
                    <td className="px-2 py-1.5 text-center font-mono text-[10px] text-muted-foreground">{fmtDate(r.delivery_date)}</td>
                    <td className="px-2 py-1.5 text-center font-mono text-[10px] text-muted-foreground">{fmtDate(approvedDate)}</td>
                    <td className="px-2 py-1.5 text-center font-mono text-[10px] text-muted-foreground">{fmtDate(r.payment_date)}</td>
                    <td className="px-2 py-1.5 text-center">
                      <Badge variant="outline" className={`text-[9px] ${meta.color}`}>{meta.label}</Badge>
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                      {fmtEUR(r.commission_value)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="text-[10px] text-muted-foreground mt-3">
          Datas de <em>entrega/aprovada/paga</em> vindas de CSV histórico são estimadas. Pedidos que chegarem via webhook Shphere terão timestamps reais.
        </p>
      </SheetContent>
    </Sheet>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  const color = tone === "ok" ? "text-emerald-500" : tone === "warn" ? "text-amber-500" : "";
  return (
    <div className="p-2 rounded-md border border-border/60 bg-card">
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold tabular-nums mt-0.5 ${color}`}>{value}</div>
    </div>
  );
}

// ---------- Hourly evolution chart ----------
type Bucket = { label: string; hour: number; gerados: number; entregues: number; gerAcum: number; entAcum: number };

function buildBuckets(rows: Row[], date: string | null, granularity: "hour" | "franja") {
  if (!date) return [];
  // Bucket by BRT hour of created_at (gerados) and updated_at (entregues, when in delivered statuses today)
  const size = granularity === "hour" ? 1 : 4; // 4h franjas: 0-4, 4-8, 8-12, 12-16, 16-20, 20-24
  const count = 24 / size;
  const buckets: Bucket[] = Array.from({ length: count }, (_, i) => {
    const h = i * size;
    const label = size === 1
      ? `${String(h).padStart(2, "0")}h`
      : `${String(h).padStart(2, "0")}-${String(h + size).padStart(2, "0")}h`;
    return { label, hour: h, gerados: 0, entregues: 0, gerAcum: 0, entAcum: 0 };
  });

  const brtHour = (iso: string) => {
    // UTC-3
    const d = new Date(iso);
    const brt = new Date(d.getTime() - 3 * 3600 * 1000);
    return brt.getUTCHours();
  };
  const brtDate = (iso: string) => {
    const d = new Date(iso);
    const brt = new Date(d.getTime() - 3 * 3600 * 1000);
    return brt.toISOString().slice(0, 10);
  };

  for (const r of rows) {
    // gerados: created_at on this order_date (basically always true for order_date match, but guard)
    if (r.created_at) {
      const h = brtHour(r.created_at);
      const idx = Math.floor(h / size);
      if (buckets[idx]) buckets[idx].gerados++;
    }
    // entregues: quando status virou delivered/approved/paid — usamos updated_at se caiu no mesmo dia
    if (DELIVERED.includes(r.status) && r.updated_at && brtDate(r.updated_at) === date) {
      const h = brtHour(r.updated_at);
      const idx = Math.floor(h / size);
      if (buckets[idx]) buckets[idx].entregues++;
    }
  }

  let ga = 0, ea = 0;
  for (const b of buckets) {
    ga += b.gerados; ea += b.entregues;
    b.gerAcum = ga; b.entAcum = ea;
  }
  return buckets;
}

function HourlyEvolutionChart({ rows, loading, date }: { rows: Row[]; loading: boolean; date: string | null }) {
  const [granularity, setGranularity] = useState<"hour" | "franja">("franja");
  const [mode, setMode] = useState<"volume" | "acumulado">("volume");

  const data = useMemo(() => buildBuckets(rows, date, granularity), [rows, date, granularity]);

  if (loading) return <div className="mt-4"><Skeleton className="h-40 w-full" /></div>;
  if (!rows.length) return null;

  const totalEnt = data.reduce((a, b) => a + b.entregues, 0);
  const hasDeliveredIntraday = totalEnt > 0;

  return (
    <div className="mt-4 p-3 rounded-md border border-border/60 bg-card/40">
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
          📈 Evolução ao longo do dia
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant={granularity === "franja" ? "default" : "outline"} onClick={() => setGranularity("franja")} className="h-6 px-2 text-[10px]">Franja 4h</Button>
          <Button size="sm" variant={granularity === "hour" ? "default" : "outline"} onClick={() => setGranularity("hour")} className="h-6 px-2 text-[10px]">Por hora</Button>
          <span className="mx-1 text-border">|</span>
          <Button size="sm" variant={mode === "volume" ? "default" : "outline"} onClick={() => setMode("volume")} className="h-6 px-2 text-[10px]">Volume</Button>
          <Button size="sm" variant={mode === "acumulado" ? "default" : "outline"} onClick={() => setMode("acumulado")} className="h-6 px-2 text-[10px]">Acumulado</Button>
        </div>
      </div>
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} width={30} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 11 }}
              labelStyle={{ color: "hsl(var(--foreground))", fontSize: 10 }}
            />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Line
              type="monotone"
              dataKey={mode === "volume" ? "gerados" : "gerAcum"}
              name="Gerados"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
            <Line
              type="monotone"
              dataKey={mode === "volume" ? "entregues" : "entAcum"}
              name="Entregues"
              stroke="hsl(142 76% 45%)"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {!hasDeliveredIntraday && (
        <p className="text-[9px] text-muted-foreground mt-1">
          * Entregues por hora só aparecem quando a confirmação (aprovada/paga) acontece no próprio dia.
        </p>
      )}
    </div>
  );
}


const DELIVERED = ["paid", "commission_approved", "delivered"];
const LOST = ["expired", "canceled", "refused"];

type MiniAgg = {
  product: string;
  generated: number;
  delivered: number;
  pending: number;
  lost: number;
  commissionEur: number;
  deliveryRate: number;
};

function ProductRankingMini({ rows, loading, fx }: { rows: Row[]; loading: boolean; fx: number }) {
  const [sortBy, setSortBy] = useState<"commission" | "rate">("commission");

  if (loading) {
    return <div className="mt-4"><Skeleton className="h-32 w-full" /></div>;
  }
  if (!rows.length) return null;

  const map = new Map<string, MiniAgg>();
  for (const r of rows) {
    const key = (r.product_key || "—").trim() || "—";
    if (!map.has(key)) {
      map.set(key, { product: key, generated: 0, delivered: 0, pending: 0, lost: 0, commissionEur: 0, deliveryRate: 0 });
    }
    const a = map.get(key)!;
    a.generated++;
    if (DELIVERED.includes(r.status)) {
      a.delivered++;
      a.commissionEur += Number(r.commission_value) || 0;
    } else if (r.status === "pending") a.pending++;
    else if (LOST.includes(r.status)) a.lost++;
  }
  const list = Array.from(map.values()).map((a) => {
    // Taxa Entrega = entregues / gerados (consistente com o dashboard COD)
    a.deliveryRate = a.generated > 0 ? a.delivered / a.generated : 0;
    return a;
  });

  if (sortBy === "commission") {
    list.sort((a, b) => b.commissionEur - a.commissionEur || b.delivered - a.delivered);
  } else {
    // Rate: entregues / gerados; ties break by delivered count
    list.sort((a, b) => b.deliveryRate - a.deliveryRate || b.delivered - a.delivered);
  }
  if (list.length <= 1) return null;

  const maxComm = Math.max(...list.map((r) => r.commissionEur), 1);

  const rateColor = (r: number) =>
    r >= 0.3 ? "text-emerald-500" : r >= 0.15 ? "text-amber-500" : "text-destructive";
  const barColor = (r: number) =>
    r >= 0.3 ? "bg-emerald-500" : r >= 0.15 ? "bg-amber-500" : "bg-destructive";

  return (
    <div className="mt-4 p-3 rounded-md border border-border/60 bg-card/40">
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
          🏆 Ranking por Produto — do dia
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant={sortBy === "commission" ? "default" : "outline"}
            onClick={() => setSortBy("commission")}
            className="h-6 px-2 text-[10px]"
          >
            <TrendingUp className="h-3 w-3 mr-1" /> Comissão
          </Button>
          <Button
            size="sm"
            variant={sortBy === "rate" ? "default" : "outline"}
            onClick={() => setSortBy("rate")}
            className="h-6 px-2 text-[10px]"
          >
            <Percent className="h-3 w-3 mr-1" /> Taxa
          </Button>
          <span className="text-[10px] text-muted-foreground ml-1">{list.length}</span>
        </div>
      </div>
      <div className="space-y-1.5">
        {list.map((r, i) => {
          const pct = sortBy === "commission"
            ? (r.commissionEur / maxComm) * 100
            : r.deliveryRate * 100;
          return (
            <div key={r.product} className="flex items-center gap-2 text-[11px]">
              <span className="w-4 text-center text-muted-foreground font-mono">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="font-mono font-semibold truncate">{r.product}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`font-mono text-[10px] ${rateColor(r.deliveryRate)}`}>
                      {(r.deliveryRate * 100).toFixed(0)}%
                    </span>
                    <span className="font-mono font-semibold text-emerald-500 tabular-nums">
                      {fmtEUR(r.commissionEur)}
                    </span>
                  </div>
                </div>
                <div className="h-1 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full ${barColor(r.deliveryRate)}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="flex gap-2 text-[9px] text-muted-foreground font-mono mt-0.5">
                  <span>{r.generated} ger</span>
                  <span>·</span>
                  <span className="text-foreground/70">{r.delivered} entr</span>
                  {r.pending > 0 && <><span>·</span><span className="text-amber-500/80">{r.pending} pend</span></>}
                  {r.lost > 0 && <><span>·</span><span className="text-destructive/70">{r.lost} perd</span></>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Top Orders by Status (drill-down) ----------
type StatusTab = "delivered" | "pending" | "lost";

const STATUS_TABS: { key: StatusTab; label: string; statuses: string[]; tone: string; barTone: string }[] = [
  { key: "delivered", label: "Entregues", statuses: DELIVERED, tone: "text-emerald-500", barTone: "bg-emerald-500" },
  { key: "pending", label: "Pendentes", statuses: ["pending"], tone: "text-amber-500", barTone: "bg-amber-500" },
  { key: "lost", label: "Perdidos", statuses: LOST, tone: "text-destructive", barTone: "bg-destructive" },
];

function TopOrdersByStatus({
  rows,
  loading,
  onOpenOrder,
  fx,
}: {
  rows: Row[];
  loading: boolean;
  onOpenOrder: (externalId: string) => void;
  fx: number;
}) {
  const [tab, setTab] = useState<StatusTab>("delivered");
  const [limit, setLimit] = useState(5);

  if (loading) return <div className="mt-4"><Skeleton className="h-40 w-full" /></div>;
  if (!rows.length) return null;

  const counts = STATUS_TABS.reduce((acc, t) => {
    acc[t.key] = rows.filter((r) => t.statuses.includes(r.status)).length;
    return acc;
  }, {} as Record<StatusTab, number>);

  const active = STATUS_TABS.find((t) => t.key === tab)!;
  const filtered = rows
    .filter((r) => active.statuses.includes(r.status))
    .sort((a, b) => (Number(b.commission_value) || 0) - (Number(a.commission_value) || 0));

  const visible = filtered.slice(0, limit);
  const totalEur = filtered.reduce((s, r) => s + (Number(r.commission_value) || 0), 0);
  const maxEur = Math.max(...visible.map((r) => Number(r.commission_value) || 0), 1);

  return (
    <div className="mt-4 p-3 rounded-md border border-border/60 bg-card/40">
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
          🎯 Top pedidos por status
        </div>
        <div className="flex items-center gap-1">
          {STATUS_TABS.map((t) => (
            <Button
              key={t.key}
              size="sm"
              variant={tab === t.key ? "default" : "outline"}
              onClick={() => { setTab(t.key); setLimit(5); }}
              className="h-6 px-2 text-[10px]"
            >
              {t.label} <span className="ml-1 opacity-70">({counts[t.key]})</span>
            </Button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-[11px] text-muted-foreground py-6 text-center">
          Nenhum pedido nesse status.
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-2">
            <span>{filtered.length} pedidos · Comissão total {fmtEUR(totalEur)}</span>
            <span className="italic">clique num pedido pra abrir a timeline</span>
          </div>
          <div className="space-y-1">
            {visible.map((r, i) => {
              const val = Number(r.commission_value) || 0;
              const pct = (val / maxEur) * 100;
              return (
                <button
                  key={r.id}
                  onClick={() => onOpenOrder(r.external_order_id)}
                  className="w-full flex items-center gap-2 text-[11px] p-1.5 rounded hover:bg-muted/40 transition-colors text-left"
                >
                  <span className="w-4 text-center text-muted-foreground font-mono">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-primary underline-offset-2 hover:underline shrink-0">
                          #{r.external_order_id}
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground truncate">
                          {r.product_key ?? "—"}
                        </span>
                        {r.customer_country && (
                          <span className="font-mono text-[9px] text-muted-foreground/70">
                            {r.customer_country}
                          </span>
                        )}
                      </div>
                      <span className={`font-mono font-semibold tabular-nums ${active.tone}`}>
                        {fmtEUR(val)}
                      </span>
                    </div>
                    <div className="h-1 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full ${active.barTone}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          {filtered.length > limit && (
            <div className="mt-2 flex justify-center">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setLimit((l) => l + 10)}
                className="h-6 px-3 text-[10px]"
              >
                Ver mais ({filtered.length - limit} restantes)
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}


// ---------- 7-day comparison ----------
type DayAgg = { total: number; delivered: number; pending: number; commission: number; deliveryRate: number };

function SevenDayComparison({
  date,
  operationId,
  todayTotals,
  fx,
}: {
  date: string | null;
  operationId: string | undefined;
  todayTotals: { total: number; delivered: number; pending: number; commission: number };
  fx: number;
}) {
  const [loading, setLoading] = useState(false);
  const [avg, setAvg] = useState<DayAgg | null>(null);
  const [days, setDays] = useState(0);

  useEffect(() => {
    if (!date || !operationId) { setAvg(null); return; }
    const end = new Date(date + "T00:00:00");
    const start = new Date(end.getTime() - 7 * 86400_000);
    const startIso = start.toISOString().slice(0, 10);
    const endIso = new Date(end.getTime() - 86400_000).toISOString().slice(0, 10);
    setLoading(true);
    supabase
      .from("cod_orders")
      .select("order_date, status, commission_value")
      .eq("operation_id", operationId)
      .gte("order_date", startIso)
      .lte("order_date", endIso)
      .limit(5000)
      .then(({ data }) => {
        const byDay = new Map<string, DayAgg>();
        for (const r of (data ?? []) as any[]) {
          const d = r.order_date as string;
          if (!byDay.has(d)) byDay.set(d, { total: 0, delivered: 0, pending: 0, commission: 0, deliveryRate: 0 });
          const a = byDay.get(d)!;
          a.total++;
          if (DELIVERED.includes(r.status)) { a.delivered++; a.commission += Number(r.commission_value) || 0; }
          if (r.status === "pending") a.pending++;
        }
        const n = byDay.size;
        setDays(n);
        if (n === 0) { setAvg(null); setLoading(false); return; }
        const agg: DayAgg = { total: 0, delivered: 0, pending: 0, commission: 0, deliveryRate: 0 };
        for (const v of byDay.values()) {
          agg.total += v.total; agg.delivered += v.delivered; agg.pending += v.pending; agg.commission += v.commission;
        }
        agg.total /= n; agg.delivered /= n; agg.pending /= n; agg.commission /= n;
        const closedTotal = Array.from(byDay.values()).reduce((s, v) => s + v.delivered, 0);
        const closedLost = (data ?? []).filter((r: any) => LOST.includes(r.status)).length;
        agg.deliveryRate = closedTotal + closedLost > 0 ? closedTotal / (closedTotal + closedLost) : 0;
        setAvg(agg);
        setLoading(false);
      });
  }, [date, operationId]);

  if (loading) return <div className="mt-3"><Skeleton className="h-24 w-full" /></div>;
  if (!avg || days === 0) return null;

  const todayClosed = todayTotals.delivered; // aproximação: taxa do dia = delivered / (delivered + lost) — mas não temos lost aqui; usa entregues/total
  const todayRate = todayTotals.total > 0 ? todayTotals.delivered / todayTotals.total : 0;
  const avgRateSimple = avg.total > 0 ? avg.delivered / avg.total : 0;

  const items = [
    { label: "Gerados", today: todayTotals.total, avg: avg.total, fmt: (v: number) => v.toFixed(0) },
    { label: "Entregues", today: todayTotals.delivered, avg: avg.delivered, fmt: (v: number) => v.toFixed(0) },
    { label: "Pendentes", today: todayTotals.pending, avg: avg.pending, fmt: (v: number) => v.toFixed(0), inverse: true },
    { label: "Comissão", today: todayTotals.commission, avg: avg.commission, fmt: (v: number) => fmtEUR(v) },
    { label: "Taxa entrega", today: todayRate, avg: avgRateSimple, fmt: (v: number) => `${(v * 100).toFixed(0)}%`, isRate: true },
  ];

  return (
    <div className="mt-3 p-3 rounded-md border border-border/60 bg-card/40">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
          📊 Hoje vs. média dos últimos {days} dia{days > 1 ? "s" : ""}
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {items.map((it) => {
          const delta = it.avg === 0 ? (it.today > 0 ? 1 : 0) : (it.today - it.avg) / Math.abs(it.avg);
          const good = it.inverse ? delta < 0 : delta > 0;
          const neutral = Math.abs(delta) < 0.02;
          const tone = neutral ? "text-muted-foreground" : good ? "text-emerald-500" : "text-destructive";
          const Icon = neutral ? Minus : delta > 0 ? ArrowUp : ArrowDown;
          const pct = it.isRate ? (it.today - it.avg) * 100 : delta * 100;
          const pctLabel = it.isRate
            ? `${pct > 0 ? "+" : ""}${pct.toFixed(1)}pp`
            : `${pct > 0 ? "+" : ""}${pct.toFixed(0)}%`;
          return (
            <div key={it.label} className="p-2 rounded border border-border/50 bg-background/40">
              <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{it.label}</div>
              <div className="text-sm font-semibold tabular-nums mt-0.5">{it.fmt(it.today)}</div>
              <div className="flex items-center gap-1 mt-0.5">
                <Icon className={`h-3 w-3 ${tone}`} />
                <span className={`text-[10px] font-mono ${tone}`}>{pctLabel}</span>
                <span className="text-[9px] text-muted-foreground ml-auto">méd {it.fmt(it.avg)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}



