import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Store, Package, ShoppingCart, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useHotmartCategories, FUNNEL_ROLE_LABEL, type FunnelRole } from "@/hooks/useHotmartCategories";
import { getHotmartEffectiveDate } from "@/lib/hotmartEffectiveDate";


interface Props {
  startDate: string;
  endDate: string;
  operationId: string;
}

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 }).format(v || 0);
const fmtNum = (v: number) =>
  new Intl.NumberFormat("pt-BR").format(Math.round(v));

const COLORS = [
  "hsl(0, 100%, 56%)",
  "hsl(38, 92%, 50%)",
  "hsl(210, 80%, 55%)",
  "hsl(160, 70%, 45%)",
  "hsl(340, 75%, 55%)",
  "hsl(185, 80%, 45%)",
  "hsl(280, 70%, 55%)",
  "hsl(220, 10%, 50%)",
];

const ROLE_COLOR: Record<FunnelRole, string> = {
  frontend: "hsl(160, 70%, 45%)",
  order_bump: "hsl(210, 80%, 55%)",
  upsell: "hsl(280, 70%, 55%)",
  downsell: "hsl(38, 92%, 50%)",
};

function MiniProgress({ pct, color }: { pct: number; color: string }) {
  const r = 9;
  const c = 2 * Math.PI * r;
  return (
    <svg width="22" height="22" className="shrink-0">
      <circle cx="11" cy="11" r={r} fill="none" stroke="hsl(220, 10%, 18%)" strokeWidth="2.5" />
      <circle
        cx="11" cy="11" r={r} fill="none"
        stroke={color} strokeWidth="2.5"
        strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)}
        strokeLinecap="round" transform="rotate(-90 11 11)"
      />
    </svg>
  );
}

