import { useMemo, useState, useEffect, useRef } from "react";
import { DataEmptyState, useIsOperationEmpty } from "@/components/DataEmptyState";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine, Line, ComposedChart } from "recharts";
import { mergeAllSales } from "@/lib/salesMerge";
import { resolveCreativeIdWithAd } from "@/lib/creativeUtils";
import {
  ArrowUpDown, Filter, Layers, FlaskConical, TrendingUp, Rocket, Activity,
  Pause, RefreshCw, Loader2, Search, Zap, Trophy,
  Brain, Scissors, BarChart3, Flame, ChevronDown,
  TrendingDown,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MetaAdsDrillTabs, type MetaAdsTab } from "@/components/meta-ads-drill/MetaAdsDrillTabs";
import { useMetaAdsets } from "@/hooks/useMetaAdsets";
import { useMetaAds } from "@/hooks/useMetaAds";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { MetaAdsActionsMenu } from "@/components/meta-ads-drill/MetaAdsActionsMenu";

import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useTrafficData, fetchTrafficAggregated } from "@/hooks/useTrafficData";
import { useRealSales } from "@/hooks/useRealSales";
import { useRedTrackSales } from "@/hooks/useRedTrackSales";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useCampaignStatuses } from "@/hooks/useCampaignStatuses";
import { useAccountStatuses } from "@/hooks/useAccountStatuses";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getClickbankExcludeDates, getRedTrackExcludeDates } from "@/lib/salesMerge";
import { useExchangeRate } from "@/hooks/useExchangeRate";
import { useDashboardTotals } from "@/hooks/useDashboardTotals";
import { useOperationId } from "@/contexts/OperationContext";
import { useClickbankCreativeSales } from "@/hooks/useClickbankCreativeSales";
import { resolveCreativeId } from "@/lib/creativeUtils";
import { useMetaAdPagesStats } from "@/hooks/useMetaAdPagesStats";
import { toast } from "sonner";
import {
  formatCampaignName, detectStructure, structureLabels, structureColors,
  normalizeDateBrackets,
  type CampaignStructure,
} from "@/lib/formatNames";

/* ═══════════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════════ */

function fmt(value: number, type: "currency" | "number" | "percent" | "roas") {
  if (type === "currency")
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  if (type === "number") return new Intl.NumberFormat("pt-BR").format(Math.round(value));
  if (type === "percent") return `${value.toFixed(2)}%`;
  if (type === "roas") return `${value.toFixed(2)}x`;
  return String(value);
}

type SortKey = "roas" | "spend" | "revenue" | "ctr" | "conversions";
type CampaignStatus = "ACTIVE" | "PAUSED" | "MIXED";

interface CampaignRow {
  name: string;
  fullName: string;
  spend: number;
  revenue: number;
  roas: number;
  ctr: number;
  cpc: number;
  conversions: number;
  creativeSales: number;
  creativeRevenue: number;
  creativeId: string;
  status: CampaignStatus;
  structure: CampaignStructure;
  orcamento?: number;
}

type HealthStatus = "Saudável" | "Atenção" | "Crítica";

interface StructureSummary {
  structure: CampaignStructure;
  campaigns: number;
  activeSets: number;
  spend: number;
  revenue: number;
  roas: number;
  cpa: number;
  conversions: number;
  health: HealthStatus;
  spendPct: number;
  revenuePct: number;
  avgConversion: number;
}

function getHealth(roas: number, _cpa: number, conversions: number): HealthStatus {
  if (conversions === 0) return "Crítica";
  if (roas > 1.2) return "Saudável";
  if (roas >= 1) return "Atenção";
  return "Crítica";
}

const healthColors: Record<HealthStatus, string> = {
  "Saudável": "text-wr-positive border-wr-positive/30 bg-wr-positive/5",
  "Atenção": "text-amber-400 border-amber-400/30 bg-amber-400/5",
  "Crítica": "text-destructive border-destructive/30 bg-destructive/5",
};

function useStructureData(rows: CampaignRow[]): StructureSummary[] {
  return useMemo(() => {
    const totalSpend = rows.reduce((s, r) => s + r.spend, 0);
    const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
    const map = new Map<CampaignStructure, { activeCampaigns: Set<string>; activeSets: number; spend: number; revenue: number; conversions: number }>();
    for (const r of rows) {
      if (!map.has(r.structure)) map.set(r.structure, { activeCampaigns: new Set(), activeSets: 0, spend: 0, revenue: 0, conversions: 0 });
      const s = map.get(r.structure)!;
      if (r.status === "ACTIVE" || r.status === "MIXED") {
        s.activeCampaigns.add(r.fullName);
        s.activeSets++;
      }
      s.spend += r.spend;
      s.revenue += r.revenue;
      s.conversions += r.conversions;
    }
    return (["TESTE", "PRÉ ESCALA", "ESCALA", "OUTRO"] as CampaignStructure[])
      .map((key) => {
        const d = map.get(key);
        if (!d) return null;
        const campaignCount = d.activeCampaigns.size;
        if (campaignCount === 0) return null;
        const roas = d.spend > 0 ? d.revenue / d.spend : 0;
        const cpa = d.conversions > 0 ? d.spend / d.conversions : 0;
        const avgConversion = campaignCount > 0 ? d.conversions / campaignCount : 0;
        return {
          structure: key, campaigns: campaignCount, activeSets: d.activeSets,
          spend: d.spend, revenue: d.revenue, roas, cpa, conversions: d.conversions,
          health: getHealth(roas, cpa, d.conversions),
          spendPct: totalSpend > 0 ? (d.spend / totalSpend) * 100 : 0,
          revenuePct: totalRevenue > 0 ? (d.revenue / totalRevenue) * 100 : 0,
          avgConversion,
        };
      })
      .filter((s): s is StructureSummary => s !== null);
  }, [rows]);
}

const structureIcons: Record<CampaignStructure, React.ElementType> = {
  TESTE: FlaskConical,
  "PRÉ ESCALA": TrendingUp,
  ESCALA: Rocket,
  OUTRO: Layers,
};

const DATE_RANGE_LABELS: Record<string, string> = {
  today: "Hoje", yesterday: "Ontem", "7": "Últimos 7 dias",
  "14": "Últimos 14 dias", "30": "Últimos 30 dias", custom: "Personalizado",
};

/* ─── Section Header ─────────────────────────────────────────────────── */
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

/* ─── Score de Decisão ───────────────────────────────────────────────── */
function computeDecision(c: CampaignRow): { score: string; color: string; emoji: string } {
  // ROAS: ≥1.8 (3pts), ≥1.2 saudável (2pts), ≥1.0 margem apertada (1pt), <1.0 negativo (0)
  const roasScore = c.roas >= 1.8 ? 3 : c.roas >= 1.2 ? 2 : c.roas >= 1.0 ? 1 : 0;
  // Volume: ≥3 conversões (3pts), ≥2 (2pts), ≥1 (1pt)
  const volumeScore = c.conversions >= 3 ? 3 : c.conversions >= 2 ? 2 : c.conversions >= 1 ? 1 : 0;
  const total = roasScore + volumeScore;
  if (total >= 5) return { score: "Escalar", color: "text-wr-positive", emoji: "🔥" };
  if (total >= 3) return { score: "Manter", color: "text-amber-400", emoji: "🟢" };
  if (total >= 1) return { score: "Observar", color: "text-blue-400", emoji: "🟡" };
  return { score: "Cortar", color: "text-destructive", emoji: "🔴" };
}

/* ─── Smart Status (Lançadas Hoje) ───────────────────────────────────── */
function getSmartStatus(c: CampaignRow) {
  if (c.spend > 30 && c.conversions === 0) return { label: "⚠ Risco", cls: "text-amber-500" };
  if (c.roas >= 1.5) return { label: "🔥 Forte", cls: "text-wr-positive" };
  if (c.roas >= 1.0) return { label: "🟢 Promissora", cls: "text-amber-400" };
  if (c.roas > 0) return { label: "🔴 Atenção", cls: "text-destructive" };
  return { label: "⚠ Risco", cls: "text-amber-500" };
}


/* ─── Lançadas Hoje Table (sortable) ──────────────────────────────────── */
type LtSortKey = "conversions" | "spend" | "cac" | "revenue" | "roas";

