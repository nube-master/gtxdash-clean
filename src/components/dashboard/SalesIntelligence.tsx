import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Store, Package, DollarSign, TrendingUp, TrendingDown, Crown, ShoppingCart } from "lucide-react";
import { resolveProductName } from "@/lib/productNames";


import type { TierBreakdownRow } from "@/hooks/useClickbankTierBreakdown";

export interface CbAuditExtraSale {
  date: string;
  vendor: string;
  amount_brl: number;
  item_name: string | null;
  quantity: number | null;
}

interface SalesIntelligenceProps {
  sales: any[];
  prevSales: any[];
  /** Authoritative revenue from skyTotals — overrides client-side sum to avoid double-counting */
  authoritativeRevenue?: number;
  /** Authoritative conversions from skyTotals */
  authoritativeConversions?: number;
  /** Aggregated ClickBank tier breakdown from audit table (neurodyne only, backward compat) */
  auditTierBreakdown?: TierBreakdownRow[];
  /** Full tier breakdown by project code (NDM, CRT, LDR) */
  auditByProject?: Record<string, TierBreakdownRow[]>;
  /** Non-NeuroDyne CB audit sales (e.g. unknown vendors) for project/product breakdown */
  cbAuditExtraSales?: CbAuditExtraSale[];
}

function fmt(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 }).format(value);
}

function fmtNum(value: number) {
  return new Intl.NumberFormat("pt-BR").format(Math.round(value));
}

/* ── Resolve product to brand name ── */
const BRAND_MAP: Record<string, string> = {
  NDM: "NeuroDyne",
  NDR: "NeuroDyne",
  LDR: "LDR",
  CRT: "Core Strength",
  MON: "Memoryon",
  NDB: "NeuroDyne",
};

function resolveBrand(sale: any): string {
  const saleStore = (sale.store || "").toUpperCase();
  const salePn = (sale.product_name || "").toUpperCase();
  const offer = sale.offer_name || "";

  // ── PRIORIDADE 1: product_name padronizado (sales_data + sync RedTrack já vêm normalizados) ──
  if (salePn === "NDM" || salePn === "NDB" || salePn === "NDR" || salePn === "NEURODYNE") return "NeuroDyne";
  if (salePn === "LDR" || salePn === "LDG") return "LDR";
  if (salePn === "CRT" || salePn === "CORE STRENGTH") return "Core Strength";
  if (salePn === "MO" || salePn === "MON" || salePn === "MEMORYON") return "Memoryon";

  // CoreStrength / CRT detection
  if (/crstrenght|crstrange|core\s*str|\bCST\b|\bCRT\b|ailula/i.test(saleStore) || /crstrenght|crstrange|core\s*str|\bCST\b|\bCRT\b|ailula/i.test(salePn) || /\bCRT\b|\bCST\b|ailula/i.test(offer)) return "Core Strength";

  // Manual/reconciliation sales from ClickBank → NeuroDyne
  if (/\[MANUAL\]/i.test(offer) && /paridade|clickbank|CB/i.test(offer)) return "NeuroDyne";

  // Try resolveProductName first (uses offer_name from RedTrack)
  const code = resolveProductName(sale.offer_name, null, "");
  if (code && BRAND_MAP[code]) return BRAND_MAP[code];

  // Fallback: detect from utm_campaign
  const utm = sale.utm_campaign || "";
  if (/NDR/i.test(utm)) return "NeuroDyne";
  if (/NDM|NEURO|NDB|ND\b/i.test(utm)) return "NeuroDyne";
  if (/LDG|LDR/i.test(utm)) return "LDR";

  // Fallback: detect from product_name (substring)
  if (salePn.includes("NEURO") || salePn.includes("NDM") || salePn.includes("NDB")) return "NeuroDyne";
  if (salePn.includes("NDR")) return "NeuroDyne";
  if (salePn.includes("LDG") || salePn.includes("LEAN") || salePn.includes("LDR")) return "LDR";

  // Fallback: store
  if (saleStore.includes("NDM") || saleStore.includes("NDN") || saleStore.includes("NDB") || saleStore.includes("NEURO")) return "NeuroDyne";
  if (saleStore.includes("NDR")) return "NeuroDyne";
  if (saleStore.includes("LDG") || saleStore.includes("LDR")) return "LDR";

  return sale.product_name || "Outros";
}