function Row({ color, label, valueText, pct }: { color: string; label: string; valueText: string; pct: number }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-border/50 last:border-0">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: color }} />
        <span className="text-xs truncate">{label}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs font-semibold tabular-nums">{valueText}</span>
        <div className="flex items-center gap-1">
          <MiniProgress pct={pct} color={color} />
          <span className="text-[10px] text-muted-foreground tabular-nums w-10 text-right">{pct.toFixed(1)}%</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Pie de Inteligência de Vendas para Escola do Dólar (Hotmart).
 * Fonte: clickbank_audit (vendor=hotmart, SALE) + allowlist do hotmart_config.
 * Mesma base do FunnelConversionCard → totais SEMPRE batem.
 */
export function HotmartSalesIntel({ startDate, endDate, operationId }: Props) {
  const { roleOf, categories, isAllowed, allowedSet, loading: loadingCats } = useHotmartCategories(operationId);

  const { data: sales = [], isLoading } = useQuery({
    queryKey: ["hotmart-sales-intel", operationId, startDate, endDate],
    enabled: !!operationId && !!startDate && !!endDate,
    queryFn: async () => {
      // ±2 dias na janela SQL + filtro por data BRT efetiva (mesma correção do edge dashboard-totals).
      const widen = (ymd: string, delta: number) => {
        const [y, m, d] = ymd.split("-").map(Number);
        const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
        dt.setUTCDate(dt.getUTCDate() + delta);
        return dt.toISOString().slice(0, 10);
      };
      const { data } = await supabase
        .from("clickbank_audit")
        .select("product_name, item_name, amount_brl, date, created_at")
        .eq("operation_id", operationId)
        .eq("vendor", "hotmart")
        .eq("transaction_type", "SALE")
        .gte("date", widen(startDate, -2))
        .lte("date", widen(endDate, 2))
        .limit(10000);
      return (data || []).filter((r: any) => {
        const eff = getHotmartEffectiveDate(r.date, r.created_at);
        return eff >= startDate && eff <= endDate;
      }) as Array<{ product_name: string | null; item_name: string | null; amount_brl: number | null }>;
    },
  });


  const intel = useMemo(() => {
    if (loadingCats) return null;
    const byProduct = new Map<string, { revenue: number; sales: number }>();
    const byRole: Record<FunnelRole, { revenue: number; sales: number }> = {
      frontend: { revenue: 0, sales: 0 },
      order_bump: { revenue: 0, sales: 0 },
      upsell: { revenue: 0, sales: 0 },
      downsell: { revenue: 0, sales: 0 },
    };
    const uncategorized = { revenue: 0, sales: 0 };
    let totalRev = 0;
    let totalSales = 0;
    for (const r of sales) {
      // Segue a mesma allowlist do Dashboard/War Room — só produtos oficiais.
      if (!isAllowed(r.product_name, r.item_name)) continue;
      const role = roleOf(r.product_name, r.item_name);
      const label = (r.product_name || r.item_name || "—").toString().trim();
      const cur = byProduct.get(label) || { revenue: 0, sales: 0 };
      const amt = Number(r.amount_brl || 0);
      cur.revenue += amt;
      cur.sales += 1;
      byProduct.set(label, cur);
      if (role === "ignore") {
        uncategorized.revenue += amt;
        uncategorized.sales += 1;
      } else {
        byRole[role].revenue += amt;
        byRole[role].sales += 1;
      }
      totalRev += amt;
      totalSales += 1;
    }
    const productList = Array.from(byProduct.entries())
      .map(([label, v]) => ({ label, revenue: v.revenue, sales: v.sales }))
      .sort((a, b) => b.revenue - a.revenue);
    return { productList, byRole, uncategorized, totalRev, totalSales };
  }, [sales, roleOf, isAllowed, loadingCats]);

  const hasCategories = Object.keys(categories).length > 0 || allowedSet.size > 0;


  if (isLoading || loadingCats || !intel) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Inteligência de Vendas</h2>
          <div className="flex-1 h-[1px]" style={{ background: "rgba(255,30,30,0.15)" }} />
        </div>
        <p className="text-[10px] text-muted-foreground">Carregando…</p>
      </div>
    );
  }

  if (!hasCategories) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Inteligência de Vendas</h2>
          <div className="flex-1 h-[1px]" style={{ background: "rgba(255,30,30,0.15)" }} />
        </div>
        <div className="text-[11px] text-amber-600 bg-amber-500/10 border border-amber-500/30 rounded p-3">
          Configure categorias dos produtos em <span className="font-semibold">Integrações → Hotmart</span>.
        </div>
      </div>
    );
  }

  const roles: FunnelRole[] = ["frontend", "order_bump", "upsell", "downsell"];
  const leader = intel.productList[0];

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Inteligência de Vendas</h2>
        <div className="flex-1 h-[1px]" style={{ background: "rgba(255,30,30,0.15)" }} />
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {intel.totalSales} vendas · {fmtBRL(intel.totalRev)}
        </span>
      </div>
      <p className="text-[10px] text-muted-foreground mb-3 -mt-1">
        Hotmart (allowlist configurada) — mesma base do card "Conversão do Funil"
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Card 1 — por Papel no Funil */}
        <Card className="bg-card border border-border relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: COLORS[0] }} />
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-7 w-7 rounded-md bg-secondary flex items-center justify-center text-muted-foreground">
                <Store className="h-3.5 w-3.5" />
              </div>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Faturamento por Papel
              </span>
            </div>
            {roles.map((role) => {
              const item = intel.byRole[role];
              const pct = intel.totalRev > 0 ? (item.revenue / intel.totalRev) * 100 : 0;
              return (
                <Row key={role} color={ROLE_COLOR[role]} label={FUNNEL_ROLE_LABEL[role]}
                     valueText={fmtBRL(item.revenue)} pct={pct} />
              );
            })}
          </CardContent>
        </Card>

        {/* Card 2 — Faturamento por Produto */}
        <Card className="bg-card border border-border relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: COLORS[1] }} />
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-7 w-7 rounded-md bg-secondary flex items-center justify-center text-muted-foreground">
                <Package className="h-3.5 w-3.5" />
              </div>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Faturamento por Produto
              </span>
            </div>
            {intel.productList.map((p, idx) => {
              const pct = intel.totalRev > 0 ? (p.revenue / intel.totalRev) * 100 : 0;
              return (
                <Row key={p.label} color={COLORS[idx % COLORS.length]} label={p.label}
                     valueText={fmtBRL(p.revenue)} pct={pct} />
              );
            })}
          </CardContent>
        </Card>

        {/* Card 3 — Vendas por Produto */}
        <Card className="bg-card border border-border relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: COLORS[2] }} />
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-7 w-7 rounded-md bg-secondary flex items-center justify-center text-muted-foreground">
                <ShoppingCart className="h-3.5 w-3.5" />
              </div>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Vendas por Produto
              </span>
            </div>
            {intel.productList.map((p, idx) => {
              const pct = intel.totalSales > 0 ? (p.sales / intel.totalSales) * 100 : 0;
              return (
                <Row key={p.label} color={COLORS[idx % COLORS.length]} label={p.label}
                     valueText={fmtNum(p.sales)} pct={pct} />
              );
            })}
          </CardContent>
        </Card>
      </div>

      {leader && (
        <div className="mt-2 text-[10px] text-muted-foreground flex items-center gap-1.5">
          <TrendingUp className="h-3 w-3 text-wr-positive" />
          Líder: <span className="font-semibold text-foreground">{leader.label}</span> ·{" "}
          {intel.totalRev > 0 ? ((leader.revenue / intel.totalRev) * 100).toFixed(1) : "0.0"}% do faturamento
        </div>
      )}
    </div>
  );
}