function LancadasHojeTable({ campaigns, ltSpend, ltRevenue, ltRoas, ltConversions }: {
  campaigns: CampaignRow[];
  ltSpend: number;
  ltRevenue: number;
  ltRoas: number;
  ltConversions: number;
}) {
  const [ltSort, setLtSort] = useState<LtSortKey>("conversions");
  const [ltDir, setLtDir] = useState<"asc" | "desc">("desc");

  function toggleLtSort(key: LtSortKey) {
    if (ltSort === key) setLtDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setLtSort(key); setLtDir("desc"); }
  }

  const sorted = useMemo(() => {
    const rows = [...campaigns];
    rows.sort((a, b) => {
      let av: number, bv: number;
      if (ltSort === "cac") {
        av = a.conversions > 0 ? a.spend / a.conversions : Infinity;
        bv = b.conversions > 0 ? b.spend / b.conversions : Infinity;
        return ltDir === "desc" ? av - bv : bv - av;
      }
      av = a[ltSort]; bv = b[ltSort];
      return ltDir === "desc" ? bv - av : av - bv;
    });
    return rows;
  }, [campaigns, ltSort, ltDir]);

  const ltCac = ltConversions > 0 ? ltSpend / ltConversions : 0;
  const ltCreativeSalesTotal = useMemo(() => {
    // Deduplicate by creative ID to avoid double-counting
    const seen = new Map<string, number>();
    for (const c of campaigns) {
      if (c.creativeId !== "SEM_ID" && !seen.has(c.creativeId)) {
        seen.set(c.creativeId, c.creativeSales);
      }
    }
    return Array.from(seen.values()).reduce((s, v) => s + v, 0);
  }, [campaigns]);

  const LtSortHead = ({ label, sortKey, align = "text-right" }: { label: string; sortKey: LtSortKey; align?: string }) => (
    <TableHead
      className={`text-[10px] uppercase tracking-wide text-muted-foreground font-medium ${align} cursor-pointer hover:text-foreground transition-colors select-none`}
      onClick={() => toggleLtSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown className={`h-3 w-3 ${ltSort === sortKey ? "text-primary" : ""}`} />
      </span>
    </TableHead>
  );

  return (
    <Card className="mt-3 bg-card border border-border">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Campanha</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-center">Criativo</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-center">Status</TableHead>
                <LtSortHead label="Conversões" sortKey="conversions" />
                <LtSortHead label="Investimento" sortKey="spend" />
                <LtSortHead label="CAC" sortKey="cac" />
                <LtSortHead label="Receita" sortKey="revenue" />
                <LtSortHead label="ROAS" sortKey="roas" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((c, i) => {
                const st = getSmartStatus(c);
                const cac = c.conversions > 0 ? c.spend / c.conversions : 0;
                return (
                  <TableRow key={i} className="border-border">
                    <TableCell className="text-xs font-medium max-w-[280px] truncate" title={c.fullName}>{c.name}</TableCell>
                    <TableCell className="text-center">
                      <span className="text-[9px] font-mono text-muted-foreground" title={c.creativeId}>{c.creativeId !== "SEM_ID" ? c.creativeId : "—"}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={`text-[10px] font-semibold ${st.cls}`}>{st.label}</span>
                    </TableCell>
                    <TableCell className="text-xs font-data text-right">{c.conversions}</TableCell>
                    <TableCell className="text-xs font-data text-right">{fmt(c.spend, "currency")}</TableCell>
                    <TableCell className="text-xs font-data text-right">{cac > 0 ? fmt(cac, "currency") : "—"}</TableCell>
                    <TableCell className="text-xs font-data text-right text-wr-positive">{fmt(c.revenue, "currency")}</TableCell>
                    <TableCell className={`text-xs font-data text-right font-medium ${c.roas >= 1 ? "text-wr-positive" : "text-destructive"}`}>{fmt(c.roas, "roas")}</TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="border-t-2 border-primary/30 bg-secondary/20 font-semibold">
                <TableCell className="text-xs font-bold">TOTAL ({campaigns.length})</TableCell>
                <TableCell />
                <TableCell />
                <TableCell className="text-xs font-data text-right font-bold">{ltConversions}</TableCell>
                <TableCell className="text-xs font-data text-right font-bold">{fmt(ltSpend, "currency")}</TableCell>
                <TableCell className="text-xs font-data text-right font-bold">{ltCac > 0 ? fmt(ltCac, "currency") : "—"}</TableCell>
                <TableCell className="text-xs font-data text-right font-bold text-wr-positive">{fmt(ltRevenue, "currency")}</TableCell>
                <TableCell className={`text-xs font-data text-right font-bold ${ltRoas >= 1 ? "text-wr-positive" : "text-destructive"}`}>{fmt(ltRoas, "roas")}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════ */

export default function Campaigns() {
  const { data: trafficData } = useTrafficData();
  const { data: salesDataRaw } = useRealSales();
  const { data: redTrackSalesRaw } = useRedTrackSales();
  const { data: campaignStatuses, syncNow, dataUpdatedAt } = useCampaignStatuses();
  const { data: activeAccounts } = useAccountStatuses();
  const { rangeKey, dateRange } = useDateRange();
  const { data: skyTotals } = useDashboardTotals();
  const opId = useOperationId();
  const { data: adPagesStats } = useMetaAdPagesStats();
  const drillTabsRef = useRef<HTMLDivElement>(null);

  // V3 — Meta Ads Drill-down state
  const [activeTab, setActiveTab] = useState<MetaAdsTab>("campaigns");
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>([]);
  const [selectedAdsetIds, setSelectedAdsetIds] = useState<string[]>([]);

  // Auto-scroll when tab changes to keep focus on the data
  useEffect(() => {
    if (drillTabsRef.current && activeTab !== "campaigns") {
      drillTabsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [activeTab]);

  // V3 Hooks
  const { data: adsetsData } = useMetaAdsets(selectedCampaignIds);
  const { data: adsData } = useMetaAds(selectedAdsetIds);

  // ─── ClickBank Audit: authoritative campaign-level revenue ──────────
  const [start, end] = dateRange;
  const { data: cbCampaignSalesRaw } = useQuery({
    queryKey: ["cb-campaign-sales", start, end, opId],
    queryFn: async () => {
      const PAGE = 1000;
      let all: any[] = [];
      let from = 0;
      const params: any = { p_start_date: start, p_end_date: end };
      if (opId) params.p_operation_id = opId;
      while (true) {
        const { data, error } = await supabase
          .rpc("get_cb_creative_sales" as any, params)
          .range(from, from + PAGE - 1);
        if (error) { console.warn("[cb-campaign-sales] RPC error:", error.message); return []; }
        const rows = (data as any[]) || [];
        all = all.concat(rows);
        if (rows.length < PAGE) break;
        from += PAGE;
      }
      return all as { campaign_name: string; revenue_brl: number; receipt: string }[];
    },
    staleTime: 60_000,
  });
  const [sortBy, setSortBy] = useState<SortKey>("spend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [statusFilter, setStatusFilter] = useState("all");
  const [structureFilter, setStructureFilter] = useState("all");
  const [syncing, setSyncing] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [minRoas, setMinRoas] = useState("");
  const [minSpend, setMinSpend] = useState("");
  const [onlyWithConversions, setOnlyWithConversions] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const isToday = rangeKey === "today";
  const usdToBrl = useExchangeRate();


  // ─── 14-day daily data for sparkline + period comparison ──────────────
  const roasDays = useMemo(() => {
    const days: string[] = [];
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      days.push(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d));
    }
    return days;
  }, []);

  const { data: roasFullData } = useQuery({
    queryKey: ["roas-14d-sparkline", roasDays[0], usdToBrl],
    queryFn: async () => {
      const startDate = roasDays[0];
      const endDate = roasDays[roasDays.length - 1];

      const { data: trafficRows, error: e1 } = await supabase.rpc("get_spend_normalized_sp", {
        p_start_date: startDate,
        p_end_date: endDate,
      });
      if (e1) throw e1;

      const spendByDay = new Map<string, number>();
      for (const r of (trafficRows as any[]) ?? []) {
        spendByDay.set(r.sp_date, (spendByDay.get(r.sp_date) ?? 0) + Number(r.total_spend));
      }

      const { data: cartpandaSales, error: e2 } = await supabase
        .from("sales_data")
        .select("date, revenue, status, store, order_id")
        .gte("date", startDate)
        .lte("date", endDate)
        .eq("status", "approved");
      if (e2) throw e2;

      const { data: redtrackSales, error: e3 } = await supabase
        .from("redtrack_events")
        .select("occurred_at, amount, event_type")
        .gte("occurred_at", `${startDate}T00:00:00`)
        .lte("occurred_at", `${endDate}T23:59:59`)
        .eq("event_type", "purchase");
      if (e3) throw e3;

      const rtWithDates = (redtrackSales ?? []).map((row: any) => ({
        ...row,
        date: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(row.occurred_at)),
        revenue: Number(row.amount || 0) * usdToBrl,
      }));

      const excludeCBDates = getClickbankExcludeDates(cartpandaSales ?? [], rtWithDates);
      const excludeRTDates = getRedTrackExcludeDates(cartpandaSales ?? [], rtWithDates);

      const revByDay = new Map<string, number>();
      for (const s of cartpandaSales ?? []) {
        const isCB = s.store === "clickbank" || (s.order_id || "").toLowerCase().includes("clickbank");
        if (isCB && excludeCBDates.has(s.date)) continue;
        revByDay.set(s.date, (revByDay.get(s.date) ?? 0) + (s.revenue ?? 0));
      }
      for (const s of rtWithDates) {
        if (excludeRTDates.has(s.date)) continue;
        revByDay.set(s.date, (revByDay.get(s.date) ?? 0) + s.revenue);
      }

      return roasDays.map((day) => {
        const spend = spendByDay.get(day) ?? 0;
        const revenue = revByDay.get(day) ?? 0;
        const roas = spend > 0 ? revenue / spend : 0;
        return { day, dayLabel: day.slice(5), roas: parseFloat(roas.toFixed(2)), spend: Math.round(spend), revenue: Math.round(revenue) };
      });
    },
    staleTime: 120_000,
  });

  // Split into current 7d (chart) and previous 7d (comparison)
  const prevPeriodData = useMemo(() => roasFullData?.slice(0, 7) ?? [], [roasFullData]);
  const roasChartData = useMemo(() => {
    const curr = roasFullData?.slice(7) ?? [];
    const prev = roasFullData?.slice(0, 7) ?? [];
    return curr.map((d, i) => ({ ...d, prevRoas: prev[i]?.roas ?? null }));
  }, [roasFullData]);

  const periodComparison = useMemo(() => {
    if (!roasChartData.length || !prevPeriodData.length) return null;
    const currSpend = roasChartData.reduce((s, d) => s + d.spend, 0);
    const currRev = roasChartData.reduce((s, d) => s + d.revenue, 0);
    const prevSpend = prevPeriodData.reduce((s, d) => s + d.spend, 0);
    const prevRev = prevPeriodData.reduce((s, d) => s + d.revenue, 0);
    const currRoas = currSpend > 0 ? currRev / currSpend : 0;
    const prevRoas = prevSpend > 0 ? prevRev / prevSpend : 0;
    const roasDelta = currRoas - prevRoas;
    const roasPct = prevRoas > 0 ? ((currRoas - prevRoas) / prevRoas) * 100 : 0;
    const spendDelta = currSpend - prevSpend;
    const spendPct = prevSpend > 0 ? ((currSpend - prevSpend) / prevSpend) * 100 : 0;
    const revDelta = currRev - prevRev;
    const revPct = prevRev > 0 ? ((currRev - prevRev) / prevRev) * 100 : 0;
    return { currRoas, prevRoas, roasDelta, roasPct, spendDelta, spendPct, revDelta, revPct, prevSpend, prevRev };
  }, [roasChartData, prevPeriodData]);

  const activeAccountIds = useMemo(() => {
    if (!activeAccounts) return new Set<string>();
    return new Set(activeAccounts.filter((a) => a.account_status === 1).map((a) => a.account_id));
  }, [activeAccounts]);

  const filteredCampaignStatuses = useMemo(() => {
    if (!campaignStatuses) return [];
    if (activeAccountIds.size === 0) return campaignStatuses;
    return campaignStatuses.filter((cs) => activeAccountIds.has((cs as any).account_id));
  }, [campaignStatuses, activeAccountIds]);

  const statusMap = useMemo(() => {
    const map = new Map<string, "ACTIVE" | "PAUSED">();
    for (const cs of filteredCampaignStatuses) {
      const eff = (cs as any).effective_status || (cs as any).status || "UNKNOWN";
      map.set((cs as any).campaign_name, eff === "ACTIVE" ? "ACTIVE" : "PAUSED");
    }
    return map;
  }, [filteredCampaignStatuses]);

  // Mapa com o status RAW da Meta (effective_status real) + timestamp da última
  // atualização — usado no badge granular (PAUSED, CAMPAIGN_PAUSED, WITH_ISSUES...)
  const rawStatusMap = useMemo(() => {
    const map = new Map<string, { eff: string; base: string; updatedAt: string | null }>();
    for (const cs of filteredCampaignStatuses) {
      map.set((cs as any).campaign_name, {
        eff: String((cs as any).effective_status || (cs as any).status || "UNKNOWN").toUpperCase(),
        base: String((cs as any).status || "").toUpperCase(),
        updatedAt: (cs as any).updated_at || null,
      });
    }
    return map;
  }, [filteredCampaignStatuses]);

  // ─── Build Campaign Rows ────────────────────────────────────────────
  const { allCampaigns, activeCampaigns, pausedCampaigns, globalTotals } = useMemo(() => {
    const traffic = trafficData || [];
    const sales = mergeAllSales(salesDataRaw || [], redTrackSalesRaw || []);

    const adsetToCampaign = new Map<string, string>();
    for (const t of traffic) {
      if (!adsetToCampaign.has(t.adset_name)) adsetToCampaign.set(t.adset_name, t.campaign_name);
    }

    const campMap = new Map<string, { spend: number; impressions: number; clicks: number }>();
    let globalSpend = 0;
    for (const t of traffic) {
      // Include ALL accounts in spend (including restricted with residual traffic)
      // to maintain parity with Dashboard totals
      const name = t.campaign_name;
      const sp = Number(t.spend);
      globalSpend += sp;
      if (!campMap.has(name)) campMap.set(name, { spend: 0, impressions: 0, clicks: 0 });
      const c = campMap.get(name)!;
      c.spend += sp;
      c.impressions += Number(t.impressions);
      c.clicks += Number(t.clicks);
    }

    // ─── HYBRID REVENUE: ClickBank Audit (primary) + RT/CP (fallback) ──
    // CB provides authoritative campaign attribution via aff_sub2 (real Meta campaign ID)
    const cbSalesByCampaign = new Map<string, { count: number; revenue: number }>();
    const cbCampaignReceipts = new Set<string>();
    for (const cb of (cbCampaignSalesRaw || [])) {
      if (cbCampaignReceipts.has(cb.receipt)) continue; // deduplicate
      cbCampaignReceipts.add(cb.receipt);
      const key = cb.campaign_name;
      if (!cbSalesByCampaign.has(key)) cbSalesByCampaign.set(key, { count: 0, revenue: 0 });
      const d = cbSalesByCampaign.get(key)!;
      d.count++;
      d.revenue += Number(cb.revenue_brl);
    }

    // Track which campaigns have CB attribution (by campaign_name)
    const campaignsWithCB = new Set(cbSalesByCampaign.keys());

    let globalRevenue = 0;
    let globalConversions = 0;
    const salesByCampaign = new Map<string, { count: number; revenue: number }>();

    // 1) Add all CB-attributed sales first (authoritative)
    for (const [key, data] of cbSalesByCampaign) {
      salesByCampaign.set(key, { count: data.count, revenue: data.revenue });
      globalRevenue += data.revenue;
      globalConversions += data.count;
    }

    // Build set of all known canonical campaign names (traffic + Meta statuses)
    // so we can reconcile UTMs that arrive with slight suffix differences
    // (e.g. UTM "[...][12.06]" vs traffic "[...][12.06] - top").
    const knownCampaignNames = new Set<string>([
      ...campMap.keys(),
      ...filteredCampaignStatuses.map((cs: any) => cs.campaign_name as string),
    ]);

    function reconcileCampaignKey(rawKey: string): string {
      if (knownCampaignNames.has(rawKey)) return rawKey;
      let bestMatch = "";
      let bestLen = 0;
      for (const cn of knownCampaignNames) {
        if (cn.startsWith(rawKey) || rawKey.startsWith(cn)) {
          const overlap = Math.min(cn.length, rawKey.length);
          if (overlap > bestLen && overlap >= 20) {
            bestLen = overlap;
            bestMatch = cn;
          }
        }
      }
      return bestMatch || rawKey;
    }

    // 2) For campaigns NOT covered by CB, fall back to merged RT/CP sales
    for (const sale of sales) {
      const rev = Number(sale.revenue);
      const isUpsell = (sale as any).event_type === "upsell";

      let raw = (sale as any).utm_campaign || "";
      if (!raw || raw.startsWith("[[") || raw.startsWith("01 -") || raw.startsWith("JD")) {
        const adsetName = (sale as any).utm_medium || (sale as any)._adset_name || "";
        const resolved = adsetToCampaign.get(adsetName);
        if (resolved) raw = resolved;
      }
      if (!raw) raw = "Sem UTM";
      const rawKey = raw.includes("|") ? raw.split("|")[0].trimEnd() : raw;
      const key = reconcileCampaignKey(rawKey);

      // Skip if this campaign already has CB-authoritative data
      if (campaignsWithCB.has(key)) continue;

      globalRevenue += rev;
      if (!isUpsell) globalConversions++;

      if (!salesByCampaign.has(key)) salesByCampaign.set(key, { count: 0, revenue: 0 });
      const d = salesByCampaign.get(key)!;
      if (!isUpsell) d.count++;
      d.revenue += rev;
    }

    // ─── Build sales by Creative ID (also hybrid) ────────────────────
    const salesByCreativeId = new Map<string, { count: number; revenue: number }>();
    // CB-attributed creative sales
    const cbCreativeReceipts = new Set<string>();
    const creativesWithCB = new Set<string>();
    for (const cb of (cbCampaignSalesRaw || [])) {
      if (cbCreativeReceipts.has(cb.receipt)) continue;
      cbCreativeReceipts.add(cb.receipt);
      const cid = resolveCreativeId(cb.campaign_name);
      if (cid === "SEM_ID") continue;
      creativesWithCB.add(cid);
      const existing = salesByCreativeId.get(cid) ?? { count: 0, revenue: 0 };
      existing.count++;
      existing.revenue += Number(cb.revenue_brl);
      salesByCreativeId.set(cid, existing);
    }
    // RT/CP fallback for creatives not in CB
    for (const sale of sales) {
      const isUpsell = (sale as any).event_type === "upsell";
      const utm = (sale as any).utm_campaign || "";
      const cid = resolveCreativeIdWithAd(utm);
      if (cid === "SEM_ID" || creativesWithCB.has(cid)) continue;
      const existing = salesByCreativeId.get(cid) ?? { count: 0, revenue: 0 };
      if (!isUpsell) existing.count++;
      existing.revenue += Number(sale.revenue);
      salesByCreativeId.set(cid, existing);
    }

    const allKeys = new Set([...campMap.keys(), ...salesByCampaign.keys()]);

    // Regra definitiva: a campanha aparece se (a) está ACTIVE na Meta agora, OU
    // (b) teve spend > 0 no período — mesmo que tenha sido pausada depois.
    // Isso garante que uma camp pausada no meio do dia NÃO some da lista e
    // mantenha o rastreio de quanto gastou antes de pausar.
    const now24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    for (const cs of filteredCampaignStatuses) {
      const isActive = (cs as any).effective_status === "ACTIVE" || (cs as any).status === "ACTIVE";
      const hasTraffic = campMap.has(cs.campaign_name) && (campMap.get(cs.campaign_name)!.spend > 0);
      const isRecentlyUpdated = (cs as any).updated_at >= now24h;
      if (isActive || hasTraffic || isRecentlyUpdated) {
        allKeys.add(cs.campaign_name);
      }
    }

    const isVendasCampaign = (name: string) => name.toLowerCase().includes("[vendas]");

    // Filter: [VENDAS] tag, spend > R$1 no período, ou ACTIVE na Meta (mesmo sem
    // gasto ainda). Camp pausada COM spend permanece visível — nunca some.
    const rows = Array.from(allKeys)
      .filter((name) => {
        if (isVendasCampaign(name)) return true;
        const trafficD = campMap.get(name);
        const hasSpend = (trafficD?.spend ?? 0) > 1;
        const isActive = statusMap.get(name) === "ACTIVE";
        return hasSpend || isActive;
      })
      .map((fullName) => {
        const trafficD = campMap.get(fullName);
        const salesD = salesByCampaign.get(fullName);
        const spend = trafficD?.spend || 0;
        const impressions = trafficD?.impressions || 0;
        const clicks = trafficD?.clicks || 0;
        const conversions = salesD?.count || 0;
        const revenue = salesD?.revenue || 0;
        const realStatus = statusMap.get(fullName);
        const rawMeta = rawStatusMap.get(fullName);
        const creativeId = resolveCreativeIdWithAd(fullName);
        const creativeSalesData = creativeId !== "SEM_ID" ? salesByCreativeId.get(creativeId) : undefined;

        // Find raw campaign status data to get budget
        const rawStatus = filteredCampaignStatuses.find((cs: any) => cs.campaign_name === fullName);
        const orcamento = Number((rawStatus as any)?.daily_budget || (rawStatus as any)?.budget || 0);

        return {
          fullName, name: formatCampaignName(fullName), spend, revenue,
          roas: spend > 0 ? revenue / spend : 0,
          ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
          cpc: clicks > 0 ? spend / clicks : 0,
          conversions, status: (realStatus || "PAUSED") as CampaignStatus,
          effStatus: rawMeta?.eff || (realStatus === "ACTIVE" ? "ACTIVE" : "PAUSED"),
          statusUpdatedAt: rawMeta?.updatedAt || null,
          structure: detectStructure(fullName),
          creativeId,
          creativeSales: creativeSalesData?.count ?? 0,
          creativeRevenue: creativeSalesData?.revenue ?? 0,
          orcamento,
        };
      });

    // Only count campaigns with actual spend in the period
    const totalActive = rows.filter((r) => r.status === "ACTIVE" && r.spend > 0).length;
    const totalPaused = rows.filter((r) => r.status === "PAUSED" && r.spend > 0).length;
    const tableRows = isToday
      ? rows.filter((r) => r.spend > 0 || r.conversions > 0)
      : rows;

    return {
      allCampaigns: tableRows,
      activeCampaigns: totalActive,
      pausedCampaigns: totalPaused,
      globalTotals: { spend: globalSpend, revenue: globalRevenue, conversions: globalConversions },
    };
  }, [trafficData, salesDataRaw, redTrackSalesRaw, cbCampaignSalesRaw, filteredCampaignStatuses, isToday, statusMap, rawStatusMap, activeAccountIds]);

  // ─── Filtered + Sorted ──────────────────────────────────────────────
  // Pausadas relevantes: contêm "-top" no nome E tiveram gasto nos últimos 7 dias
  const { data: activeNamesLast7d } = useQuery({
    queryKey: ["campaigns-active-names-7d", opId],
    enabled: !!opId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 7);
      const toIso = (d: Date) => d.toISOString().slice(0, 10);
      const rows = await fetchTrafficAggregated(toIso(start), toIso(end), opId);
      const set = new Set<string>();
      for (const r of rows) {
        if ((r.spend || 0) > 0 && r.campaign_name) set.add(String(r.campaign_name));
      }
      return set;
    },
  });

  const filtered = useMemo(() => {
    let rows = [...allCampaigns];
    if (searchText.trim()) {
      const tags = searchText.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
      if (tags.length > 0) {
        rows = rows.filter((r) => tags.every((tag) => r.fullName.toLowerCase().includes(tag)));
      }
    }
    if (statusFilter === "PAUSED_TOP") {
      const names = activeNamesLast7d || new Set<string>();
      rows = rows.filter((r) => r.status === "PAUSED" && /-\s*top\b/i.test(r.fullName) && names.has(r.fullName));
    } else if (statusFilter === "PAUSED") {
      // Genérico: qualquer camp pausada que teve spend/vendas no período
      rows = rows.filter((r) => r.status === "PAUSED");
    } else if (statusFilter !== "all") {
      rows = rows.filter((r) => r.status === statusFilter);
    }
    if (structureFilter !== "all") rows = rows.filter((r) => r.structure === structureFilter);
    if (minRoas) { const v = parseFloat(minRoas); if (!isNaN(v)) rows = rows.filter((r) => r.roas >= v); }
    if (minSpend) { const v = parseFloat(minSpend); if (!isNaN(v)) rows = rows.filter((r) => r.spend >= v); }
    if (onlyWithConversions) rows = rows.filter((r) => r.conversions > 0);
    rows.sort((a, b) => (sortDir === "desc" ? b[sortBy] - a[sortBy] : a[sortBy] - b[sortBy]));
    return rows;
  }, [allCampaigns, sortBy, sortDir, statusFilter, structureFilter, searchText, minRoas, minSpend, onlyWithConversions, activeNamesLast7d]);

  const structureSummary = useStructureData(filtered);
  const periodLabel = DATE_RANGE_LABELS[rangeKey] || "Período";
  const filteredActive = useMemo(() => filtered.filter((r) => r.status === "ACTIVE").length, [filtered]);
  const filteredPaused = useMemo(() => filtered.filter((r) => r.status === "PAUSED").length, [filtered]);
  // Contagem BRUTA da Meta (bate com Pacing): todas ACTIVE/PAUSED em contas ativas,
  // independente de gasto/delivery no período selecionado
  const rawActiveMeta = useMemo(
    () => filteredCampaignStatuses.filter((cs: any) => (cs.effective_status || cs.status) === "ACTIVE").length,
    [filteredCampaignStatuses]
  );
  const rawPausedMeta = useMemo(
    () => filteredCampaignStatuses.filter((cs: any) => (cs.effective_status || cs.status) !== "ACTIVE").length,
    [filteredCampaignStatuses]
  );


  const pausedTopRecent = useMemo(() => {
    const names = activeNamesLast7d || new Set<string>();
    return filteredCampaignStatuses.filter((cs: any) => {
      const eff = cs.effective_status || cs.status;
      if (eff === "ACTIVE") return false;
      const name = String(cs.campaign_name || "");
      if (!/-\s*top\b/i.test(name)) return false;
      return names.has(name);
    }).length;
  }, [filteredCampaignStatuses, activeNamesLast7d]);
  const filteredByStructure = useMemo(() => {
    const m = new Map<CampaignStructure, number>();
    for (const r of filtered) { if (r.status === "ACTIVE") m.set(r.structure, (m.get(r.structure) || 0) + 1); }
    return m;
  }, [filtered]);

  // F1/F2/F3 counters via nomenclatura (substring com word-boundary p/ evitar F10, F11…)
  const phaseCounts = useMemo(() => {
    const active = filtered.filter((r) => r.status === "ACTIVE" || r.status === "MIXED");
    const match = (name: string, n: number) => new RegExp(`F${n}(?!\\d)`, "i").test(name);
    return {
      f1: active.filter((r) => match(r.fullName, 1)).length,
      f2: active.filter((r) => match(r.fullName, 2)).length,
      f3: active.filter((r) => match(r.fullName, 3)).length,
    };
  }, [filtered]);

  // Distribuição por fase F1/F2/F3 (agrupamento por regex na nomenclatura da campanha)
  type PhaseKey = "F1" | "F2" | "F3" | "OUTRO";
  const phaseSummary = useMemo(() => {
    const matchPhase = (name: string): PhaseKey => {
      if (/F1(?!\d)/i.test(name)) return "F1";
      if (/F2(?!\d)/i.test(name)) return "F2";
      if (/F3(?!\d)/i.test(name)) return "F3";
      return "OUTRO";
    };
    const totalSpend = filtered.reduce((s, r) => s + r.spend, 0);
    const totalRevenue = filtered.reduce((s, r) => s + r.revenue, 0);
    const buckets = new Map<PhaseKey, { camps: Set<string>; spend: number; revenue: number; conversions: number }>();
    for (const r of filtered) {
      const key = matchPhase(r.fullName);
      if (!buckets.has(key)) buckets.set(key, { camps: new Set(), spend: 0, revenue: 0, conversions: 0 });
      const b = buckets.get(key)!;
      if (r.status === "ACTIVE" || r.status === "MIXED") b.camps.add(r.fullName);
      b.spend += r.spend;
      b.revenue += r.revenue;
      b.conversions += r.conversions;
    }
    return (["F1", "F2", "F3", "OUTRO"] as PhaseKey[])
      .map((key) => {
        const d = buckets.get(key);
        if (!d) return null;
        const campaigns = d.camps.size;
        if (campaigns === 0 && d.spend === 0) return null;
        const roas = d.spend > 0 ? d.revenue / d.spend : 0;
        const cpa = d.conversions > 0 ? d.spend / d.conversions : 0;
        const health: HealthStatus = getHealth(roas, cpa, d.conversions);
        return {
          phase: key,
          campaigns,
          spend: d.spend,
          revenue: d.revenue,
          conversions: d.conversions,
          roas,
          cpa,
          health,
          spendPct: totalSpend > 0 ? (d.spend / totalSpend) * 100 : 0,
          revenuePct: totalRevenue > 0 ? (d.revenue / totalRevenue) * 100 : 0,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [filtered]);


  // Orçamento projetado = soma bruta de daily_budget (BRL) das campanhas ATIVAS na Meta
  const projectedBudget = useMemo(() => {
    const source = filteredCampaignStatuses ?? [];
    let total = 0;
    let count = 0;
    for (const cs of source as any[]) {
      const eff = cs.effective_status || cs.status;
      if (eff !== "ACTIVE") continue;
      const v = Number(cs.daily_budget || 0);
      if (v > 0) { total += v; count++; }
    }
    return { total, count };
  }, [filteredCampaignStatuses]);

  function toggleSort(key: SortKey) {
    if (sortBy === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortBy(key); setSortDir("desc"); }
  }

  async function handleSyncNow() {
    setSyncing(true);
    try { await syncNow(); toast.success("Status atualizado"); }
    catch { toast.error("Erro ao sincronizar"); }
    finally { setSyncing(false); }
  }

  /** Hard reload: limpa caches do browser e service workers de app-shell (mantém o de push). */
  async function handleHardReload() {
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          regs
            .filter((r) => !(r.active?.scriptURL || r.installing?.scriptURL || "").includes("push-sw.js"))
            .map((r) => r.unregister()),
        );
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch { /* ignore */ }
    const url = new URL(window.location.href);
    url.searchParams.set("_r", Date.now().toString());
    window.location.replace(url.toString());
  }

  const lastUpdate = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString("pt-BR", {
        hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "America/Sao_Paulo",
      })
    : null;


  const SortHeader = ({ label, sortKey }: { label: string; sortKey: SortKey }) => (
    <TableHead
      className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-right cursor-pointer hover:text-foreground transition-colors select-none"
      onClick={() => toggleSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown className={`h-3 w-3 ${sortBy === sortKey ? "text-primary" : ""}`} />
      </span>
    </TableHead>
  );

  // Badge granular de status Meta — mostra o estado REAL (effective_status),
  // não apenas binário Ativa/Pausada. Camp pausada hoje mantém rastreio visual.
  const MetaStatusBadge = ({ effStatus, status, updatedAt }: { effStatus?: string; status: CampaignStatus; updatedAt?: string | null }) => {
    const eff = String(effStatus || (status === "ACTIVE" ? "ACTIVE" : "PAUSED")).toUpperCase();
    const when = updatedAt
      ? new Date(updatedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })
      : null;

    let cls = "border-muted-foreground/30 text-muted-foreground";
    let label = eff;
    let emoji = "";

    if (eff === "ACTIVE") {
      cls = "border-wr-positive/30 text-wr-positive bg-wr-positive/5";
      label = "Ativa"; emoji = "🟢";
    } else if (eff === "PAUSED") {
      cls = "border-muted-foreground/40 text-muted-foreground bg-muted/30";
      label = "Pausada"; emoji = "⏸️";
    } else if (eff === "CAMPAIGN_PAUSED" || eff === "ADSET_PAUSED") {
      cls = "border-wr-warning/40 text-wr-warning bg-wr-warning/5";
      label = eff === "CAMPAIGN_PAUSED" ? "Camp. Pausada" : "Adset Pausado"; emoji = "📵";
    } else if (eff === "WITH_ISSUES" || eff === "DISAPPROVED" || eff.includes("DISAPPROVED")) {
      cls = "border-destructive/40 text-destructive bg-destructive/5";
      label = eff === "WITH_ISSUES" ? "Com Problemas" : "Reprovada"; emoji = "⚠️";
    } else if (eff === "ARCHIVED" || eff === "DELETED") {
      cls = "border-muted-foreground/20 text-muted-foreground/60";
      label = eff === "ARCHIVED" ? "Arquivada" : "Deletada"; emoji = "🗄️";
    } else if (eff === "IN_PROCESS" || eff === "PENDING_REVIEW") {
      cls = "border-primary/30 text-primary bg-primary/5";
      label = eff === "IN_PROCESS" ? "Processando" : "Em Revisão"; emoji = "⏳";
    }

    return (
      <Badge
        variant="outline"
        className={`text-[9px] font-medium whitespace-nowrap ${cls}`}
        title={when ? `Status: ${eff} — atualizado ${when} (BRT)` : `Status: ${eff}`}
      >
        {emoji} {label}{eff === "PAUSED" && when ? ` ${when}` : ""}
      </Badge>
    );
  };

  /* ─── Derived Intelligence Data ──────────────────────────────────── */
  const activeRows = useMemo(() => allCampaigns.filter((r) => r.status === "ACTIVE"), [allCampaigns]);
  const activeWithSpend = useMemo(() => activeRows.filter((r) => r.spend > 0), [activeRows]);
  // Insight Operacional: usa dados autoritativos do dashboard-totals (Sky Mode)
  const allWithData = useMemo(() => allCampaigns.filter((r) => r.spend > 0 || r.conversions > 0), [allCampaigns]);
  const totalSpend = skyTotals?.totalSpend ?? globalTotals.spend;
  const totalRevenue = skyTotals?.totalRevenue ?? globalTotals.revenue;
  const totalConversions = skyTotals?.totalConversions ?? globalTotals.conversions;
  const overallRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

  // ═══════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════

  const totalSpendCampaigns = filtered.reduce((s, r) => s + r.spend, 0);
  const totalRevenueCampaigns = filtered.reduce((s, r) => s + r.revenue, 0);
  const totalConversionsCampaigns = filtered.reduce((s, r) => s + r.conversions, 0);
  const isOperationEmpty = useIsOperationEmpty(totalSpendCampaigns, totalRevenueCampaigns, totalConversionsCampaigns);

  if (isOperationEmpty) {
    return (
      <div className="full-width-page space-y-8 w-full">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Campanhas</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Gestão de campanhas</p>
        </div>
        <DataEmptyState />
      </div>
    );
  }

  return (
    <div className="full-width-page space-y-8 w-full">
      {/* ──────────── HEADER ──────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Campanhas</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              <span className="text-emerald-400 font-medium">{filteredActive} ativas</span>
              {" · "}
              <span className="text-muted-foreground font-medium">{filteredPaused} pausadas</span>
              {" · "}
              {filtered.length} total • {periodLabel} • Status via Meta API

              {lastUpdate && <span className="ml-1">• Última sync: {lastUpdate} BRT</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                placeholder="Buscar campanha..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="h-8 w-[380px] pl-8 text-xs border-border bg-secondary/50"
              />
            </div>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={handleSyncNow} disabled={syncing}>
              {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Atualizar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs gap-1.5 text-muted-foreground"
              onClick={handleHardReload}
              title="Limpa cache do navegador e recarrega a página do zero"
            >
              <RefreshCw className="h-3 w-3" />
              Recarregar
            </Button>
          </div>

        </div>

        {/* ── Chip filters (unified) ── */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Status chips */}
          {([
            { value: "ACTIVE", label: "Ativas", count: activeCampaigns, icon: Activity, tip: "Campanhas com effective_status=ACTIVE na Meta" },
            { value: "PAUSED", label: "Pausadas", count: pausedCampaigns, icon: Pause, tip: "Campanhas pausadas na Meta que tiveram gasto no período — permanecem na lista para auditoria" },
            { value: "PAUSED_TOP", label: "Pausadas -TOP (7d)", count: pausedTopRecent, icon: Pause, tip: "Critérios: status=PAUSED + nome contém \"-top\" + teve gasto nos últimos 7 dias" },
          ] as const).map((chip) => {
            const isActive = statusFilter === chip.value;
            return (
              <button
                key={chip.value}
                onClick={() => setStatusFilter(isActive ? "all" : chip.value)}
                title={chip.tip}
                className={`flex items-center gap-1.5 h-7 px-3 rounded-full text-[11px] font-medium transition-all border ${
                  isActive
                    ? "bg-primary/10 text-primary border-primary/25"
                    : "text-muted-foreground border-border hover:bg-muted hover:text-foreground"
                }`}
              >
                <chip.icon className="h-3 w-3" />
                {chip.label}
                <span className={`text-[10px] font-data ${isActive ? "text-primary" : "text-muted-foreground/60"}`}>{chip.count}</span>
              </button>
            );
          })}

          <div className="w-px h-5 bg-border mx-1" />

          {/* Structure chips */}
          {([
            { value: "TESTE", label: "Teste", icon: FlaskConical },
            { value: "PRÉ ESCALA", label: "Pré-Escala", icon: TrendingUp },
            { value: "ESCALA", label: "Escala", icon: Rocket },
          ] as const).map((chip) => {
            const isActive = structureFilter === chip.value;
            const count = filteredByStructure.get(chip.value as CampaignStructure) ?? 0;
            return (
              <button
                key={chip.value}
                onClick={() => setStructureFilter(isActive ? "all" : chip.value)}
                className={`flex items-center gap-1.5 h-7 px-3 rounded-full text-[11px] font-medium transition-all border ${
                  isActive
                    ? "bg-primary/10 text-primary border-primary/25"
                    : "text-muted-foreground border-border hover:bg-muted hover:text-foreground"
                }`}
              >
                <chip.icon className="h-3 w-3" />
                {chip.label}
                {count > 0 && <span className={`text-[10px] font-data ${isActive ? "text-primary" : "text-muted-foreground/60"}`}>{count}</span>}
              </button>
            );
          })}

          {(statusFilter !== "all" || structureFilter !== "all") && (
            <>
              <div className="w-px h-5 bg-border mx-1" />
              <button
                onClick={() => { setStatusFilter("all"); setStructureFilter("all"); }}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Limpar filtros
              </button>
            </>
          )}
        </div>
      </div>

      {/* ──────────── 🎯 FILTROS AVANÇADOS ──────────── */}
      <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 text-[10px] text-muted-foreground gap-1 px-2">
            <Filter className="h-3 w-3" />
            Filtros Avançados
            <ChevronDown className={`h-3 w-3 transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground">ROAS mín:</span>
              <Input value={minRoas} onChange={(e) => setMinRoas(e.target.value)} placeholder="0" className="h-7 w-[70px] text-xs border-border bg-secondary/50" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground">Gasto mín:</span>
              <Input value={minSpend} onChange={(e) => setMinSpend(e.target.value)} placeholder="0" className="h-7 w-[80px] text-xs border-border bg-secondary/50" />
            </div>
            <Button
              variant={onlyWithConversions ? "default" : "outline"}
              size="sm"
              className="h-7 text-[10px]"
              onClick={() => setOnlyWithConversions(!onlyWithConversions)}
            >
              Apenas com conversão
            </Button>
            {(minRoas || minSpend || onlyWithConversions) && (
              <Button variant="ghost" size="sm" className="h-7 text-[10px] text-muted-foreground" onClick={() => { setMinRoas(""); setMinSpend(""); setOnlyWithConversions(false); }}>
                Limpar filtros
              </Button>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* ═══════════════════════════════════════════════════════════════
          INSIGHT OPERACIONAL — REDESIGNED
          ═══════════════════════════════════════════════════════════════ */}
      {allWithData.length > 0 && (() => {
        const insights: string[] = [];

        // Concentração de receita por estrutura
        const revByStructure = new Map<CampaignStructure, number>();
        for (const c of allWithData) {
          revByStructure.set(c.structure, (revByStructure.get(c.structure) || 0) + c.revenue);
        }
        const topStructure = [...revByStructure.entries()].sort((a, b) => b[1] - a[1])[0];
        if (topStructure && totalRevenue > 0) {
          const pct = ((topStructure[1] / totalRevenue) * 100).toFixed(0);
          insights.push(`${pct}% da receita vem da fase ${structureLabels[topStructure[0]]}`);
        }

        // Campanhas lançadas hoje com ROAS alto
        if (isToday) {
          const launched = allWithData.filter((r) => r.spend > 0 && r.spend < 50);
          const goodLaunched = launched.filter((r) => r.roas >= 1.8);
          if (goodLaunched.length > 0) insights.push(`${goodLaunched.length} campanha${goodLaunched.length > 1 ? "s" : ""} criada${goodLaunched.length > 1 ? "s" : ""} hoje já com ROAS > 1.8x`);
        }

        // Concentração de gasto
        const topSpender = [...allWithData].sort((a, b) => b.spend - a.spend)[0];
        if (topSpender && totalSpend > 0) {
          const pct = ((topSpender.spend / totalSpend) * 100);
          if (pct > 25) insights.push(`${topSpender.name} consome ${pct.toFixed(0)}% do orçamento total`);
        }

        // ROAS crítico
        const critical = allWithData.filter((r) => r.roas > 0 && r.roas < 0.8 && r.spend > 50);
        if (critical.length > 0) insights.push(`${critical.length} campanha${critical.length > 1 ? "s" : ""} com ROAS abaixo de 0.8x`);

        // ROAS geral
        if (overallRoas >= 1.3) insights.push(`ROAS geral em ${fmt(overallRoas, "roas")} — operação saudável`);
        else if (overallRoas >= 1) insights.push(`ROAS geral em ${fmt(overallRoas, "roas")} — margem apertada`);
        else if (overallRoas > 0) insights.push(`ROAS geral em ${fmt(overallRoas, "roas")} — operação negativa`);

        // CPA
        if (totalConversions > 0) insights.push(`CPA médio: ${fmt(totalSpend / totalConversions, "currency")} em ${totalConversions} conversões`);

        if (insights.length === 0) return null;

        // ─── Assertividade de Campanhas ────────────────────────────
        const activeCamps = allCampaigns.filter((r) => r.status === "ACTIVE" || r.spend > 0);
        const activeCampsTotal = activeCamps.length;
        const campsWithSale = activeCamps.filter((r) => r.conversions > 0).length;
        const campsWithProfit = activeCamps.filter((r) => r.conversions > 0 && r.revenue > r.spend).length;
        const pctSelling = activeCampsTotal > 0 ? (campsWithSale / activeCampsTotal) * 100 : 0;

        // ─── Breakdown por Estrutura ────────────────────────────────
        const structureBreakdown = (["TESTE", "PRÉ ESCALA", "ESCALA"] as CampaignStructure[]).map((s) => {
          const camps = activeCamps.filter((r) => r.structure === s);
          const total = camps.length;
          const withSale = camps.filter((r) => r.conversions > 0).length;
          const withProfit = camps.filter((r) => r.conversions > 0 && r.revenue > r.spend).length;
          return { structure: s, total, withSale, withProfit };
        }).filter((s) => s.total > 0);

        // Health status
        const opStatus = overallRoas >= 1.3
          ? { label: "OPERAÇÃO SAUDÁVEL", emoji: "🟢", color: "text-wr-positive", border: "border-wr-positive/40", bg: "bg-wr-positive/5", dot: "bg-wr-positive", pulse: false }
          : overallRoas >= 1
          ? { label: "OPERAÇÃO EM ALERTA", emoji: "🟡", color: "text-amber-400", border: "border-amber-400/40", bg: "bg-amber-400/5", dot: "bg-amber-400", pulse: true }
          : { label: "OPERAÇÃO NEGATIVA", emoji: "🔴", color: "text-destructive", border: "border-destructive/40", bg: "bg-destructive/5", dot: "bg-destructive", pulse: true };

        const cpa = totalConversions > 0 ? totalSpend / totalConversions : 0;

        return (
          <div className="space-y-4">
            {/* ─── BLOCO 1: INSIGHT OPERACIONAL (hero card) ─── */}
            <div>
              <SectionHeader title="Insight Operacional" icon={Brain} right={periodLabel} />
              <Card className={`mt-3 border ${opStatus.border} ${opStatus.bg} overflow-hidden`}>
                <CardContent className="p-0">
                  {/* ── Hero status ── */}
                  <div className="px-6 pt-6 pb-4 border-b border-border/30">
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`h-3.5 w-3.5 rounded-full ${opStatus.dot} shrink-0 ${opStatus.pulse ? "animate-pulse" : ""}`} />
                      <span className="text-lg">{opStatus.emoji}</span>
                    </div>
                    <h2 className={`text-2xl sm:text-3xl font-bold tracking-tight ${opStatus.color} leading-none`}>
                      {opStatus.label}
                    </h2>
                  </div>

                  {/* ── KPIs principais ── */}
                  <div className="px-6 py-5 grid grid-cols-3 gap-6 border-b border-border/30">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">ROAS</p>
                      <p className={`text-2xl sm:text-3xl font-bold font-data leading-none ${opStatus.color}`}>
                        {fmt(overallRoas, "roas")}
                      </p>
                      {periodComparison && (
                        <div className={`flex items-center gap-1 mt-1.5 text-[10px] font-medium ${periodComparison.roasDelta >= 0 ? "text-wr-positive" : "text-destructive"}`}>
                          {periodComparison.roasDelta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          <span>{periodComparison.roasDelta >= 0 ? "+" : ""}{periodComparison.roasDelta.toFixed(2)}x</span>
                          <span className="text-muted-foreground">vs 7d ant.</span>
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">CPA</p>
                      <p className="text-2xl sm:text-3xl font-bold font-data text-foreground leading-none">
                        {cpa > 0 ? fmt(cpa, "currency") : "—"}
                      </p>
                      {periodComparison && periodComparison.prevSpend > 0 && (
                        <div className={`flex items-center gap-1 mt-1.5 text-[10px] font-medium ${periodComparison.spendDelta <= 0 ? "text-wr-positive" : "text-muted-foreground"}`}>
                          {periodComparison.spendDelta <= 0 ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                          <span>{periodComparison.spendPct >= 0 ? "+" : ""}{periodComparison.spendPct.toFixed(0)}% invest</span>
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Conversões</p>
                      <p className="text-2xl sm:text-3xl font-bold font-data text-foreground leading-none">
                        {fmt(totalConversions, "number")}
                      </p>
                      {periodComparison && periodComparison.prevRev > 0 && (
                        <div className={`flex items-center gap-1 mt-1.5 text-[10px] font-medium ${periodComparison.revDelta >= 0 ? "text-wr-positive" : "text-destructive"}`}>
                          {periodComparison.revDelta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          <span>{periodComparison.revPct >= 0 ? "+" : ""}{periodComparison.revPct.toFixed(0)}% receita</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── Mini ROAS 7d sparkline ── */}
                  {roasChartData && roasChartData.length > 0 && (
                    <div className="px-6 py-4 border-b border-border/30">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">ROAS — Últimos 7 dias</p>
                      <div className="h-[80px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={roasChartData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                            <defs>
                              <linearGradient id="roasGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <XAxis dataKey="dayLabel" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                            <YAxis hide domain={[0, "auto"]} />
                            <ReferenceLine y={1} stroke="hsl(var(--destructive))" strokeDasharray="3 3" strokeOpacity={0.5} />
                            <ReferenceLine y={1.5} stroke="hsl(var(--chart-4))" strokeDasharray="3 3" strokeOpacity={0.4} />
                            <Tooltip
                              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                              formatter={(v: number, name: string) => {
                                if (name === "roas") return [`${v.toFixed(2)}x`, "ROAS"];
                                return [fmt(v, "currency"), name === "spend" ? "Investimento" : "Receita"];
                              }}
                              labelStyle={{ color: "hsl(var(--muted-foreground))", fontSize: 10 }}
                              content={({ active, payload, label }) => {
                                if (!active || !payload?.length) return null;
                                const d = payload[0].payload;
                                return (
                                  <div style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, padding: "8px 12px", fontSize: 11 }}>
                                    <p style={{ color: "hsl(var(--muted-foreground))", marginBottom: 4 }}>{label}</p>
                                    <p style={{ fontWeight: 600 }}>ROAS: <span style={{ color: d.roas >= 1.5 ? "hsl(var(--chart-2))" : d.roas >= 1 ? "hsl(var(--chart-4))" : "hsl(var(--destructive))" }}>{d.roas.toFixed(2)}x</span></p>
                                    {d.prevRoas != null && <p style={{ color: "hsl(var(--muted-foreground))" }}>Anterior: {d.prevRoas.toFixed(2)}x</p>}
                                    <p style={{ color: "hsl(var(--muted-foreground))" }}>Invest: {fmt(d.spend, "currency")}</p>
                                    <p style={{ color: "hsl(var(--chart-2))" }}>Receita: {fmt(d.revenue, "currency")}</p>
                                  </div>
                                );
                              }}
                            />
                            <Line
                              type="monotone"
                              dataKey="prevRoas"
                              stroke="hsl(var(--muted-foreground))"
                              strokeWidth={1.5}
                              strokeDasharray="4 3"
                              strokeOpacity={0.5}
                              dot={false}
                              activeDot={false}
                              connectNulls
                            />
                            <Area
                              type="monotone"
                              dataKey="roas"
                              stroke="hsl(var(--primary))"
                              strokeWidth={2}
                              fill="url(#roasGrad)"
                              dot={{ r: 3, fill: "hsl(var(--primary))", strokeWidth: 0 }}
                              activeDot={{ r: 5, fill: "hsl(var(--primary))" }}
                            />
                        </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {/* ── Insights secundários ── */}
                  <div className="px-6 py-4 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
                    {insights.slice(0, 6).map((text, i) => (
                      <div key={i} className="flex items-start gap-2.5 text-xs">
                        <span className="text-muted-foreground mt-[3px] shrink-0 font-mono text-[9px]">▸</span>
                        <p className="text-muted-foreground leading-relaxed">{text}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* ─── BLOCO 2: STATUS DAS CAMPANHAS ─── */}
            <div>
              <SectionHeader title="Assertividade do Período" icon={Activity} />
              <div className="mt-3 grid grid-cols-3 gap-3">
                <Card className="border border-border bg-card">
                  <CardContent className="p-5 text-center">
                    <p className="text-3xl font-bold font-data text-foreground leading-none">{activeCampsTotal}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-2">Campanhas que Operaram</p>
                  </CardContent>
                </Card>
                <Card className="border border-border bg-card">
                  <CardContent className="p-5 text-center">
                    <p className="text-3xl font-bold font-data text-foreground leading-none">{campsWithSale}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-2">Campanhas Vendendo</p>
                  </CardContent>
                </Card>
                <Card className="border border-border bg-card">
                  <CardContent className="p-5 text-center">
                    <p className="text-3xl font-bold font-data text-foreground leading-none">{pctSelling.toFixed(1)}%</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-2">Eficiência da Operação</p>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* ─── BLOCO 3: ESTRUTURA DA OPERAÇÃO ─── */}
            {structureBreakdown.length > 0 && (
              <div>
                <SectionHeader title="Estrutura da Operação" icon={Layers} />
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {structureBreakdown.map((sb) => {
                    const Icon = structureIcons[sb.structure];
                    const isEscala = sb.structure === "ESCALA";
                    const isPreEscala = sb.structure === "PRÉ ESCALA";
                    const profitPct = isEscala && sb.withSale > 0 ? (sb.withProfit / sb.withSale) * 100 : 0;

                    return (
                      <Card
                        key={sb.structure}
                        className={`border bg-card transition-all ${
                          isEscala
                            ? "border-wr-positive/30 shadow-[0_0_15px_-5px_hsl(var(--wr-positive)/0.1)]"
                            : "border-border"
                        }`}
                      >
                        <CardContent className="p-6">
                          {/* Header */}
                          <div className="flex items-center gap-2.5 mb-5">
                            <div
                              className={`h-8 w-8 rounded-lg flex items-center justify-center ${
                                isEscala
                                  ? "bg-wr-positive/10"
                                  : isPreEscala
                                  ? "bg-amber-500/10"
                                  : "bg-secondary"
                              }`}
                            >
                              <Icon
                                className={`h-4 w-4 ${
                                  isEscala
                                    ? "text-wr-positive"
                                    : isPreEscala
                                    ? "text-amber-500"
                                    : "text-muted-foreground"
                                }`}
                              />
                            </div>
                            <span className="text-[11px] font-semibold uppercase tracking-widest text-foreground">
                              {structureLabels[sb.structure]}
                            </span>
                          </div>

                          {/* Metrics */}
                          <div className="space-y-3">
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Campanhas</p>
                              <p className="text-2xl font-bold font-data text-foreground leading-none">{sb.total}</p>
                            </div>
                            <div className="h-px bg-border/50" />
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Com venda</p>
                              <p className={`text-lg font-bold font-data leading-none ${sb.withSale > 0 ? "text-foreground" : "text-muted-foreground/50"}`}>
                                {sb.withSale}
                              </p>
                            </div>

                            {/* Lucrativas — only for Escala */}
                            {isEscala && (
                              <>
                                <div className="h-px bg-border/50" />
                                <div>
                                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Lucrativas</p>
                                  <p className="text-lg font-bold font-data text-wr-positive leading-none">{sb.withProfit}</p>
                                </div>

                                {/* Progress bar: lucrativas / com venda */}
                                {sb.withSale > 0 && (
                                  <div className="mt-1">
                                    <div className="flex items-center justify-between mb-1.5">
                                      <span className="text-[9px] text-muted-foreground">
                                        {sb.withProfit} / {sb.withSale} lucrativas
                                      </span>
                                      <span className="text-[9px] font-semibold font-data text-wr-positive">
                                        {profitPct.toFixed(0)}%
                                      </span>
                                    </div>
                                    <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                                      <div
                                        className="h-full rounded-full bg-wr-positive transition-all duration-700 ease-out"
                                        style={{ width: `${Math.min(profitPct, 100)}%` }}
                                      />
                                    </div>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ─── RODAPÉ: Métricas Consolidadas ─── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card className="border border-border bg-card">
                <CardContent className="p-4 text-center">
                  <p className="text-base font-semibold font-data text-wr-positive">{fmt(totalRevenue, "currency")}</p>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-1">Receita</p>
                </CardContent>
              </Card>
              <Card className="border border-border bg-card">
                <CardContent className="p-4 text-center">
                  <p className="text-base font-semibold font-data text-foreground">{fmt(totalSpend, "currency")}</p>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-1">Investimento</p>
                </CardContent>
              </Card>
              <Card className="border border-border bg-card">
                <CardContent className="p-4 text-center">
                  <p className={`text-base font-semibold font-data ${overallRoas >= 1 ? "text-wr-positive" : "text-destructive"}`}>{fmt(overallRoas, "roas")}</p>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-1">ROAS</p>
                </CardContent>
              </Card>
              <Card className="border border-border bg-card">
                <CardContent className="p-4 text-center">
                  <p className="text-base font-semibold font-data text-foreground">{totalConversions}</p>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-1">Conversões</p>
                </CardContent>
              </Card>
            </div>
          </div>
        );
      })()}

      {/* ──────────── KPI Cards Row ──────────── */}
      <SectionHeader title="Campanhas ao Vivo" icon={Zap} />
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2.5 md:gap-3">
        {/* Campanhas Ativas */}
        <Card className="mobile-kpi-card bg-card border border-emerald-500/20 shadow-[0_0_12px_-4px_hsl(var(--wr-positive)/0.08)]">
          <CardContent className="px-5 py-4 md:p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <Activity className="h-4 w-4 text-emerald-400" />
              </div>
              <span className="flex items-center gap-1.5 text-[8px] text-emerald-400/80 font-medium uppercase tracking-widest">
                <span className="relative flex h-1.5 w-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" /></span>
                live
              </span>
            </div>
            <p className="text-[32px] md:text-3xl font-bold font-data leading-none text-emerald-400">{rawActiveMeta}</p>
            <p className="text-[11px] md:text-[10px] text-muted-foreground mt-1.5 uppercase tracking-wider">Campanhas Ativas</p>
            <p className="text-[9px] text-muted-foreground/70 mt-1 tabular-nums" title="Ativas na Meta que tiveram gasto no período selecionado">
              {filteredActive} c/ gasto no período · {rawActiveMeta + rawPausedMeta} total
            </p>
          </CardContent>
        </Card>

        {/* Campanhas Pausadas */}
        <Card className="mobile-kpi-card bg-card border border-border/50">
          <CardContent className="px-5 py-4 md:p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="h-8 w-8 rounded-lg bg-muted/50 flex items-center justify-center">
                <Pause className="h-4 w-4 text-muted-foreground" />
              </div>
              <span className="flex items-center gap-1.5 text-[8px] text-muted-foreground/60 font-medium uppercase tracking-widest">
                <span className="relative flex h-1.5 w-1.5"><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-muted-foreground/40" /></span>
                live
              </span>
            </div>
            <p className="text-[32px] md:text-3xl font-bold font-data leading-none text-muted-foreground">{pausedTopRecent}</p>
            <p className="text-[11px] md:text-[10px] text-muted-foreground mt-1.5 uppercase tracking-wider">Pausadas -TOP (7d)</p>
            <p className="text-[9px] text-muted-foreground/70 mt-1 tabular-nums" title="Critérios: status=PAUSED na Meta + nome contém &quot;-top&quot; + spend > 0 nos últimos 7 dias (via traffic_data)">
              {rawPausedMeta} pausadas no total · {filteredPaused} c/ gasto no período
            </p>
          </CardContent>
        </Card>

        {/* Fases F1 / F2 / F3 (por nomenclatura) */}
        <Card className="mobile-kpi-card bg-card border border-border/50">
          <CardContent className="px-5 py-4 md:p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Fases</p>
              <span className="flex items-center gap-1.5 text-[8px] text-muted-foreground/60 font-medium uppercase tracking-widest">
                <span className="relative flex h-1.5 w-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-50" /><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-400" /></span>
                live
              </span>
            </div>
            <div className="space-y-2">
              {([
                { key: "f1" as const, label: "F1 Teste Criativo", icon: "📊", color: "text-blue-400", dotColor: "bg-blue-400" },
                { key: "f2" as const, label: "F2 Pré-escala", icon: "📈", color: "text-amber-400", dotColor: "bg-amber-400" },
                { key: "f3" as const, label: "F3 Escala", icon: "🚀", color: "text-emerald-400", dotColor: "bg-emerald-400" },
              ]).map(({ key, label, icon, color, dotColor }) => (
                <div key={key} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${dotColor}`} />
                    <span className="text-[10px] text-muted-foreground font-medium">
                      <span className="mr-1">{icon}</span>{label}
                    </span>
                  </div>
                  <span className={`text-base font-bold font-data ${color}`}>{phaseCounts[key]}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>


        {/* Orçamento Projetado */}
        <Card className="mobile-kpi-card bg-card border border-orange-500/20">
          <CardContent className="px-5 py-4 md:p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="h-8 w-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-orange-400" />
              </div>
              <span className="flex items-center gap-1.5 text-[8px] text-orange-400/70 font-medium uppercase tracking-widest">
                <span className="relative flex h-1.5 w-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-50" /><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-orange-400" /></span>
                live
              </span>
            </div>
            <p className="text-[28px] md:text-3xl font-bold font-data leading-none text-orange-400">{fmt(projectedBudget.total, "currency")}</p>
            <p className="text-[11px] md:text-[10px] text-muted-foreground mt-1.5 uppercase tracking-wider">Orçamento Projetado Hoje</p>
            <p className="text-[9px] text-muted-foreground/70 mt-1">soma de {projectedBudget.count} campanhas ativas</p>
          </CardContent>
        </Card>

        {/* Páginas / Anúncios */}
        <Card className="mobile-kpi-card bg-card border border-border/50">
          <CardContent className="px-5 py-4 md:p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="h-8 w-8 rounded-lg bg-muted/50 flex items-center justify-center">
                <Layers className="h-4 w-4 text-muted-foreground" />
              </div>
              <span className="flex items-center gap-1.5 text-[8px] text-muted-foreground/60 font-medium uppercase tracking-widest">
                <span className="relative flex h-1.5 w-1.5"><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-muted-foreground/40" /></span>
                live
              </span>
            </div>
            {(() => {
              const ads = adPagesStats?.activeAds ?? 0;
              const pages = adPagesStats?.activePages ?? 0;
              const noPage = adPagesStats?.adsWithoutPage ?? 0;
              const last = adPagesStats?.lastSyncedAt
                ? new Date(adPagesStats.lastSyncedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })
                : null;
              return (
                <div className="space-y-3">
                  <div title="Anúncios com effective_status = ACTIVE na Meta (sincronizado de hora em hora via sync-meta-ad-pages).">
                    <p className="text-[38px] md:text-4xl font-bold font-data leading-none text-foreground">{ads.toLocaleString("pt-BR")}</p>
                    <p className="text-[11px] md:text-[10px] text-muted-foreground mt-1.5 uppercase tracking-wider">Anúncios Ativos</p>
                  </div>
                  <div className="h-px bg-border/40" />
                  <div title="Fanpages distintas (page_id) usadas pelos anúncios ativos — extraído de creative.object_story_spec.page_id / effective_object_story_id.">
                    <p className="text-lg font-bold font-data leading-none text-blue-400">{pages.toLocaleString("pt-BR")}</p>
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">Fanpages em uso</p>
                    {(noPage > 0 || last) && (
                      <p className="text-[9px] text-muted-foreground/60 mt-1">
                        {noPage > 0 ? `${noPage} sem page_id` : ""}
                        {noPage > 0 && last ? " · " : ""}
                        {last ? `sync ${last}` : ""}
                      </p>
                    )}
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      </div>

      {/* ──────────── Distribuição por Fase (F1/F2/F3) ──────────── */}
      {phaseSummary.length > 0 && (
        <div>
          <SectionHeader title="Distribuição por Fase" icon={Layers} right="F1 · F2 · F3 (por nomenclatura)" />
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5 md:gap-3">
            {phaseSummary.map((s) => {
              const barColorMap: Record<string, string> = {
                F1: "bg-blue-500",
                F2: "bg-amber-500",
                F3: "bg-emerald-500",
                OUTRO: "bg-muted-foreground/50",
              };
              const accentMap: Record<string, string> = {
                F1: "border-blue-500/30",
                F2: "border-amber-500/30",
                F3: "border-emerald-500/30",
                OUTRO: "border-border",
              };
              const textAccent: Record<string, string> = {
                F1: "text-blue-400",
                F2: "text-amber-400",
                F3: "text-emerald-400",
                OUTRO: "text-muted-foreground",
              };
              const labelMap: Record<string, string> = {
                F1: "F1 · Teste Criativo",
                F2: "F2 · Pré-escala",
                F3: "F3 · Escala",
                OUTRO: "Sem fase definida",
              };
              const barColor = barColorMap[s.phase] ?? "bg-muted-foreground/50";
              const borderColor = accentMap[s.phase] ?? "border-border";
              const labelColor = textAccent[s.phase] ?? "text-muted-foreground";
              const roasColor = s.roas >= 1.2 ? "text-wr-positive" : s.roas >= 1 ? "text-foreground" : "text-destructive";

              return (
                <Card key={s.phase} className={`bg-card border ${borderColor}`}>
                  <CardContent className="p-4 space-y-3">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-semibold ${labelColor}`}>{labelMap[s.phase]}</span>
                        <Badge variant="outline" className={`text-[8px] px-1.5 py-0 ${healthColors[s.health]}`}>{s.health}</Badge>
                      </div>
                      <span className={`text-lg font-bold font-data ${labelColor}`}>{s.spendPct.toFixed(0)}%</span>
                    </div>

                    {/* Progress bar */}
                    <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-secondary/50">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ease-out ${barColor}`}
                        style={{ width: `${Math.min(s.spendPct, 100)}%` }}
                      />
                    </div>

                    {/* Metrics row */}
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground font-data">{s.campaigns} campanhas</span>
                      <span className="text-muted-foreground font-data">{fmt(s.spend, "currency")}</span>
                      <span className={`font-semibold font-data ${roasColor}`}>ROAS {fmt(s.roas, "roas")}</span>
                      <span className="text-muted-foreground font-data">CPA {fmt(s.cpa, "currency")}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}


      {/* ═══════════════════════════════════════════════════════════════
          2️⃣ CAMPANHAS LANÇADAS HOJE (por tag [DD.MM] na nomenclatura)
          ═══════════════════════════════════════════════════════════════ */}
      {(() => {
        // Use the selected date range end date for the tag (supports yesterday, custom, etc.)
        const [, endDate] = dateRange;
        const [yyyy, mm, dd] = endDate.split("-");
        const todayTag = `[${dd}.${mm}]`;
        const tagLabel = rangeKey === "today" ? "Hoje" : endDate;

        const launchedToday = allCampaigns.filter((r) => normalizeDateBrackets(r.fullName).includes(todayTag));
        if (launchedToday.length === 0) return null;

        // Totals for launched-today campaigns
        const ltSpend = launchedToday.reduce((s, c) => s + c.spend, 0);
        const ltRevenue = launchedToday.reduce((s, c) => s + c.revenue, 0);
        const ltConversions = launchedToday.reduce((s, c) => s + c.conversions, 0);
        const ltRoas = ltSpend > 0 ? ltRevenue / ltSpend : 0;
        const ltWithSales = launchedToday.filter((c) => c.conversions > 0).length;
        const ltAssertividade = launchedToday.length > 0 ? (ltWithSales / launchedToday.length) * 100 : 0;
        const ltRevenuePct = totalRevenue > 0 ? (ltRevenue / totalRevenue) * 100 : 0;

        return (
          <div>
            <SectionHeader title={`Lançadas ${tagLabel}`} icon={Flame} right={`${launchedToday.length} campanhas • tag ${todayTag}`} />

            {/* KPI Highlights */}
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 md:gap-3">
              <Card className="mobile-kpi-card bg-card border border-border/50">
                <CardContent className="px-5 py-4 md:p-3">
                  <p className="text-[13px] md:text-[9px] text-muted-foreground uppercase tracking-wider mb-1">% do Faturamento Total</p>
                  <p className="text-[28px] md:text-xl font-bold font-data leading-tight text-primary">{ltRevenuePct.toFixed(1)}%</p>
                  <p className="text-[10px] md:text-[9px] text-muted-foreground">{fmt(ltRevenue, "currency")} de {fmt(totalRevenue, "currency")}</p>
                </CardContent>
              </Card>
              <Card className="mobile-kpi-card bg-card border border-border/50">
                <CardContent className="px-5 py-4 md:p-3">
                  <p className="text-[13px] md:text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Taxa de Assertividade</p>
                  <p className={`text-[28px] md:text-xl font-bold font-data leading-tight ${ltAssertividade >= 30 ? "text-wr-positive" : ltAssertividade >= 15 ? "text-amber-400" : "text-destructive"}`}>{ltAssertividade.toFixed(0)}%</p>
                  <p className="text-[10px] md:text-[9px] text-muted-foreground">{ltWithSales} de {launchedToday.length} venderam</p>
                </CardContent>
              </Card>
              <Card className="mobile-kpi-card bg-card border border-border/50">
                <CardContent className="px-5 py-4 md:p-3">
                  <p className="text-[13px] md:text-[9px] text-muted-foreground uppercase tracking-wider mb-1">ROAS Consolidado</p>
                  <p className={`text-[28px] md:text-xl font-bold font-data leading-tight ${ltRoas >= 1 ? "text-wr-positive" : "text-destructive"}`}>{fmt(ltRoas, "roas")}</p>
                  <p className="text-[10px] md:text-[9px] text-muted-foreground">{fmt(ltSpend, "currency")} investido</p>
                </CardContent>
              </Card>
              <Card className="mobile-kpi-card bg-card border border-border/50">
                <CardContent className="px-5 py-4 md:p-3">
                  <p className="text-[13px] md:text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Conversões</p>
                  <p className="text-[28px] md:text-xl font-bold font-data leading-tight">{ltConversions}</p>
                  <p className="text-[10px] md:text-[9px] text-muted-foreground">{ltWithSales} campanhas convertendo</p>
                </CardContent>
              </Card>
            </div>

            <LancadasHojeTable campaigns={launchedToday} ltSpend={ltSpend} ltRevenue={ltRevenue} ltRoas={ltRoas} ltConversions={ltConversions} />
          </div>
        );
      })()}


      {/* Removido drill tabs daqui pois foram migradas para o Pacing Controller */}
      




      {/* ──────────── Tabela Geral ──────────── */}
      <div>
        <div className="bg-[#08080C] px-6 py-5 border-x border-border/50 flex flex-col gap-4">
          <SectionHeader title="Status da Campanha" icon={BarChart3} right={activeTab === "campaigns" ? `${filtered.length} itens` : undefined} />
        </div>


        {/* Filtro rápido: Ativas / Pausadas / Todas */}
        <div className="bg-[#08080C] px-6 pb-6 border-x border-border/50 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { value: "all", label: "Todas" },
              { value: "ACTIVE", label: "Ativas" },
              { value: "PAUSED", label: "Pausadas" },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => setStatusFilter(opt.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                  statusFilter === opt.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground border-border hover:text-foreground hover:border-foreground/30"
                }`}
              >
                {opt.label}
                <span className="ml-1.5 font-data">
                  {opt.value === "all" ? allCampaigns.length : opt.value === "ACTIVE" ? activeCampaigns : pausedCampaigns}
                </span>
              </button>
            ))}
          </div>

          <MetaAdsActionsMenu 
            selectionCount={activeTab === "campaigns" ? selectedCampaignIds.length : activeTab === "adsets" ? selectedAdsetIds.length : 0} 
            onAction={(action) => {
              console.log("Action triggered:", action);
              const count = activeTab === "campaigns" ? selectedCampaignIds.length : selectedAdsetIds.length;
              const target = activeTab === "campaigns" ? "campanhas" : "conjuntos";
              
              if (action === "kill") {
                toast.warning(`Confirmar: Matar ${count} ${target}?`, {
                  description: "Serão pausadas e renomeadas top -> xxx.",
                  action: {
                    label: "☠️ Confirmar",
                    onClick: () => toast.success(`${count} ${target} matadas com sucesso.`)
                  }
                });
              } else {
                toast.info(`Ação "${action}" disparada para ${count} ${target}.`);
              }
            }} 
          />
        </div>

        {/* ─── Resumo agregado do filtro ─── */}
        {(searchText.trim() || selectedCampaignIds.length > 0 || selectedAdsetIds.length > 0) && (() => {
          const items = activeTab === "campaigns" ? filtered : activeTab === "adsets" ? (adsetsData || []) : (adsData || []);
          if (items.length === 0) return null;

          const fSpend = items.reduce((s: number, r: any) => s + (r.spend || r.gasto || 0), 0);
          const fRevenue = items.reduce((s: number, r: any) => s + (r.revenue || r.faturamento || 0), 0);
          const fConversions = items.reduce((s: number, r: any) => s + (r.conversions || r.vendas || 0), 0);
          const fRoas = fSpend > 0 ? fRevenue / fSpend : 0;
          const fProfit = fRevenue - fSpend;
          const fCpa = fConversions > 0 ? fSpend / fConversions : 0;
          const fActive = items.filter((r: any) => r.status === "ACTIVE").length;

          return (
            <Card className="mt-0 bg-[#0C0C12] border-x border-b border-primary/20 rounded-none shadow-lg">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Activity className="h-3.5 w-3.5 text-primary" />
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-primary">
                    Resumo {activeTab === "campaigns" ? "Campanhas" : activeTab === "adsets" ? "Conjuntos" : "Anúncios"}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    — {items.length} itens ({fActive} ativos)
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 text-center">
                  <div className="rounded-lg bg-secondary/30 p-2.5">
                    <p className="text-sm sm:text-base font-bold font-data">{fmt(fSpend, "currency")}</p>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wide mt-0.5">Investido</p>
                  </div>
                  <div className="rounded-lg bg-secondary/30 p-2.5">
                    <p className="text-sm sm:text-base font-bold font-data text-wr-positive">{fmt(fRevenue, "currency")}</p>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wide mt-0.5">Receita</p>
                  </div>
                  <div className="rounded-lg bg-secondary/30 p-2.5">
                    <p className={`text-sm sm:text-base font-bold font-data ${fProfit >= 0 ? "text-wr-positive" : "text-destructive"}`}>{fmt(fProfit, "currency")}</p>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wide mt-0.5">Lucro</p>
                  </div>
                  <div className="rounded-lg bg-secondary/30 p-2.5">
                    <p className={`text-sm sm:text-base font-bold font-data ${fRoas >= 1 ? "text-wr-positive" : "text-destructive"}`}>{fmt(fRoas, "roas")}</p>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wide mt-0.5">ROAS</p>
                  </div>
                  <div className="rounded-lg bg-secondary/30 p-2.5">
                    <p className="text-sm sm:text-base font-bold font-data">{fConversions}</p>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wide mt-0.5">Conversões</p>
                  </div>
                  <div className="rounded-lg bg-secondary/30 p-2.5">
                    <p className="text-sm sm:text-base font-bold font-data">{fCpa > 0 ? fmt(fCpa, "currency") : "—"}</p>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wide mt-0.5">CPA</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })()}

        <Card className="mt-0 bg-card border border-border rounded-t-none border-t-0 shadow-xl overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                      {activeTab === "campaigns" ? "Campanha" : activeTab === "adsets" ? "Conjunto" : "Anúncio"}
                    </TableHead>
                    {activeTab !== "campaigns" && (
                      <>
                        <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                          {activeTab === "adsets" ? "Campanha" : "Preview"}
                        </TableHead>
                        <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                          {activeTab === "adsets" ? "Conta" : "Conjunto"}
                        </TableHead>
                        {activeTab === "ads" && (
                          <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Campanha</TableHead>
                        )}
                      </>
                    )}
                    {activeTab === "campaigns" && (
                      <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-center">Fase</TableHead>
                    )}
                    <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-center">Status</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-center">Decisão</TableHead>
                    {activeTab === "adsets" && (
                      <SortHeader label="Orçamento" sortKey="spend" />
                    )}
                    <SortHeader label="Gasto" sortKey="spend" />
                    <SortHeader label="Receita" sortKey="revenue" />
                    <SortHeader label="ROAS" sortKey="roas" />
                    <SortHeader label="CTR" sortKey="ctr" />
                    <SortHeader label="Conversões" sortKey="conversions" />
                    <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-right">IC</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeTab === "campaigns" && (
                    filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-xs text-muted-foreground py-8">
                          Nenhuma campanha encontrada
                        </TableCell>
                      </TableRow>
                    ) : (
                      filtered.map((row, i) => {
                        const isSelected = selectedCampaignIds.includes(row.fullName); // fullName used as identifier here
                        const decision = computeDecision(row);
                        return (
                          <TableRow 
                            key={i} 
                            className={`border-border cursor-pointer transition-colors ${isSelected ? "bg-primary/5 border-l-2 border-l-primary" : ""}`}
                            onClick={(e) => {
                              // If clicking on row (not a button/link), toggle selection
                              if ((e.target as HTMLElement).tagName === "TD") {
                                setSelectedCampaignIds(prev => 
                                  prev.includes(row.fullName) 
                                    ? prev.filter(id => id !== row.fullName) 
                                    : [...prev, row.fullName]
                                );
                              }
                            }}
                          >
                            <TableCell className="text-xs font-medium max-w-[280px] whitespace-normal break-all" title={row.fullName}>{row.name}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline" className={`text-[9px] font-medium ${structureColors[row.structure]}`}>{structureLabels[row.structure]}</Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <MetaStatusBadge effStatus={(row as any).effStatus} status={row.status} updatedAt={(row as any).statusUpdatedAt} />
                            </TableCell>
                            <TableCell className="text-center">
                              <span className={`text-[10px] font-semibold ${decision.color}`}>{decision.emoji} {decision.score}</span>
                            </TableCell>
                            <TableCell className="text-xs font-data text-right">{fmt(row.orcamento || 0, "currency")}</TableCell>
                            <TableCell className="text-xs font-data text-right">{fmt(row.spend, "currency")}</TableCell>
                            <TableCell className="text-xs font-data text-right text-wr-positive">{fmt(row.revenue, "currency")}</TableCell>
                            <TableCell className={`text-xs font-data text-right font-medium ${row.roas >= 1.2 ? "text-wr-positive" : row.roas >= 1 ? "text-foreground" : "text-destructive"}`}>{fmt(row.roas, "roas")}</TableCell>
                            <TableCell className="text-xs font-data text-right">{fmt(row.ctr, "percent")}</TableCell>
                            <TableCell className="text-xs font-data text-right">{row.conversions}</TableCell>
                            <TableCell className="text-xs font-data text-right">—</TableCell>
                          </TableRow>
                        );
                      })
                    )
                  )}
                  {activeTab === "adsets" && (
                    !adsetsData || adsetsData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={25} className="text-center text-xs text-muted-foreground py-8">
                          Nenhum conjunto encontrado
                        </TableCell>
                      </TableRow>
                    ) : (
                      adsetsData.map((row, i) => {
                        const isSelected = selectedAdsetIds.includes(row.id);
                        return (
                          <TableRow 
                            key={row.id || i} 
                            className={`border-border cursor-pointer transition-colors ${isSelected ? "bg-primary/5 border-l-2 border-l-primary" : ""}`}
                            onClick={(e) => {
                              if ((e.target as HTMLElement).tagName === "TD") {
                                setSelectedAdsetIds(prev => 
                                  prev.includes(row.id) 
                                    ? prev.filter(id => id !== row.id) 
                                    : [...prev, row.id]
                                );
                              }
                            }}
                          >
                          <TableCell className="text-xs font-medium max-w-[280px] whitespace-normal break-all">{row.name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{row.campaign_name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">{row.account_name}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className={`text-[9px] font-medium ${
                              row.status === "ACTIVE" ? "border-wr-positive/30 text-wr-positive bg-wr-positive/5"
                                : "border-muted-foreground/30 text-muted-foreground"
                            }`}>
                              {row.status === "ACTIVE" ? "Ativa" : "Pausada"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs font-data text-right">{fmt(row.orcamento, "currency")}</TableCell>
                          <TableCell className="text-xs font-data text-right">{fmt(row.gasto, "currency")}</TableCell>
                          <TableCell className="text-xs font-data text-right text-wr-positive">{fmt(row.faturamento, "currency")}</TableCell>
                          <TableCell className={`text-xs font-data text-right font-medium ${row.roas >= 1.2 ? "text-wr-positive" : row.roas >= 1 ? "text-foreground" : "text-destructive"}`}>{fmt(row.roas, "roas")}</TableCell>
                          <TableCell className="text-xs font-data text-right">{fmt(row.ctr, "percent")}</TableCell>
                          <TableCell className="text-xs font-data text-right">{row.vendas}</TableCell>
                          <TableCell className="text-xs font-data text-right">{row.ic}</TableCell>
                          </TableRow>
                        );
                      })
                    )
                  )}
                  {activeTab === "ads" && (
                    !adsData || adsData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={25} className="text-center text-xs text-muted-foreground py-8">
                          Nenhum anúncio encontrado
                        </TableCell>
                      </TableRow>
                    ) : (
                      adsData.map((row, i) => {
                        return (
                          <TableRow 
                            key={row.id || i} 
                            className="border-border cursor-default"
                          >
                          <TableCell className="text-xs font-medium max-w-[280px] whitespace-normal break-all">
                            {row.name}
                            {row.hook_name && <span className="ml-1 text-muted-foreground">[{row.hook_name}]</span>}
                          </TableCell>
                          <TableCell className="text-center">
                            {row.thumbnail_url ? (
                              <img 
                                src={row.thumbnail_url} 
                                alt="preview" 
                                className="h-10 w-10 object-cover rounded-md mx-auto cursor-zoom-in hover:scale-110 transition-transform" 
                                onClick={() => {
                                  // Simple preview logic or modal
                                  toast.info("Visualização ampliada disponível em breve");
                                }}
                              />
                            ) : (
                              <div className="h-10 w-10 bg-secondary rounded-md flex items-center justify-center mx-auto">
                                <Activity className="h-4 w-4 text-muted-foreground/30" />
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">{row.adset_name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">{row.campaign_name}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className={`text-[9px] font-medium ${
                              row.status === "ACTIVE" ? "border-wr-positive/30 text-wr-positive bg-wr-positive/5"
                                : "border-muted-foreground/30 text-muted-foreground"
                            }`}>
                              {row.status === "ACTIVE" ? "Ativa" : "Pausada"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs font-data text-right">{fmt(row.gasto, "currency")}</TableCell>
                          <TableCell className="text-xs font-data text-right text-wr-positive">{fmt(row.faturamento, "currency")}</TableCell>
                          <TableCell className={`text-xs font-data text-right font-medium ${row.roas >= 1.2 ? "text-wr-positive" : row.roas >= 1 ? "text-foreground" : "text-destructive"}`}>{fmt(row.roas, "roas")}</TableCell>
                          <TableCell className="text-xs font-data text-right">{fmt(row.ctr, "percent")}</TableCell>
                          <TableCell className="text-xs font-data text-right">{row.vendas}</TableCell>
                          <TableCell className="text-xs font-data text-right">{row.ic}</TableCell>
                          </TableRow>
                        );
                      })
                    )
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>




    </div>
  );
}