/* ── Project detection from utm_campaign ── */
const PROJECT_TAGS = [
  { key: "CRT", match: (c: string) => /\bCRT\b|core\s*str/i.test(c) },
  { key: "MO", match: (c: string) => /\bMO\b|\bMON\b|memoryon/i.test(c) },
  { key: "LDR", match: (c: string) => /LDG|LDR/i.test(c) },
  { key: "NDM", match: (c: string) => /NDM|NEURO|NDB/i.test(c) },
  { key: "NDR", match: (c: string) => /NDR/i.test(c) },
  { key: "PP", match: (c: string) => /\[PP\]|\bPP\b|telemed/i.test(c) },
];

const PROJECT_COLORS: Record<string, string> = {
  CRT: "hsl(340, 75%, 55%)",
  LDR: "hsl(185, 80%, 45%)",
  NDM: "hsl(38, 92%, 50%)",
  NDR: "hsl(210, 80%, 55%)",
  MON: "hsl(160, 70%, 45%)",
  PP: "hsl(190, 85%, 50%)",
  OUTROS: "hsl(220, 10%, 50%)",
};

function isRtDerivedClickbankSale(sale: any): boolean {
  // Only RT-derived rows that point to ClickBank should be discarded.
  // RT-derived rows for CartPanda/BuyGoods are legitimate official sales.
  const orderId = String(sale?.order_id || "").toLowerCase();
  if (!orderId.startsWith("rt:")) return false;
  const store = String(sale?.store || "").toLowerCase();
  return store === "clickbank" || store === "clickbank_ref" || store === "" || store.includes("clickbank");
}

function getTodaySP(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

// Vendas TeleMed agora SOMAM nos KPIs gerais (descarte removido).
// Identificação por offer_name contendo "telemed" segue disponível para
// a aba dedicada Analytics > TeleMed via funnel_projects (código PP).
function isTelemedSale(_sale: any): boolean {
  return false;
}

function detectProject(sale: any): string {
  const saleStore = (sale.store || "").toUpperCase();
  const salePn = (sale.product_name || "").toUpperCase();

  // ── PRIORIDADE 1: product_name padronizado (sales_data + sync RedTrack já normalizam) ──
  if (salePn === "NDM" || salePn === "NDB" || salePn === "NDR" || salePn === "LDR" || salePn === "CRT" || salePn === "MO" || salePn === "PP") return salePn;
  if (salePn === "MON") return "MO";
  if (salePn === "LDG") return "LDR";
  if (salePn === "NEURODYNE") return "NDM";
  if (salePn === "CORE STRENGTH") return "CRT";
  if (salePn === "MEMORYON") return "MO";
  if (salePn === "TELEMED" || /telemed|semaglutide|tirzepatide|glp-?1/i.test(salePn)) return "PP";

  // CoreStrength / CRT detection via store/product_name
  if (/CRSTRENGHT|CRSTRANGE|CORE\s*STR|\bCST\b|\bCRT\b|AILULA/i.test(saleStore) || /CRSTRENGHT|CRSTRANGE|CORE\s*STR|\bCST\b|\bCRT\b|AILULA/i.test(salePn)) return "CRT";

  // Manual/reconciliation sales from ClickBank → NDM
  const offer = sale.offer_name || "";
  if (/\[MANUAL\]/i.test(offer) && /paridade|clickbank|CB/i.test(offer)) return "NDM";

  const utm = sale.utm_campaign || "";
  if (utm) {
    for (const tag of PROJECT_TAGS) {
      if (tag.match(utm)) return tag.key;
    }
  }
  // Fallback: detect from offer_name (RedTrack)
  if (offer) {
    if (/telemed|semaglutide|tirzepatide|glp-?1/i.test(offer)) return "PP";
    if (/\bCRT\b|core\s*str/i.test(offer)) return "CRT";
    if (/\bMO\b|\bMON\b|memoryon/i.test(offer)) return "MO";
    if (/NDR/i.test(offer)) return "NDR";
    if (/NDM|NEURO|NDB/i.test(offer)) return "NDM";
    if (/LDG|LDR/i.test(offer)) return "LDR";
  }
  // Fallback: detect from product_name
  if (salePn) {
    if (/telemed|semaglutide|tirzepatide|glp-?1/i.test(salePn)) return "PP";
    if (/\bMO\b|\bMON\b|MEMORYON/i.test(salePn)) return "MO";
    if (/NDR/i.test(salePn)) return "NDR";
    if (/NDM|NEURO|NDB/i.test(salePn)) return "NDM";
    if (/LDG|LDR|LEAN/i.test(salePn)) return "LDR";
  }
  // Fallback: detect from store name
  if (saleStore) {
    if (saleStore.includes("NDM") || saleStore.includes("NDN") || saleStore.includes("NDB") || saleStore.includes("NEURO")) return "NDM";
    if (saleStore.includes("NDR")) return "NDR";
    if (saleStore.includes("LDG") || saleStore.includes("LDR")) return "LDR";
    if (saleStore.includes("CLICKBANK")) return "NDM";
  }
  return "OUTROS";
}

/* ── Mini circular progress indicator ── */
function MiniProgress({ pct, color }: { pct: number; color: string }) {
  const radius = 9;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - pct / 100);
  return (
    <svg width="22" height="22" className="shrink-0">
      <circle cx="11" cy="11" r={radius} fill="none" stroke="hsl(220, 10%, 18%)" strokeWidth="2.5" />
      <circle
        cx="11" cy="11" r={radius} fill="none"
        stroke={color} strokeWidth="2.5"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        transform="rotate(-90 11 11)"
      />
    </svg>
  );
}

