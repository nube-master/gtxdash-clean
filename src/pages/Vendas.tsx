import { useMemo, useState, useEffect, useCallback } from "react";
import { DataEmptyState, useIsOperationEmpty } from "@/components/DataEmptyState";
import { getSaleDedupeKey, mergeAllSales } from "@/lib/salesMerge";
import {
  Radio, Clock, Search, Volume2, VolumeX, Copy, Check,
  ShoppingCart, DollarSign, TrendingUp, Package, Zap, Globe,
  Activity, BarChart3, Award,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { useLiveSales, type LiveSale } from "@/hooks/useLiveSales";
import { useRealSales } from "@/hooks/useRealSales";
import { useRedTrackSales } from "@/hooks/useRedTrackSales";
import { useSalesMetrics } from "@/hooks/useSalesMetrics";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useDashboardTotals } from "@/hooks/useDashboardTotals";
import { resolveProductName } from "@/lib/productNames";
import { toast } from "sonner";
import { ParityWidget } from "@/components/dashboard/ParityWidget";
import { ClickbankAuditPanel } from "@/components/dashboard/ClickbankAuditPanel";
import { ClickbankProductBreakdown } from "@/components/dashboard/ClickbankProductBreakdown";
import { RealtimeSpendWidget } from "@/components/dashboard/RealtimeSpendWidget";
import { TrackingHealthPanel } from "@/components/dashboard/TrackingHealthPanel";
import { UnknownPlatformAlert } from "@/components/dashboard/UnknownPlatformAlert";
import { SalesIntelligenceCenter } from "@/components/vendas/SalesIntelligenceCenter";

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */

const PRODUCT_MAP: Record<string, string> = {
  NDM: "NDM", NDB: "NDB", NDR: "NDR", LDG: "LDR", LDR: "LDR",
  CRT: "Core Strength", AILULA: "Core Strength",
  MO: "Memoryon", MON: "Memoryon", MEMORYON: "Memoryon",
};

function resolveProduct(sale: any): string {
  const saleStore = (sale.store || "").toUpperCase();
  const salePn = (sale.product_name || "").toUpperCase();

  // ── PRIORIDADE 1: product_name padronizado (sales_data + sync RedTrack já normalizam) ──
  if (salePn === "NDM" || salePn === "NDB" || salePn === "NDR" || salePn === "LDR" || salePn === "CRT") {
    return PRODUCT_MAP[salePn] || salePn;
  }
  if (salePn === "LDG") return "LDR";
  if (salePn === "MON" || salePn === "MO" || salePn === "MEMORYON") return "Memoryon";
  if (salePn === "CORE STRENGTH" || salePn === "CORESTRENGTH") return "Core Strength";

  // CRT / Core Strength detection (must be checked early)
  if (/CRSTRENGHT|CRSTRANGE|CORE\s*STR|\bCST\b|\bCRT\b|AILULA/i.test(saleStore) ||
      /CRSTRENGHT|CRSTRANGE|CORE\s*STR|\bCST\b|\bCRT\b|AILULA/i.test(salePn)) return "Core Strength";

  // Memoryon detection
  if (/memoryon|\bMON\b/i.test(saleStore) || /memoryon|\bMON\b/i.test(salePn)) return "Memoryon";

  const code = resolveProductName(sale.offer_name, null, "");
  if (code && PRODUCT_MAP[code]) return PRODUCT_MAP[code];

  const utm = (sale.utm_campaign || "") + " " + (sale.utm_content || "");
  // CRT in UTM
  if (/\bCRT\b|\bCST\b|AILULA/i.test(utm)) return "Core Strength";
  if (/\bMON\b|memoryon/i.test(utm)) return "Memoryon";
  if (/\bNDB\b/i.test(utm)) return "NDB";
  if (/\bNDR\b/i.test(utm)) return "NDR";
  if (/\bNDM\b/i.test(utm)) return "NDM";
  if (/\bLDG\b|\bLDR\b/i.test(utm)) return "LDR";
  if (/NEURO|\bND\b/i.test(utm)) return "NeuroDyne";

  // Offer name fallback
  const offer = sale.offer_name || "";
  if (/\bCRT\b|\bCST\b|core\s*str|ailula/i.test(offer)) return "Core Strength";
  if (/\bMON\b|memoryon|\|\s*MO\s*\|/i.test(offer)) return "Memoryon";

  if (salePn.includes("NDB")) return "NDB";
  if (salePn.includes("NDR")) return "NDR";
  if (salePn.includes("NDM")) return "NDM";
  if (salePn.includes("NEURO")) return "NeuroDyne";
  if (salePn.includes("MON") || salePn.includes("MEMORY")) return "Memoryon";
  if (salePn.includes("LDG") || salePn.includes("LEAN") || salePn.includes("LDR")) return "LDR";
  return sale.product_name || "Outros";
}

function fmtCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency", currency: "BRL",
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(value);
}

function fmtCurrencyShort(value: number) {
  if (value >= 1_000_000) return `R$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `R$${(value / 1_000).toFixed(1)}K`;
  return `R$${value.toFixed(0)}`;
}

function fmtTime(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleTimeString("pt-BR", {
      hour: "2-digit", minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
  } catch { return "--:--"; }
}

function fmtTimeFull(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleTimeString("pt-BR", {
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
  } catch { return "--:--:--"; }
}

function timeAgo(dateStr: string, now: number): string {
  const then = new Date(dateStr).getTime();
  if (then > now) {
    return new Date(dateStr).toLocaleTimeString("pt-BR", {
      timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit",
    });
  }
  const diff = now - then;
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return "agora";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `há ${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  return `há ${Math.floor(hours / 24)}d`;
}

function resolveOrigin(sale: any): string {
  const src = (sale.utm_source || "").toLowerCase();
  if (src.includes("fb") || src.includes("facebook")) return "Facebook";
  if (src.includes("ig") || src.includes("instagram")) return "Instagram";
  if (src.includes("google")) return "Google";
  if (src.includes("tiktok")) return "TikTok";
  if (src) return sale.utm_source;
  return "Outros";
}

function resolveSource(sale: any): "RedTrack" | "CartPanda" {
  return sale.store === "redtrack" || sale._source === "redtrack" ? "RedTrack" : "CartPanda";
}

function abbreviateCampaign(campaign: string): string {
  if (!campaign) return "—";
  const tagMatch = campaign.match(/\[([^\]]+)\]/);
  if (tagMatch) return `[${tagMatch[1]}]`;
  return campaign.length > 25 ? campaign.slice(0, 25) + "…" : campaign;
}