function VariationBadge({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) return <span className="text-[10px] text-muted-foreground">—</span>;
  const pct = previous !== 0 ? ((current - previous) / Math.abs(previous)) * 100 : current > 0 ? 100 : 0;
  const isUp = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${isUp ? "text-wr-positive" : "text-destructive"}`}>
      {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {isUp ? "+" : ""}{pct.toFixed(1)}%
    </span>
  );
}

export function SalesIntelligence({ sales, prevSales, authoritativeRevenue, authoritativeConversions, auditTierBreakdown, auditByProject, cbAuditExtraSales }: SalesIntelligenceProps) {
  const intel = useMemo(() => {
    const approved = sales.filter((s: any) => s.status === "approved" && !isTelemedSale(s) && !isRtDerivedClickbankSale(s));
    const prevApproved = prevSales.filter((s: any) => s.status === "approved" && !isTelemedSale(s) && !isRtDerivedClickbankSale(s));
    const hasExtraAudit = cbAuditExtraSales && cbAuditExtraSales.length > 0;
    if (approved.length === 0 && !hasExtraAudit) return null;

    const rawRevenue = approved.reduce((sum: number, s: any) => sum + Number(s.revenue), 0);
    const frontOnly = approved.filter((s: any) => s.event_type !== "upsell");
    const rawQty = frontOnly.length;

    // Use authoritative values from skyTotals for the header totals only.
    // Project/product breakdowns must stay at the real sale amounts from their own sources;
    // scaling them to match the global total inflates products like MO/CartPanda.
    const totalRevenue = authoritativeRevenue ?? rawRevenue;
    const totalQty = authoritativeConversions ?? rawQty;

    // --- Project breakdown ---
    const projectMap = new Map<string, { revenue: number; qty: number }>();
    // Projects handled by audit data (auditByProject) — skip from RedTrack to avoid double-counting
    const auditProjectKeys = new Set<string>();
    if (auditByProject) {
      for (const [proj, tiers] of Object.entries(auditByProject)) {
        auditProjectKeys.add(proj);
        const totalBrl = tiers.reduce((s, t) => s + t.totalBrl, 0);
        const totalCount = tiers.reduce((s, t) => s + t.count, 0);
        if (totalCount > 0) {
          projectMap.set(proj, { revenue: totalBrl, qty: totalCount });
        }
      }
    }
    // Fallback: also handle cbAuditExtraSales for unknown vendors
    if (cbAuditExtraSales && cbAuditExtraSales.length > 0) {
      for (const cb of cbAuditExtraSales) {
        const proj = "OUTROS";
        auditProjectKeys.add(proj);
        const existing = projectMap.get(proj) || { revenue: 0, qty: 0 };
        projectMap.set(proj, { revenue: existing.revenue + cb.amount_brl, qty: existing.qty + 1 });
      }
    }
    for (const s of approved) {
      const proj = detectProject(s);
      // Skip projects that are sourced from audit data to avoid double-counting
      if (auditProjectKeys.has(proj)) continue;
      const existing = projectMap.get(proj) || { revenue: 0, qty: 0 };
      const isUpsell = (s as any).event_type === "upsell";
      projectMap.set(proj, { revenue: existing.revenue + Number(s.revenue), qty: existing.qty + (isUpsell ? 0 : 1) });
    }

    const prevProjectMap = new Map<string, { revenue: number }>();
    for (const s of prevApproved) {
      const proj = detectProject(s);
      const existing = prevProjectMap.get(proj) || { revenue: 0 };
      prevProjectMap.set(proj, { revenue: existing.revenue + Number(s.revenue) });
    }
    const projects = Array.from(projectMap.entries())
      .map(([name, data]) => {
        return {
          name,
          revenue: data.revenue,
          qty: data.qty,
          sharePct: totalRevenue > 0 ? (data.revenue / totalRevenue) * 100 : 0,
          prevRevenue: prevProjectMap.get(name)?.revenue || 0,
          color: PROJECT_COLORS[name] || PROJECT_COLORS.OUTROS,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);

    // --- Product breakdown using authoritative audit data when available ---
    const productMap = new Map<string, { revenue: number; qty: number }>();

    // Projects with audit data → use tier breakdown (more accurate than RedTrack)
    const PRODUCT_LABELS: Record<string, Record<number, string>> = {
      NDM: { 6: "NeuroDyne 6 Bottles", 3: "NeuroDyne 3 Bottles", 2: "NeuroDyne 2 Bottles" },
      LDR: { 6: "LeanDrops 6 Bottles", 3: "LeanDrops 3 Bottles", 2: "LeanDrops 2 Bottles" },
      CRT: { 6: "CoreStrength 6 Bottles", 3: "CoreStrength 3 Bottles", 2: "CoreStrength 2 Bottles" },
    };

    const auditHandledBrands = new Set<string>();

    if (auditByProject) {
      for (const [proj, tiers] of Object.entries(auditByProject)) {
        const labels = PRODUCT_LABELS[proj];
        if (!labels) continue;
        const hasTiers = tiers.some(t => t.count > 0);
        if (!hasTiers) continue;

        auditHandledBrands.add(proj === "NDM" ? "NeuroDyne" : proj === "CRT" ? "Core Strength" : "LDR");

        for (const tier of tiers) {
          const qty = tier.quantity;
          if (qty !== 2 && qty !== 3 && qty !== 6) continue;
          const label = labels[qty!] || `${proj} ${qty} Bottles`;
          const existing = productMap.get(label) || { revenue: 0, qty: 0 };
          productMap.set(label, {
            revenue: existing.revenue + tier.totalBrl,
            qty: existing.qty + tier.count,
          });
        }
      }
    }

    // Fallback: use auditTierBreakdown for NeuroDyne if auditByProject not available
    if (!auditHandledBrands.has("NeuroDyne") && auditTierBreakdown && auditTierBreakdown.length > 0) {
      auditHandledBrands.add("NeuroDyne");
      for (const tier of auditTierBreakdown) {
        const qty = tier.quantity;
        if (qty !== 2 && qty !== 3 && qty !== 6) continue;
        let label: string;
        if (qty === 6) label = "NeuroDyne 6 Bottles";
        else if (qty === 3) label = "NeuroDyne 3 Bottles";
        else label = "NeuroDyne 2 Bottles";
        const existing = productMap.get(label) || { revenue: 0, qty: 0 };
        productMap.set(label, {
          revenue: existing.revenue + tier.totalBrl,
          qty: existing.qty + tier.count,
        });
      }
    }

    // Non-audit products: use per-event detection from RedTrack
    for (const s of approved) {
      const brand = resolveBrand(s);
      if (auditHandledBrands.has(brand)) continue; // handled by audit data
      const existing = productMap.get(brand) || { revenue: 0, qty: 0 };
      const isUpsell = (s as any).event_type === "upsell";
      productMap.set(brand, { revenue: existing.revenue + Number(s.revenue), qty: existing.qty + (isUpsell ? 0 : 1) });
    }

    // Unknown vendor CB audit sales
    if (hasExtraAudit) {
      for (const cb of cbAuditExtraSales!) {
        const label = cb.vendor || "Outros";
        const existing = productMap.get(label) || { revenue: 0, qty: 0 };
        productMap.set(label, { revenue: existing.revenue + cb.amount_brl, qty: existing.qty + 1 });
      }
    }

    // Products from clickbank_audit (auditHandledBrands) and unknown CB vendors (hasExtraAudit)
    // already carry absolute BRL — never scale them.
    // Products coming from sales_data (e.g. MO/CartPanda, NewsBreak) also carry absolute BRL
    // (they were ingested with real revenue). Applying revenueScale to them would inflate
    // the per-product slice when the authoritative total includes ClickBank rows that are
    // outside sales_data. Therefore: products are always shown at their absolute value.
    const productsByRevenue = Array.from(productMap.entries())
      .map(([name, data]) => ({
        name,
        revenue: data.revenue,
        qty: data.qty,
        revSharePct: totalRevenue > 0 ? (data.revenue / totalRevenue) * 100 : 0,
        qtySharePct: totalQty > 0 ? (data.qty / totalQty) * 100 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    const productsByQty = [...productsByRevenue].sort((a, b) => b.qty - a.qty);

    return { projects, productsByRevenue, productsByQty, totalRevenue, totalQty };
  }, [sales, prevSales, authoritativeRevenue, authoritativeConversions, auditTierBreakdown, auditByProject, cbAuditExtraSales]);

  if (!intel) return null;

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Inteligência de Vendas</h2>
        <div className="flex-1 h-[1px]" style={{ background: "rgba(255,30,30,0.15)" }} />
      </div>
      <p className="text-[10px] text-muted-foreground mb-3 -mt-1">Análise consolidada por projeto e produto — período selecionado</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Card 1 — Faturamento por Projeto */}
        <Card className="bg-card border border-border relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: "hsl(0, 100%, 56%)" }} />
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-7 w-7 rounded-md bg-secondary flex items-center justify-center text-muted-foreground">
                <Store className="h-3.5 w-3.5" />
              </div>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Faturamento por Projeto</span>
            </div>
            <div className="space-y-3">
              {intel.projects.map((p) => (
                <div key={p.name} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-2 w-2 rounded-full shrink-0" style={{ background: p.color }} />
                    <span className="text-xs text-foreground font-medium truncate">{p.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-data font-semibold text-foreground">{fmt(p.revenue)}</span>
                    <MiniProgress pct={p.sharePct} color={p.color} />
                    <span className="text-[10px] font-data text-muted-foreground w-[40px] text-right">{p.sharePct.toFixed(1)}%</span>
                  </div>
                </div>
              ))}
            </div>
            {/* Variation for leader */}
            {intel.projects.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border flex items-center gap-2">
                <Crown className="h-3 w-3 text-primary" />
                <span className="text-[10px] text-muted-foreground">Líder:</span>
                <span className="text-[10px] font-semibold text-foreground">{intel.projects[0].name}</span>
                <VariationBadge current={intel.projects[0].revenue} previous={intel.projects[0].prevRevenue} />
                <span className="text-[9px] text-muted-foreground">vs anterior</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card 2 — Faturamento por Produto */}
        <Card className="bg-card border border-border relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: "hsl(0, 100%, 56%)" }} />
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-7 w-7 rounded-md bg-secondary flex items-center justify-center text-muted-foreground">
                <DollarSign className="h-3.5 w-3.5" />
              </div>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Faturamento por Produto</span>
            </div>
            <div className="space-y-3">
              {intel.productsByRevenue.map((p, i) => (
                <div key={p.name} className="flex items-center justify-between gap-2">
                  <span className="text-xs text-foreground truncate min-w-0">{p.name || "Sem nome"}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-data font-semibold text-foreground">{fmt(p.revenue)}</span>
                    <MiniProgress pct={p.revSharePct} color="hsl(0, 100%, 56%)" />
                    <span className="text-[10px] font-data text-muted-foreground w-[40px] text-right">{p.revSharePct.toFixed(1)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Card 3 — Vendas por Produto */}
        <Card className="bg-card border border-border relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: "hsl(0, 100%, 56%)" }} />
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-7 w-7 rounded-md bg-secondary flex items-center justify-center text-muted-foreground">
                <ShoppingCart className="h-3.5 w-3.5" />
              </div>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Vendas por Produto</span>
            </div>
            <div className="space-y-3">
              {intel.productsByQty.map((p) => (
                <div key={p.name} className="flex items-center justify-between gap-2">
                  <span className="text-xs text-foreground truncate min-w-0">{p.name || "Sem nome"}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-data font-semibold text-foreground">{fmtNum(p.qty)}</span>
                    <MiniProgress pct={p.qtySharePct} color="hsl(0, 100%, 56%)" />
                    <span className="text-[10px] font-data text-muted-foreground w-[40px] text-right">{p.qtySharePct.toFixed(1)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