function SectionHeader({ title, icon: Icon, right }: { title: string; icon: React.ElementType; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-6 w-6 rounded-md bg-primary/10 flex items-center justify-center">
        <Icon className="h-3.5 w-3.5 text-primary" />
      </div>
      <h2 className="text-xs font-semibold uppercase tracking-widest text-foreground">{title}</h2>
      <div className="flex-1 h-[1px] bg-border" />
      {right && <span className="text-[10px] text-muted-foreground">{right}</span>}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);
  return (
    <button onClick={handleCopy} className="inline-flex items-center gap-1 group" title="Copiar">
      <span className="text-xs font-data text-muted-foreground group-hover:text-foreground transition-colors truncate max-w-[80px]">
        {text.slice(-6)}
      </span>
      {copied
        ? <Check className="h-3 w-3 text-wr-positive shrink-0" />
        : <Copy className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      }
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PRODUCT COLORS
   ═══════════════════════════════════════════════════════════════ */

const PRODUCT_COLORS: Record<string, string> = {
  NDM: "bg-primary",
  NeuroDyne: "bg-primary",
  NDR: "bg-blue-500",
  LDR: "bg-cyan-500",
  "Core Strength": "bg-rose-500",
  CRT: "bg-rose-500",
};

const ORIGIN_COLORS: Record<string, string> = {
  Facebook: "bg-blue-500",
  Instagram: "bg-pink-500",
  Google: "bg-amber-500",
  TikTok: "bg-foreground",
  Outros: "bg-muted-foreground",
};

/* ═══════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════ */

export default function Vendas() {
  const { sales: liveSales, soundEnabled, toggleSound } = useLiveSales();
  const { data: salesRaw } = useRealSales();
  const { data: redTrackSalesRaw } = useRedTrackSales();
  const { rangeKey } = useDateRange();
  const { data: skyTotals } = useDashboardTotals();
  const [now, setNow] = useState(Date.now());
  const [productFilter, setProductFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [feedLimit, setFeedLimit] = useState(50);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);

  const liveMetrics = useSalesMetrics(liveSales, now);
  const isToday = rangeKey === "today";

  const allSales = useMemo(() => {
    const merged = mergeAllSales(salesRaw || [], redTrackSalesRaw || [], { approvedOnly: false });
    const seen = new Set<string>();
    return merged.filter((sale: any) => {
      const key = getSaleDedupeKey(sale);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [salesRaw, redTrackSalesRaw]);

  const approvedSales = useMemo(() => {
    return allSales.filter((s: any) => s.status === "approved");
  }, [allSales]);

  /* ─── KPIs ─────────────────────────────────────────────────── */
  const kpis = useMemo(() => {
    // Local calculations (same method as Dashboard Overview)
    const frontApproved = approvedSales.filter((s: any) => s.event_type !== "upsell");
    const localRevenue = approvedSales.reduce((s: number, sale: any) => s + Number(sale.revenue), 0);
    const localConversions = frontApproved.length;

    // Use authoritative values from skyTotals (same source as Dashboard)
    // Dashboard uses: skyTotals?.totalRevenue ?? localRevenue
    const totalRevenue = skyTotals?.totalRevenue ?? localRevenue;
    const totalSales = skyTotals?.totalConversions ?? localConversions;
    const paidSales = frontApproved.filter((s: any) => Number(s.revenue) > 0);
    const localTicket = paidSales.length > 0 ? frontApproved.reduce((s: number, sale: any) => s + Number(sale.revenue), 0) / paidSales.length : 0;
    const avgTicket = skyTotals?.ticketMedio ?? localTicket;

    // Product breakdown — real values only; do not scale product totals.
    const productMap = new Map<string, { count: number; revenue: number }>();
    for (const sale of approvedSales) {
      const product = resolveProduct(sale);
      if (!productMap.has(product)) productMap.set(product, { count: 0, revenue: 0 });
      const p = productMap.get(product)!;
      const isUpsell = (sale as any).event_type === "upsell";
      p.count += isUpsell ? 0 : 1;
      p.revenue += Number(sale.revenue);
    }
    const productBreakdown = [...productMap.entries()]
      .map(([name, data]) => ({
        name,
        count: data.count,
        revenue: data.revenue,
        pct: totalSales > 0 ? (data.count / totalSales) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    const topProduct = productBreakdown[0]?.name || "—";

    return { totalSales, totalRevenue, avgTicket, productBreakdown, topProduct };
  }, [approvedSales, skyTotals]);

  /* ─── Revenue chart data ───────────────────────────────────── */
  const revenueChartData = useMemo(() => {
    const isHourly = rangeKey === "today" || rangeKey === "yesterday";
    const authoritativeRevenue = skyTotals?.totalRevenue ?? 0;

    if (isHourly) {
      // Group by hour
      const hourMap = new Map<number, number>();
      for (let h = 0; h < 24; h++) hourMap.set(h, 0);
      for (const sale of approvedSales) {
        try {
          const d = new Date(sale.created_at || sale.date);
          const h = parseInt(d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }));
          hourMap.set(h, (hourMap.get(h) || 0) + Number(sale.revenue));
        } catch {}
      }

      const currentHour = isToday
        ? parseInt(new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }))
        : 23;

      const rawEntries = [...hourMap.entries()].filter(([h]) => h <= currentHour);
      const rawTotal = rawEntries.reduce((s, [, v]) => s + v, 0);
      const scale = rawTotal > 0 && authoritativeRevenue > 0 ? authoritativeRevenue / rawTotal : 1;

      return rawEntries.map(([hour, revenue]) => ({
        label: `${String(hour).padStart(2, "0")}h`,
        revenue: revenue * scale,
      }));
    } else {
      // Group by day
      const dayMap = new Map<string, number>();
      for (const sale of approvedSales) {
        const dateStr = (sale.date || (sale.created_at || "").slice(0, 10));
        if (!dateStr) continue;
        dayMap.set(dateStr, (dayMap.get(dateStr) || 0) + Number(sale.revenue));
      }
      const rawEntries = [...dayMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      const rawTotal = rawEntries.reduce((s, [, v]) => s + v, 0);
      const scale = rawTotal > 0 && authoritativeRevenue > 0 ? authoritativeRevenue / rawTotal : 1;

      return rawEntries.map(([date, revenue]) => ({
        label: date.slice(5), // "03-11"
        revenue: revenue * scale,
      }));
    }
  }, [approvedSales, rangeKey, isToday, skyTotals]);

  /* ─── Velocity metrics ─────────────────────────────────────── */
  const organicLiveSales = useMemo(() => {
    return liveSales.filter(s => {
      const isManual = (s.offer_name || "").includes("[MANUAL]") || (s.product_name || "").includes("[MANUAL]");
      return !isManual;
    });
  }, [liveSales]);

  const velocityMetrics = useMemo(() => {
    const now10 = now - 10 * 60 * 1000;
    const now30 = now - 30 * 60 * 1000;
    const sales10 = organicLiveSales.filter(s => new Date(s.created_at).getTime() >= now10).length;
    const sales30 = organicLiveSales.filter(s => new Date(s.created_at).getTime() >= now30).length;
    const lastSaleAt = liveMetrics.lastSaleAt;
    const lastSaleAgo = lastSaleAt ? timeAgo(lastSaleAt.toISOString(), now) : "—";

    // Average interval between sales (organic only)
    const sorted = [...organicLiveSales]
      .map(s => new Date(s.created_at).getTime())
      .filter(t => t <= now)
      .sort((a, b) => b - a);
    let avgInterval = "—";
    if (sorted.length > 1) {
      const intervals: number[] = [];
      for (let i = 0; i < Math.min(sorted.length - 1, 20); i++) {
        intervals.push(sorted[i] - sorted[i + 1]);
      }
      const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const avgMin = Math.round(avgMs / 60_000);
      avgInterval = avgMin < 60 ? `${avgMin}min` : `${(avgMin / 60).toFixed(1)}h`;
    }

    return { sales10, sales30, lastSaleAgo, avgInterval };
  }, [organicLiveSales, liveMetrics, now]);

  /* ─── Product filter options ───────────────────────────────── */
  const productOptions = useMemo(() => {
    const products = new Set<string>();
    for (const s of liveSales) products.add(resolveProduct(s));
    for (const s of allSales) products.add(resolveProduct(s));
    return [...products].sort();
  }, [liveSales, allSales]);

  /* ─── Filtered feed ────────────────────────────────────────── */
  const filteredFeed = useMemo(() => {
    // Exclude [MANUAL] reconciliation entries from the live feed — they clutter the view
    let items = liveSales.filter(s => {
      const isManual = (s.offer_name || "").includes("[MANUAL]") ||
                       (s.product_name || "").includes("[MANUAL]");
      return !isManual;
    });
    if (productFilter !== "all") items = items.filter(s => resolveProduct(s) === productFilter);
    if (sourceFilter !== "all") items = items.filter(s => resolveSource(s) === sourceFilter);
    return items.slice(0, feedLimit);
  }, [liveSales, productFilter, sourceFilter, feedLimit]);

  /* ─── Filtered table ───────────────────────────────────────── */
  const filteredTable = useMemo(() => {
    let items = allSales.filter((s: any) => s.status === "approved");
    if (productFilter !== "all") items = items.filter(s => resolveProduct(s) === productFilter);
    if (sourceFilter !== "all") items = items.filter(s => resolveSource(s) === sourceFilter);
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      items = items.filter((s: any) =>
        (s.utm_campaign || "").toLowerCase().includes(q) ||
        (s.order_id || "").toLowerCase().includes(q)
      );
    }
    return items.sort((a: any, b: any) =>
      new Date(b.created_at || b.date).getTime() - new Date(a.created_at || a.date).getTime()
    );
  }, [allSales, productFilter, sourceFilter, searchText]);

  const DATE_RANGE_LABELS: Record<string, string> = {
    today: "Hoje", yesterday: "Ontem", "7": "7 dias",
    "14": "14 dias", "30": "30 dias", custom: "Personalizado",
    this_month: "Mês atual", last_month: "Mês passado",
  };
  const periodLabel = DATE_RANGE_LABELS[rangeKey] || "Período";

  const totalRevenueVendas = approvedSales.reduce((s: number, sale: any) => s + Number(sale.revenue), 0);
  const isOperationEmpty = useIsOperationEmpty(skyTotals?.totalSpend ?? 0, totalRevenueVendas, approvedSales.length);

  if (isOperationEmpty) {
    return (
      <div className="full-width-page space-y-6 w-full">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Central de Vendas</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Monitoramento de receita • {periodLabel}</p>
        </div>
        <DataEmptyState />
      </div>
    );
  }

  return (
    <div className="full-width-page space-y-6 w-full">
      {/* ══════════════════════════════════════════════════════════
          HEADER
          ══════════════════════════════════════════════════════════ */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Central de Vendas</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Monitoramento de receita em tempo real • {periodLabel}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={productFilter} onValueChange={setProductFilter}>
            <SelectTrigger className="h-8 w-[130px] text-xs border-border bg-secondary/50">
              <SelectValue placeholder="Produto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Todos</SelectItem>
              {productOptions.map(p => (
                <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="h-8 w-[120px] text-xs border-border bg-secondary/50">
              <SelectValue placeholder="Tracker" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Todos</SelectItem>
              <SelectItem value="CartPanda" className="text-xs">CartPanda</SelectItem>
              <SelectItem value="RedTrack" className="text-xs">RedTrack</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleSound}>
            {soundEnabled
              ? <Volume2 className="h-4 w-4 text-primary" />
              : <VolumeX className="h-4 w-4 text-muted-foreground" />
            }
          </Button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          ⚠️ ALERTA DE TAGS MAL CONFIGURADAS NO REDTRACK
          ══════════════════════════════════════════════════════════ */}
      <UnknownPlatformAlert sales={approvedSales as any} />

      {/* ══════════════════════════════════════════════════════════
          🌐 CENTRAL DE INTELIGÊNCIA DE VENDAS — Geo, device, rede, tempo
          ══════════════════════════════════════════════════════════ */}
      <SalesIntelligenceCenter sales={approvedSales as any} />

      {/* ══════════════════════════════════════════════════════════
          1️⃣ KPIs PRINCIPAIS — 4 cards
          ══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3">
        <Card className="bg-card border border-border">
          <CardContent className="px-5 py-4">
            <div className="flex items-center gap-2 mb-1">
              <ShoppingCart className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Vendas</p>
            </div>
            <p className="text-3xl font-bold font-data leading-tight">{kpis.totalSales}</p>
          </CardContent>
        </Card>

        <Card className="bg-card border border-border">
          <CardContent className="px-5 py-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-3.5 w-3.5 text-wr-positive" />
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Faturamento</p>
            </div>
            <p className="text-3xl font-bold font-data text-wr-positive leading-tight">{fmtCurrency(kpis.totalRevenue)}</p>
          </CardContent>
        </Card>

        <Card className="bg-card border border-border">
          <CardContent className="px-5 py-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">AOV</p>
            </div>
            <p className="text-3xl font-bold font-data leading-tight">{fmtCurrency(kpis.avgTicket)}</p>
          </CardContent>
        </Card>

        <Card className="bg-card border border-border">
          <CardContent className="px-5 py-4">
            <div className="flex items-center gap-2 mb-1">
              <Award className="h-3.5 w-3.5 text-primary" />
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Produto Líder</p>
            </div>
            <p className="text-2xl font-bold font-data leading-tight">{kpis.topProduct}</p>
            {kpis.productBreakdown[0] && (
              <p className="text-[10px] text-muted-foreground mt-1">
                {kpis.productBreakdown[0].count} vendas • {fmtCurrencyShort(kpis.productBreakdown[0].revenue)}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ══════════════════════════════════════════════════════════
          2️⃣ GRÁFICO DE FATURAMENTO
          ══════════════════════════════════════════════════════════ */}
      <Card className="bg-card border border-border">
        <CardContent className="p-5">
          <SectionHeader
            title={isToday || rangeKey === "yesterday" ? "Faturamento por Hora" : "Faturamento por Dia"}
            icon={BarChart3}
          />
          <div className="mt-4 h-[220px]">
            {revenueChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueChartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => fmtCurrencyShort(v)}
                    width={60}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(value: number) => [fmtCurrency(value), "Faturamento"]}
                    labelStyle={{ color: "hsl(var(--muted-foreground))" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#revenueGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                Sem dados para o período
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ══════════════════════════════════════════════════════════
          3️⃣ VENDAS POR PRODUTO + 4️⃣ VELOCIDADE — Side by Side
          ══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Vendas por Produto */}
        <Card className="bg-card border border-border">
          <CardContent className="p-5">
            <SectionHeader title="Vendas por Produto" icon={Package} />
            <div className="mt-4 space-y-3">
              {kpis.productBreakdown.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sem dados</p>
              ) : (
                kpis.productBreakdown.map((p) => {
                  const barColor = PRODUCT_COLORS[p.name] || "bg-muted-foreground";
                  return (
                    <div key={p.name} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">{p.name}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-data font-semibold">{p.count} vendas</span>
                          <span className="text-[10px] font-data text-muted-foreground">{fmtCurrency(p.revenue)}</span>
                        </div>
                      </div>
                      <div className="h-2 bg-secondary/30 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${barColor}`}
                          style={{ width: `${Math.max(p.pct, 3)}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>

        {/* Velocidade de Vendas */}
        <Card className="bg-card border border-border">
          <CardContent className="p-5">
            <SectionHeader title="Velocidade de Vendas" icon={Zap} />
            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Últimos 10 min</span>
                <span className="text-lg font-bold font-data">
                  {velocityMetrics.sales10}
                  <span className="text-xs font-normal text-muted-foreground ml-1">vendas</span>
                </span>
              </div>
              <div className="h-[1px] bg-border" />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Últimos 30 min</span>
                <span className="text-lg font-bold font-data">
                  {velocityMetrics.sales30}
                  <span className="text-xs font-normal text-muted-foreground ml-1">vendas</span>
                </span>
              </div>
              <div className="h-[1px] bg-border" />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Última venda</span>
                <span className="text-lg font-bold font-data">{velocityMetrics.lastSaleAgo}</span>
              </div>
              <div className="h-[1px] bg-border" />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Intervalo médio</span>
                <span className="text-lg font-bold font-data">{velocityMetrics.avgInterval}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ══════════════════════════════════════════════════════════
          5️⃣ FEED DE VENDAS EM TEMPO REAL
          ══════════════════════════════════════════════════════════ */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Radio className="h-3 w-3 text-wr-positive animate-pulse" />
            <h2 className="text-xs font-semibold uppercase tracking-widest text-foreground">Vendas Live</h2>
          </div>
          <div className="flex-1 h-[1px] bg-border" />
          <Badge variant="outline" className="text-[10px] font-data">{liveSales.length} vendas</Badge>
        </div>

        <Card className="bg-card border border-border">
          <CardContent className="p-0">
            <div className="max-h-[360px] overflow-y-auto divide-y divide-border/50">
              {filteredFeed.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  Nenhuma venda encontrada
                </div>
              ) : (
                filteredFeed.map((sale) => (
                  <EventRow key={sale.id} sale={sale} now={now} />
                ))
              )}
            </div>
            {feedLimit < liveSales.length && filteredFeed.length >= feedLimit && (
              <button
                onClick={() => setFeedLimit(prev => prev + 50)}
                className="w-full py-2.5 text-xs text-muted-foreground hover:text-foreground transition-colors border-t border-border"
              >
                Carregar mais vendas...
              </button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ══════════════════════════════════════════════════════════
          6️⃣ TABELA DE VENDAS
          ══════════════════════════════════════════════════════════ */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <SectionHeader title="Tabela de Vendas" icon={Activity} right={`${filteredTable.length} registros`} />
        </div>
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1 max-w-[280px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              placeholder="Buscar campanha ou Order ID..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="h-8 pl-8 text-xs border-border bg-secondary/50"
            />
          </div>
        </div>

        <Card className="bg-card border border-border">
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium w-[70px]">Hora</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium w-[100px]">Order ID</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Produto</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-right">Valor</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Campanha</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-center">Fonte</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-center">Tracker</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTable.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-8">
                        Nenhuma venda encontrada
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredTable.slice(0, 200).map((sale: any) => {
                      const source = resolveSource(sale);
                      return (
                        <TableRow key={sale.id} className="border-border">
                          <TableCell className="text-xs font-data">{fmtTimeFull(sale.created_at || sale.date)}</TableCell>
                          <TableCell><CopyButton text={sale.order_id || sale.id} /></TableCell>
                          <TableCell className="text-xs font-medium">{resolveProduct(sale)}</TableCell>
                          <TableCell className="text-xs font-data text-right text-wr-positive font-semibold">{fmtCurrency(Number(sale.revenue))}</TableCell>
                          <TableCell>
                            <TooltipProvider>
                              <UITooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-xs text-muted-foreground cursor-default truncate block max-w-[180px]">
                                    {abbreviateCampaign(sale.utm_campaign || "")}
                                  </span>
                                </TooltipTrigger>
                                {sale.utm_campaign && (
                                  <TooltipContent side="top" className="max-w-[300px] text-xs">
                                    {sale.utm_campaign}
                                  </TooltipContent>
                                )}
                              </UITooltip>
                            </TooltipProvider>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="text-[10px] text-muted-foreground">{resolveOrigin(sale)}</span>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant="outline"
                              className={`text-[8px] px-1.5 py-0 ${
                                source === "RedTrack"
                                  ? "border-blue-400/30 text-blue-400 bg-blue-400/5"
                                  : "border-emerald-400/30 text-emerald-400 bg-emerald-400/5"
                              }`}
                            >
                              {source}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ══════════════════════════════════════════════════════════
          7️⃣ AUDITORIA — Não alterado
          ══════════════════════════════════════════════════════════ */}
      <ClickbankProductBreakdown />
      <RealtimeSpendWidget />
      <ParityWidget />
      <ClickbankAuditPanel />
      <TrackingHealthPanel />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   EVENT ROW — Feed de vendas estilo log
   ═══════════════════════════════════════════════════════════════ */

function EventRow({ sale, now }: { sale: LiveSale; now: number }) {
  const product = resolveProduct(sale);
  const origin = resolveOrigin(sale);
  const source = resolveSource(sale);

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors">
      <span className="text-[10px] font-data text-muted-foreground shrink-0 w-[44px] tabular-nums">
        {fmtTime(sale.created_at)}
      </span>
      <div className="h-1.5 w-1.5 rounded-full bg-wr-positive shrink-0" />
      <span className="text-xs font-medium text-foreground shrink-0 w-[80px] truncate">{product}</span>
      <span className="text-xs font-bold font-data text-wr-positive shrink-0 w-[90px] text-right tabular-nums">
        {fmtCurrency(sale.revenue)}
      </span>
      <span className="text-[10px] text-muted-foreground shrink-0 w-[60px] truncate">{origin}</span>
      <Badge
        variant="outline"
        className={`text-[8px] px-1.5 py-0 shrink-0 ${
          source === "RedTrack"
            ? "border-blue-400/30 text-blue-400 bg-blue-400/5"
            : "border-emerald-400/30 text-emerald-400 bg-emerald-400/5"
        }`}
      >
        {source}
      </Badge>
      <span className="text-[9px] text-muted-foreground/60 shrink-0 ml-auto tabular-nums">
        {timeAgo(sale.created_at, now)}
      </span>
    </div>
  );
}
