import { useState, useMemo, useRef, useCallback, useEffect, memo } from "react";
import {
  Brain, RefreshCw, Loader2, Search, Filter, Layers,
  ArrowUpDown, Sparkles, Columns3, Eye, EyeOff, Sun, Moon,
  LayoutGrid, XCircle, MoveHorizontal, Crosshair, CheckSquare,
} from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useGtxMetaData, GTX_DECISION_CONFIG, type GtxCampaignRow, type GtxDecision } from "@/hooks/useGtxMetaData";
import { structureLabels, structureColors, type CampaignStructure } from "@/lib/formatNames";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { GtxCampaignDrawer } from "@/components/gtx/GtxCampaignDrawer";
import { GtxMobileCampaignCard } from "@/components/gtx/GtxMobileCampaignCard";
import { useGtxAudit } from "@/hooks/useGtxAudit";
import { GtxAuditBadge } from "@/components/gtx/GtxAuditPanel";
import { DataHealthWidget } from "@/components/gtx/DataHealthWidget";
import { useDataHealth } from "@/hooks/useDataHealth";

// ─── Helpers ───────────────────────────────────────────────────────────
function fmt(v: number, type: "currency" | "number" | "percent" | "roas") {
  if (type === "currency") return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
  if (type === "number") return new Intl.NumberFormat("pt-BR").format(Math.round(v));
  if (type === "percent") return `${v.toFixed(2).replace(".", ",")}%`;
  if (type === "roas") return `${v.toFixed(2).replace(".", ",")}x`;
  return String(v);
}

type SortKey = "scoreGtx" | "spend" | "revenue" | "roas" | "profit" | "profit3DTotal" | "salesConfirmed" | "ctr" | "cpc" | "cpm" | "budget" | "impressions" | "clicks" | "ic" | "purchasesMeta" | "roi";

// ── Performance indicator ring (SVG) ───────────────────────────────
function PerfRing({ score }: { score: number }) {
  const r = 8;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  const offset = circ - (pct / 100) * circ;
  const color = pct >= 70 ? "hsl(var(--chart-2))" : pct >= 40 ? "hsl(var(--chart-4))" : "hsl(var(--muted-foreground) / 0.4)";
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" className="shrink-0">
      <circle cx="11" cy="11" r={r} fill="none" stroke="hsl(var(--muted-foreground) / 0.1)" strokeWidth="2.5" />
      <circle cx="11" cy="11" r={r} fill="none" stroke={color} strokeWidth="2.5"
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" transform="rotate(-90 11 11)" className="transition-all duration-500" />
    </svg>
  );
}

// ── Institutional decision colors (hedge-fund palette) ─────────────
const DECISION_STYLE: Record<GtxDecision, { dot: string; text: string; bg: string }> = {
  ESCALAR:       { dot: "bg-[#00c27a]", text: "text-[#00c27a]", bg: "bg-[#00c27a]/10 border-[#00c27a]/30" },
  PROMOVER:      { dot: "bg-[#38bdf8]", text: "text-[#38bdf8]", bg: "bg-[#38bdf8]/10 border-[#38bdf8]/30" },
  MANTER:        { dot: "bg-[#6b9bd2]", text: "text-[#6b9bd2]", bg: "bg-[#6b9bd2]/10 border-[#6b9bd2]/30" },
  OBSERVAR:      { dot: "bg-[#e2b93b]", text: "text-[#e2b93b]", bg: "bg-[#e2b93b]/10 border-[#e2b93b]/30" },
  CORTAR:        { dot: "bg-[#c0392b]", text: "text-[#c0392b]", bg: "bg-[#c0392b]/10 border-[#c0392b]/30" },
};

// Sticky cell classes — MUST use opaque backgrounds to prevent bleed-through
const STICKY_BG = "bg-[hsl(var(--background))]";
const STICKY_BG_CARD = "bg-[hsl(var(--card))]";
const STICKY_STATUS = `sticky left-0 z-20 ${STICKY_BG}`;
const STICKY_STATUS_HEAD = `sticky left-0 z-30 ${STICKY_BG_CARD}`;
const STATUS_COL_W = 44;

// ─── Column definitions ───────────────────────────────────────────────
type ColumnKey = "phase" | "account" | "budget" | "spend" | "impressions" | "cpm" | "ctr" | "clicks" | "cpc" | "ic" | "cpa" | "purchasesMeta" | "revenue" | "roas" | "profit" | "profit3D" | "roi" | "margin" | "salesConfirmed" | "3d" | "scoreGtx" | "decision";

const COLUMN_DEFS: { key: ColumnKey; label: string; group: string; defaultVisible: boolean; defaultWidth: number; blockStart?: boolean }[] = [
  { key: "phase", label: "Fase", group: "Identificação", defaultVisible: false, defaultWidth: 100 },
  { key: "account", label: "Conta", group: "Identificação", defaultVisible: true, defaultWidth: 85 },
  { key: "budget", label: "Orçamento", group: "Entrega", defaultVisible: true, defaultWidth: 90, blockStart: true },
  { key: "spend", label: "Gasto", group: "Entrega", defaultVisible: true, defaultWidth: 90 },
  { key: "impressions", label: "Impressões", group: "Entrega", defaultVisible: true, defaultWidth: 80 },
  { key: "cpm", label: "CPM", group: "Entrega", defaultVisible: true, defaultWidth: 75 },
  { key: "ctr", label: "CTR", group: "Entrega", defaultVisible: true, defaultWidth: 65 },
  { key: "clicks", label: "Cliques", group: "Entrega", defaultVisible: true, defaultWidth: 70 },
  { key: "cpc", label: "CPC", group: "Entrega", defaultVisible: true, defaultWidth: 75 },
  { key: "ic", label: "IC", group: "Entrega", defaultVisible: false, defaultWidth: 55 },
  { key: "cpa", label: "CPA", group: "Conversão", defaultVisible: true, defaultWidth: 80, blockStart: true },
  { key: "purchasesMeta", label: "Compras Meta", group: "Conversão", defaultVisible: false, defaultWidth: 75 },
  { key: "revenue", label: "Faturamento", group: "Conversão", defaultVisible: true, defaultWidth: 95 },
  { key: "roas", label: "ROAS", group: "Financeiro", defaultVisible: true, defaultWidth: 65, blockStart: true },
  { key: "profit", label: "Lucro", group: "Financeiro", defaultVisible: true, defaultWidth: 95 },
  { key: "profit3D", label: "Lucro 3D", group: "Financeiro", defaultVisible: true, defaultWidth: 105 },
  { key: "roi", label: "ROI", group: "Financeiro", defaultVisible: false, defaultWidth: 65 },
  { key: "margin", label: "Margem", group: "Financeiro", defaultVisible: true, defaultWidth: 65 },
  { key: "salesConfirmed", label: "Vendas", group: "Financeiro", defaultVisible: true, defaultWidth: 65 },
  { key: "3d", label: "3D", group: "IA", defaultVisible: true, defaultWidth: 50, blockStart: true },
  { key: "scoreGtx", label: "Score", group: "IA", defaultVisible: true, defaultWidth: 80 },
  { key: "decision", label: "Decisão", group: "IA", defaultVisible: true, defaultWidth: 115 },
];

const DEFAULT_VISIBLE = new Set(COLUMN_DEFS.filter((c) => c.defaultVisible).map((c) => c.key));
const COLUMN_GROUPS = [...new Set(COLUMN_DEFS.map((c) => c.group))];

// ─── View Presets ──────────────────────────────────────────────────────
type ViewPreset = { label: string; cols: Set<ColumnKey> };

const VIEW_PRESETS: Record<string, ViewPreset> = {
  padrao: { label: "Padrão", cols: new Set(DEFAULT_VISIBLE) },
};

// ─── Decision indicator dot color for campaign rows ───────────────────
function getDecisionDotColor(decision: GtxDecision): string {
  switch (decision) {
    case "ESCALAR":
    case "PROMOVER":
    case "MANTER":
      return "bg-[#00c27a]"; // green
    case "OBSERVAR":
      return "bg-[#e2b93b]"; // yellow
    case "CORTAR":
      return "bg-[#c0392b]"; // red
    default:
      return "bg-muted-foreground/30";
  }
}

// ─── ROI color helper ─────────────────────────────────────────────────
function getRoiColor(roi: number): string {
  if (roi >= 80) return "text-[#00c27a]";       // > 1.8x ROAS equiv
  if (roi >= 30) return "text-[#e2b93b]";       // 1.3-1.8x
  if (roi > 0) return "text-foreground/70";
  return "text-[#c0392b]";
}

// ─── Main Component ────────────────────────────────────────────────────
export default function GtxMetaIA() {
  const { theme, toggleTheme } = useTheme();
  const isMobile = useIsMobile();
  const { campaigns, isLoading, syncNow, dataUpdatedAt, dates3D } = useGtxMetaData();
  const { overallStatus: healthStatus } = useDataHealth();

  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [phaseFilter, setPhaseFilter] = useState("all");
  const [decisionFilter, setDecisionFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");
  const [sortBy, setSortBy] = useState<SortKey>("scoreGtx");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [syncing, setSyncing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiDecisions, setAiDecisions] = useState<Map<string, { decisao: GtxDecision; motivo_curto: string; acao_recomendada: string }>>(new Map());
  const audit = useGtxAudit(campaigns, aiDecisions);
  const systemBlocked = healthStatus === "error";
  const [visibleCols, setVisibleCols] = useState<Set<ColumnKey>>(new Set(DEFAULT_VISIBLE));
  const [activeView, setActiveView] = useState("padrao");
  const [colSearch, setColSearch] = useState("");
  const [campW, setCampW] = useState(340);
  const [colWidths, setColWidths] = useState<Record<ColumnKey, number>>(() => {
    const w: Record<string, number> = {};
    for (const c of COLUMN_DEFS) w[c.key] = c.defaultWidth;
    return w as Record<ColumnKey, number>;
  });
  const dragRef = useRef<{ startX: number; startW: number; col: string | null } | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Drawer state
  const [drawerRow, setDrawerRow] = useState<GtxCampaignRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Selection state for bulk actions
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);

  const col = (key: ColumnKey) => visibleCols.has(key);

  // ── Horizontal scroll: mouse wheel always scrolls horizontally in table ──
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [scrollHintVisible, setScrollHintVisible] = useState(true);

  const updateScrollIndicators = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 5);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 5);
  }, []);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const handler = () => {
      setScrollHintVisible(false);
      updateScrollIndicators();
    };
    el.addEventListener("scroll", handler, { passive: true });
    requestAnimationFrame(updateScrollIndicators);
    return () => {
      el.removeEventListener("scroll", handler);
    };
  }, [updateScrollIndicators]);

  const onDragStart = useCallback((e: React.MouseEvent, colKey?: ColumnKey) => {
    e.preventDefault();
    e.stopPropagation();
    const startW = colKey ? colWidths[colKey] : campW;
    dragRef.current = { startX: e.clientX, startW, col: colKey ?? null };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const diff = ev.clientX - dragRef.current.startX;
      const newW = Math.max(40, Math.min(800, dragRef.current.startW + diff));
      if (dragRef.current.col) {
        setColWidths(prev => ({ ...prev, [dragRef.current!.col!]: newW }));
      } else {
        setCampW(newW);
      }
    };
    const onUp = () => {
      dragRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [campW, colWidths]);

  const toggleCol = (key: ColumnKey) => {
    setActiveView("custom");
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const applyPreset = (presetKey: string) => {
    const preset = VIEW_PRESETS[presetKey];
    if (preset) {
      setVisibleCols(new Set(preset.cols));
      setActiveView(presetKey);
    }
  };

  // ── Selection helpers ──
  const toggleRowSelection = useCallback((fullName: string) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(fullName)) next.delete(fullName); else next.add(fullName);
      return next;
    });
  }, []);

  const toggleAllSelection = useCallback(() => {
    if (selectedRows.size === filtered.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(filtered.map(r => r.fullName)));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRows.size]);

  // ── Available projects & accounts ──
  const projects = useMemo(() => {
    const set = new Set<string>();
    for (const r of campaigns) if (r.project && r.project !== "OUTROS") set.add(r.project);
    return Array.from(set).sort();
  }, [campaigns]);

  const accounts = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of campaigns) if (r.accountId) map.set(r.accountId, r.accountName);
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [campaigns]);

  // ── Filter & Sort ──
  const filtered = useMemo(() => {
    // Show any campaign with spend, sales, traffic OR active status — matches
    // the global "Dashboard View Rules" (Spend > R$1 OR active OR has sales).
    let rows = campaigns.filter(
      (r) => r.spend > 0 || r.salesConfirmed > 0 || r.status === "ACTIVE" || r.impressions > 0,
    );
    if (showSelectedOnly && selectedRows.size > 0) rows = rows.filter((r) => selectedRows.has(r.fullName));
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      rows = rows.filter((r) => r.fullName.toLowerCase().includes(q) || r.creativeId.toLowerCase().includes(q));
    }
    if (statusFilter !== "all") rows = rows.filter((r) => r.status === statusFilter);
    if (phaseFilter !== "all") rows = rows.filter((r) => r.phase === phaseFilter);
    if (projectFilter !== "all") rows = rows.filter((r) => r.project === projectFilter);
    if (accountFilter !== "all") rows = rows.filter((r) => r.accountId === accountFilter);
    if (decisionFilter !== "all") {
      rows = rows.filter((r) => {
        const dec = aiDecisions.get(r.fullName)?.decisao ?? r.gtxDecision;
        return dec === decisionFilter;
      });
    }
    rows.sort((a, b) => sortDir === "desc" ? (b[sortBy] as number) - (a[sortBy] as number) : (a[sortBy] as number) - (b[sortBy] as number));
    return rows;
  }, [campaigns, searchText, statusFilter, phaseFilter, projectFilter, accountFilter, decisionFilter, sortBy, sortDir, aiDecisions, showSelectedOnly, selectedRows]);

  // Update toggleAllSelection dependency
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const memoToggleAll = useCallback(() => {
    if (selectedRows.size === filtered.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(filtered.map(r => r.fullName)));
    }
  }, [selectedRows.size, filtered]);

  // ── Totals ──
  const totals = useMemo(() => {
    const t = { spend: 0, revenue: 0, profit: 0, salesConfirmed: 0, impressions: 0, clicks: 0, budget: 0 };
    for (const r of filtered) {
      t.spend += r.spend; t.revenue += r.revenue; t.profit += r.profit;
      t.salesConfirmed += r.salesConfirmed; t.impressions += r.impressions;
      t.clicks += r.clicks; t.budget += r.budget;
    }
    return {
      ...t,
      roas: t.spend > 0 ? t.revenue / t.spend : 0,
      roi: t.spend > 0 ? ((t.revenue - t.spend) / t.spend) * 100 : 0,
      margin: t.revenue > 0 ? ((t.revenue - t.spend) / t.revenue) * 100 : 0,
      cpm: t.impressions > 0 ? (t.spend / t.impressions) * 1000 : 0,
      ctr: t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0,
      cpc: t.clicks > 0 ? t.spend / t.clicks : 0,
      cpaPaid: t.salesConfirmed > 0 ? t.spend / t.salesConfirmed : 0,
    };
  }, [filtered]);

  // ── Decision counts ──
  const decisionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of campaigns) {
      const dec = aiDecisions.get(r.fullName)?.decisao ?? r.gtxDecision ?? "OBSERVAR";
      counts[dec] = (counts[dec] ?? 0) + 1;
    }
    return counts;
  }, [campaigns, aiDecisions]);

  // ── Top 3 profit rows for subtle glow ──
  const top3ProfitNames = useMemo(() => {
    const sorted = [...filtered].filter(r => r.profit > 0).sort((a, b) => b.profit - a.profit);
    return new Set(sorted.slice(0, 3).map(r => r.fullName));
  }, [filtered]);

  function toggleSort(key: SortKey) {
    if (sortBy === key) setSortDir((d) => d === "desc" ? "asc" : "desc");
    else { setSortBy(key); setSortDir("desc"); }
  }

  async function handleSync() {
    setSyncing(true);
    try { await syncNow(); toast.success("Dados atualizados"); }
    catch { toast.error("Erro ao sincronizar"); }
    finally { setSyncing(false); }
  }

  async function handleAnalyze() {
    if (filtered.length === 0) { toast.error("Nenhuma campanha para analisar"); return; }
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke("gtx-ai-analyze", {
        body: { campaigns: filtered.slice(0, 50) },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }
      const decisions = data?.decisions ?? [];
      const map = new Map<string, any>();
      let overridden = 0;
      for (const d of decisions) {
        const match = filtered.find((r) =>
          r.displayName.includes(d.campaign_name?.substring(0, 30)) ||
          d.campaign_name?.includes(r.displayName.substring(0, 30))
        );
        if (match) {
          let decisao = d.decisao as GtxDecision;
          let motivo = d.motivo_curto;
          let acao = d.acao_recomendada;
          if (decisao === "CORTAR" && match.profit > 0 && match.roas >= 1.30) {
            decisao = "MANTER";
            motivo = "Lucrativa (override segurança)";
            acao = "Manter — lucro positivo";
            overridden++;
          }
          map.set(match.fullName, { decisao, motivo_curto: motivo, acao_recomendada: acao });
        }
      }
      setAiDecisions(map);

      // Log decisions to gtx_decisions_log
      const logEntries = Array.from(map.entries()).map(([fullName, d]) => {
        const row = filtered.find((r) => r.fullName === fullName);
        return {
          campaign_id: fullName,
          campaign_name: row?.displayName ?? fullName.substring(0, 80),
          fase: row?.phase ?? "",
          roas_3d: Number((row?.roas3D ?? 0).toFixed(2)),
          lucro_3d: Number((row?.profit3DTotal ?? 0).toFixed(2)),
          vendas_3d: row?.sales3D?.reduce((a: number, b: number) => a + b, 0) ?? 0,
          decisao: d.decisao,
          motivo: d.motivo_curto,
          versao_engine: "v2.0-ai",
          is_financial_valid: !(row && row.revenue === 0 && row.salesConfirmed > 0),
        };
      });
      if (logEntries.length > 0) {
        supabase.from("gtx_decisions_log" as any).insert(logEntries).then(() => {});
      }

      if (overridden > 0) toast.info(`${overridden} decisão(ões) corrigida(s): campanhas lucrativas não podem ser cortadas`);
      toast.success(`IA analisou ${decisions.length} campanhas`);
    } catch (err: any) {
      toast.error(err.message || "Erro na análise");
    } finally { setAnalyzing(false); }
  }

  const openDrawer = (row: GtxCampaignRow) => {
    setDrawerRow(row);
    setDrawerOpen(true);
  };

  const lastUpdate = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : null;

  // Column search filter
  const filteredColDefs = colSearch.trim()
    ? COLUMN_DEFS.filter(c => c.label.toLowerCase().includes(colSearch.toLowerCase()) || c.group.toLowerCase().includes(colSearch.toLowerCase()))
    : COLUMN_DEFS;

  // Drawer decision for selected row
  const drawerDecision = drawerRow ? (aiDecisions.get(drawerRow.fullName)?.decisao ?? drawerRow.gtxDecision ?? "OBSERVAR") as GtxDecision : null;
  const drawerReason = drawerRow ? (aiDecisions.get(drawerRow.fullName)?.motivo_curto ?? drawerRow.gtxReason ?? "") : "";
  const drawerAction = drawerRow ? (aiDecisions.get(drawerRow.fullName)?.acao_recomendada ?? drawerRow.gtxAction ?? "") : "";

  if (isMobile) {
    return (
      <div className="space-y-3 px-1 pb-24">
        {/* ── Mobile Header ── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            <div>
              <h1 className="text-sm font-bold tracking-widest uppercase text-foreground/90">META IA</h1>
              <p className="text-[8px] text-muted-foreground/50 font-mono">{filtered.length} campanhas</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="default" size="sm" onClick={handleAnalyze} disabled={analyzing || isLoading} className="h-7 gap-1 text-[9px] font-mono px-2">
              {analyzing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              IA
            </Button>
            <Button variant="ghost" size="sm" onClick={handleSync} disabled={syncing} className="h-7 px-2">
              {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3 text-muted-foreground" />}
            </Button>
          </div>
        </div>

        {/* ── Mobile Search ── */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40" />
          <Input
            placeholder="Buscar campanha..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="h-8 pl-9 text-[10px] font-mono rounded-xl bg-card border-border/20"
          />
        </div>

        {/* ── Mobile Filters — horizontal scroll ── */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-7 min-w-[75px] text-[9px] font-mono border-border/20 bg-card rounded-xl shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Status</SelectItem>
              <SelectItem value="ACTIVE" className="text-xs">Ativas</SelectItem>
              <SelectItem value="PAUSED" className="text-xs">Pausadas</SelectItem>
            </SelectContent>
          </Select>
          <Select value={phaseFilter} onValueChange={setPhaseFilter}>
            <SelectTrigger className="h-7 min-w-[80px] text-[9px] font-mono border-border/20 bg-card rounded-xl shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Fase</SelectItem>
              <SelectItem value="TESTE" className="text-xs">Teste</SelectItem>
              <SelectItem value="PRÉ ESCALA" className="text-xs">Pré Escala</SelectItem>
              <SelectItem value="ESCALA" className="text-xs">Escala</SelectItem>
            </SelectContent>
          </Select>
          <Select value={decisionFilter} onValueChange={setDecisionFilter}>
            <SelectTrigger className="h-7 min-w-[90px] text-[9px] font-mono border-border/20 bg-card rounded-xl shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Decisão</SelectItem>
              {(Object.keys(GTX_DECISION_CONFIG) as GtxDecision[]).map((d) => (
                <SelectItem key={d} value={d} className="text-xs">{GTX_DECISION_CONFIG[d].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={accountFilter} onValueChange={setAccountFilter}>
            <SelectTrigger className="h-7 min-w-[85px] text-[9px] font-mono border-border/20 bg-card rounded-xl shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Conta</SelectItem>
              {accounts.map(([id, name]) => (
                <SelectItem key={id} value={id} className="text-xs">{name.substring(0, 18)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* ── Mobile Decision Chips ── */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {(Object.keys(GTX_DECISION_CONFIG) as GtxDecision[]).map((d) => {
            const cfg = GTX_DECISION_CONFIG[d];
            const count = decisionCounts[d] ?? 0;
            const isActive = decisionFilter === d;
            return (
              <button
                key={d}
                onClick={() => setDecisionFilter(decisionFilter === d ? "all" : d)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full border text-[9px] font-mono whitespace-nowrap shrink-0 transition-all ${
                  isActive ? "border-border bg-card text-foreground" : "border-transparent text-muted-foreground/60"
                }`}
              >
                <div className={`h-1.5 w-1.5 rounded-full ${DECISION_STYLE[d].dot}`} />
                <span className="font-bold">{count}</span>
                <span className="opacity-60">{cfg.label}</span>
              </button>
            );
          })}
        </div>

        {/* ── Mobile Campaign Cards ── */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-primary/40" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-xs text-muted-foreground/50">Nenhuma campanha</div>
        ) : (
          <div className="space-y-2.5">
            {filtered.map((row) => {
              const aiDec = aiDecisions.get(row.fullName);
              const decision = (aiDec?.decisao ?? row.gtxDecision ?? "OBSERVAR") as GtxDecision;
              const reason = aiDec?.motivo_curto ?? row.gtxReason ?? "";
              return (
                <GtxMobileCampaignCard
                  key={row.fullName}
                  row={row}
                  decision={decision}
                  reason={reason}
                  onClick={() => openDrawer(row)}
                />
              );
            })}
          </div>
        )}

        <GtxCampaignDrawer
          row={drawerRow}
          decision={drawerDecision}
          reason={drawerReason}
          action={drawerAction}
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
        />
      </div>
    );
  }

  return (
    <div className="full-width-page space-y-0 overflow-x-hidden">
      {/* ════════════════════════════════════════════════════════════
          0️⃣ RESUMO EXECUTIVO — Confiança e ações rápidas
          ════════════════════════════════════════════════════════════ */}
      {campaigns.length > 0 && !isLoading && (() => {
        const escalarCount = decisionCounts["ESCALAR"] ?? 0;
        const promoverCount = decisionCounts["PROMOVER"] ?? 0;
        const cortarCount = decisionCounts["CORTAR"] ?? 0;
        const manterCount = decisionCounts["MANTER"] ?? 0;
        const observarCount = decisionCounts["OBSERVAR"] ?? 0;
        const totalProfit3D = filtered.reduce((s, r) => s + (r.profit3DTotal ?? 0), 0);
        const totalProfit = filtered.reduce((s, r) => s + r.profit, 0);
        const profitable = filtered.filter(r => r.profit > 0).length;
        const negative = filtered.filter(r => r.profit < 0 && r.spend > 0).length;

        // Data confidence
        const minutesSinceUpdate = dataUpdatedAt ? Math.floor((Date.now() - dataUpdatedAt) / 60000) : 999;
        const campaignsWithFullData = filtered.filter(r => r.spend > 0).length;
        const dataConfidence = minutesSinceUpdate <= 5 ? "high" : minutesSinceUpdate <= 15 ? "medium" : "low";
        const confidenceConfig = {
          high: { label: "Dados confiáveis", dot: "bg-wr-positive", text: "text-wr-positive" },
          medium: { label: "Dados parciais", dot: "bg-amber-400", text: "text-amber-400" },
          low: { label: "Dados desatualizados", dot: "bg-destructive", text: "text-destructive" },
        }[dataConfidence];

        // Top 3 urgent actions
        const urgentActions: { label: string; color: string; emoji: string }[] = [];
        if (escalarCount > 0) urgentActions.push({ label: `${escalarCount} campanha${escalarCount > 1 ? "s" : ""} pronta${escalarCount > 1 ? "s" : ""} para escalar`, color: "text-wr-positive", emoji: "🚀" });
        if (cortarCount > 0) urgentActions.push({ label: `${cortarCount} campanha${cortarCount > 1 ? "s" : ""} para cortar (prejuízo)`, color: "text-destructive", emoji: "✂️" });
        if (negative > 3) urgentActions.push({ label: `${negative} campanhas com lucro negativo`, color: "text-amber-400", emoji: "⚠️" });
        if (promoverCount > 0) urgentActions.push({ label: `${promoverCount} pronta${promoverCount > 1 ? "s" : ""} para promoção de fase`, color: "text-[#38bdf8]", emoji: "📈" });

        return (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 px-1 py-3 border-b border-border">
            {/* KPI Summary */}
            <div className="flex items-center gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">Lucro Período</p>
                <p className={`text-xl font-bold font-data ${totalProfit >= 0 ? "text-wr-positive" : "text-destructive"}`}>
                  {fmt(totalProfit, "currency")}
                </p>
              </div>
              <div className="w-px h-10 bg-border" />
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">Lucro 3D</p>
                <p className={`text-xl font-bold font-data ${totalProfit3D >= 0 ? "text-wr-positive" : "text-destructive"}`}>
                  {fmt(totalProfit3D, "currency")}
                </p>
              </div>
              <div className="w-px h-10 bg-border" />
              <div className="text-center">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">Saúde</p>
                <p className="text-sm font-data">
                  <span className="text-wr-positive font-semibold">{profitable}</span>
                  <span className="text-muted-foreground/50 mx-1">/</span>
                  <span className="text-destructive font-semibold">{negative}</span>
                </p>
              </div>
            </div>

            {/* Urgent Actions */}
            <div className="space-y-1">
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-semibold">Ações Prioritárias</p>
              {urgentActions.slice(0, 3).map((a, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="text-xs">{a.emoji}</span>
                  <span className={`text-[11px] font-medium ${a.color}`}>{a.label}</span>
                </div>
              ))}
              {urgentActions.length === 0 && (
                <span className="text-[11px] text-muted-foreground italic">Nenhuma ação urgente</span>
              )}
            </div>

            {/* Data Confidence */}
            <div className="flex items-center gap-3 justify-end">
              <div className="text-right">
                <div className="flex items-center gap-1.5 justify-end">
                  <div className={`h-2 w-2 rounded-full ${confidenceConfig.dot}`} />
                  <span className={`text-[11px] font-medium ${confidenceConfig.text}`}>{confidenceConfig.label}</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {minutesSinceUpdate < 999 ? `Atualizado ${minutesSinceUpdate}min atrás` : "Sem dados"}
                  {" · "}{campaignsWithFullData} campanhas com gasto
                </p>
              </div>
              <GtxAuditBadge audit={audit} />
            </div>
          </div>
        );
      })()}

      {/* ════════════════════════════════════════════════════════════
          1️⃣ HEADER — Meta Ads Manager toolbar style
          ════════════════════════════════════════════════════════════ */}
      <div className="flex items-center justify-between py-2 px-1 border-b border-border">
        <div className="flex items-center gap-4">
          <h1 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Brain className="h-4.5 w-4.5 text-primary" />
            Meta IA
          </h1>
          <span className="text-sm text-muted-foreground">
            {campaigns.length} campanhas
          </span>
          <DataHealthWidget />
          {lastUpdate && (
            <span className="text-xs text-muted-foreground">
              Atualizado {lastUpdate}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={handleAnalyze}
            disabled={analyzing || isLoading || systemBlocked}
            className="h-9 gap-2 text-sm font-medium px-4 rounded-md"
            title={systemBlocked ? "Sistema com inconsistência. Verificar antes de operar." : undefined}
          >
            {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Decisão IA
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={syncing}
            className="h-9 gap-2 text-sm font-medium px-3 rounded-md"
          >
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Atualizar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleTheme}
            className="h-9 w-9 p-0 rounded-md"
            title={theme === "dark" ? "Modo claro" : "Modo escuro"}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* ── System Blocked Warning ── */}
      {systemBlocked && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 mt-2">
          <XCircle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-[11px] text-destructive font-medium">
            ⛔ Sistema com inconsistência detectada. Verificar GTX Data Health antes de operar.
          </p>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          2️⃣ BARRA DE FILTROS — Horizontal, Ads Manager style
          ════════════════════════════════════════════════════════════ */}
      <div className="flex items-center gap-2 py-2 px-1 border-b border-border flex-wrap">
        <div className="relative flex-shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar campanha..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="h-9 w-[240px] pl-9 text-sm rounded-md border-border bg-background"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-[110px] text-sm rounded-md border-border bg-background">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="ACTIVE">Ativas</SelectItem>
            <SelectItem value="PAUSED">Pausadas</SelectItem>
          </SelectContent>
        </Select>

        <Select value={phaseFilter} onValueChange={setPhaseFilter}>
          <SelectTrigger className="h-9 w-[120px] text-sm rounded-md border-border bg-background">
            <SelectValue placeholder="Fase" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as fases</SelectItem>
            <SelectItem value="TESTE">Teste</SelectItem>
            <SelectItem value="PRÉ ESCALA">Pré Escala</SelectItem>
            <SelectItem value="ESCALA">Escala</SelectItem>
          </SelectContent>
        </Select>

        <Select value={accountFilter} onValueChange={setAccountFilter}>
          <SelectTrigger className="h-9 w-[130px] text-sm rounded-md border-border bg-background">
            <SelectValue placeholder="Conta" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as contas</SelectItem>
            {accounts.map(([id, name]) => (
              <SelectItem key={id} value={id}>{name.substring(0, 22)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="h-9 w-[120px] text-sm rounded-md border-border bg-background">
            <SelectValue placeholder="Produto" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os produtos</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={decisionFilter} onValueChange={setDecisionFilter}>
          <SelectTrigger className="h-9 w-[130px] text-sm rounded-md border-border bg-background">
            <SelectValue placeholder="Decisão" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as decisões</SelectItem>
            {(Object.keys(GTX_DECISION_CONFIG) as GtxDecision[]).map((d) => (
              <SelectItem key={d} value={d}>
                {GTX_DECISION_CONFIG[d].label}
                {decisionCounts[d] ? ` (${decisionCounts[d]})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedRows.size > 0 && (
          <Button
            variant={showSelectedOnly ? "default" : "outline"}
            size="sm"
            className="h-9 gap-1.5 text-sm rounded-md px-3"
            onClick={() => setShowSelectedOnly((v) => !v)}
          >
            <CheckSquare className="h-3.5 w-3.5" />
            {selectedRows.size} selecionada{selectedRows.size > 1 ? "s" : ""}
          </Button>
        )}

        <div className="flex-1" />

        {/* Column Configurator */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5 text-sm rounded-md px-3">
              <Columns3 className="h-4 w-4" />
              Colunas
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">{visibleCols.size}</Badge>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[280px] p-3" align="end">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">Colunas</span>
                <div className="flex gap-2">
                  <button onClick={() => applyPreset("padrao")} className="text-xs text-primary hover:underline">Padrão</button>
                  <button onClick={() => { setVisibleCols(new Set(COLUMN_DEFS.map(c => c.key))); setActiveView("custom"); }} className="text-xs text-primary hover:underline">Todas</button>
                </div>
              </div>
              <Input
                placeholder="Buscar coluna..."
                value={colSearch}
                onChange={(e) => setColSearch(e.target.value)}
                className="h-8 text-sm"
              />
              {COLUMN_GROUPS.map((group) => {
                const groupCols = filteredColDefs.filter((c) => c.group === group);
                if (groupCols.length === 0) return null;
                return (
                  <div key={group}>
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{group}</span>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 mt-1.5">
                      {groupCols.map((c) => (
                        <label key={c.key} className="flex items-center gap-2 cursor-pointer">
                          <Checkbox checked={visibleCols.has(c.key)} onCheckedChange={() => toggleCol(c.key)} className="h-3.5 w-3.5" />
                          <span className="text-sm text-foreground">{c.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>

        <span className="text-sm text-muted-foreground">
          {filtered.length}/{campaigns.length}
        </span>
      </div>

      {/* ════════════════════════════════════════════════════════════
          3️⃣ BARRA DE MÉTRICAS RESUMO — Decision chips (clickable)
          ════════════════════════════════════════════════════════════ */}
      <div className="flex items-center gap-1.5 py-1.5 px-1 overflow-x-auto border-b border-border">
        {(Object.keys(GTX_DECISION_CONFIG) as GtxDecision[]).map((d) => {
          const cfg = GTX_DECISION_CONFIG[d];
          const count = decisionCounts[d] ?? 0;
          const st = DECISION_STYLE[d];
          const isActive = decisionFilter === d;
          return (
            <button
              key={d}
              onClick={() => setDecisionFilter(decisionFilter === d ? "all" : d)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-all ${
                isActive
                  ? `bg-primary/10 text-primary border border-primary/20`
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <div className={`h-2 w-2 rounded-full ${st.dot}`} />
              <span className="font-semibold">{count}</span>
              <span>{cfg.label}</span>
            </button>
          );
        })}
      </div>

      {/* ════════════════════════════════════════════════════════════
          4️⃣ TABELA DE CAMPANHAS — Enhanced UX
          ════════════════════════════════════════════════════════════ */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-primary/40" />
        </div>
      ) : (
        <GtxVirtualTable
          filtered={filtered}
          campaigns={campaigns}
          aiDecisions={aiDecisions}
          top3ProfitNames={top3ProfitNames}
          totals={totals}
          col={col}
          colWidths={colWidths}
          campW={campW}
          sortBy={sortBy}
          toggleSort={toggleSort}
          onDragStart={onDragStart}
          openDrawer={openDrawer}
          visibleCols={visibleCols}
          scrollContainerRef={scrollContainerRef}
          canScrollLeft={canScrollLeft}
          canScrollRight={canScrollRight}
          scrollHintVisible={scrollHintVisible}
          setScrollHintVisible={setScrollHintVisible}
          selectedRows={selectedRows}
          toggleRowSelection={toggleRowSelection}
          toggleAllSelection={memoToggleAll}
        />
      )}

      {/* ════════════════════════════════════════════════════════════
          5️⃣ BARRA DE AÇÃO EM MASSA — Bottom bar on selection
          ════════════════════════════════════════════════════════════ */}
      {selectedRows.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border shadow-2xl">
          <div className="max-w-[1800px] mx-auto px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckSquare className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-foreground">
                {selectedRows.size} campanha{selectedRows.size > 1 ? "s" : ""} selecionada{selectedRows.size > 1 ? "s" : ""}
              </span>
              <button
                onClick={() => setSelectedRows(new Set())}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                Limpar
              </button>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" className="h-8 gap-1.5 bg-[#00c27a] hover:bg-[#00c27a]/90 text-white">
                <span className="text-xs font-medium">Escalar</span>
              </Button>
              <Button size="sm" variant="outline" className="h-8 gap-1.5 border-[#e2b93b]/40 text-[#e2b93b] hover:bg-[#e2b93b]/10">
                <span className="text-xs font-medium">Pausar</span>
              </Button>
              <Button size="sm" variant="outline" className="h-8 gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10">
                <span className="text-xs font-medium">Cortar</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── FAB: Ir para Decisão ── */}
      {filtered.length > 0 && canScrollRight && selectedRows.size === 0 && (
        <button
          className="gtx-fab-decision"
          onClick={() => {
            const el = scrollContainerRef.current;
            if (el) {
              el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
              setScrollHintVisible(false);
            }
          }}
          title="Ir para Decisão GTX"
        >
          <div className="flex items-center gap-1.5 bg-primary/90 hover:bg-primary text-primary-foreground rounded-full px-3.5 py-2 shadow-lg transition-all hover:scale-105 active:scale-95">
            <Crosshair className="h-3.5 w-3.5" />
            <span className="text-[10px] font-mono font-semibold">Decisão</span>
          </div>
        </button>
      )}

      {/* ── Campaign Detail Drawer ─────────────────────────── */}
      <GtxCampaignDrawer
        row={drawerRow}
        decision={drawerDecision}
        reason={drawerReason}
        action={drawerAction}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </div>
  );
}

// ─── Memoized Virtual Table ───────────────────────────────────────────
interface GtxVirtualTableProps {
  filtered: GtxCampaignRow[];
  campaigns: GtxCampaignRow[];
  aiDecisions: Map<string, { decisao: GtxDecision; motivo_curto: string; acao_recomendada: string }>;
  top3ProfitNames: Set<string>;
  totals: any;
  col: (key: ColumnKey) => boolean;
  colWidths: Record<ColumnKey, number>;
  campW: number;
  sortBy: SortKey;
  toggleSort: (key: SortKey) => void;
  onDragStart: (e: React.MouseEvent, colKey?: ColumnKey) => void;
  openDrawer: (row: GtxCampaignRow) => void;
  visibleCols: Set<ColumnKey>;
  scrollContainerRef: React.RefObject<HTMLDivElement>;
  canScrollLeft: boolean;
  canScrollRight: boolean;
  scrollHintVisible: boolean;
  setScrollHintVisible: (v: boolean) => void;
  selectedRows: Set<string>;
  toggleRowSelection: (fullName: string) => void;
  toggleAllSelection: () => void;
}

const ROW_HEIGHT = 44;

const GtxVirtualTable = memo(function GtxVirtualTable({
  filtered, campaigns, aiDecisions, top3ProfitNames, totals, col, colWidths, campW, sortBy,
  toggleSort, onDragStart, openDrawer, visibleCols, scrollContainerRef,
  canScrollLeft, canScrollRight, scrollHintVisible, setScrollHintVisible,
  selectedRows, toggleRowSelection, toggleAllSelection,
}: GtxVirtualTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const totalsScrollRef = useRef<HTMLDivElement>(null);
  const [footerRect, setFooterRect] = useState<{ left: number; width: number }>({ left: 0, width: 0 });
  const [footerScrollWidth, setFooterScrollWidth] = useState(1200);

  const stickyLeft = `${STATUS_COL_W}px`;
  const cellPy = "py-2";

  // Measure real table viewport/scroll width for perfect fixed-footer column alignment
  useEffect(() => {
    const measure = () => {
      const el = parentRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setFooterRect((prev) => (prev.left === rect.left && prev.width === rect.width ? prev : { left: rect.left, width: rect.width }));
      setFooterScrollWidth(el.scrollWidth);

      if (totalsScrollRef.current) {
        totalsScrollRef.current.scrollLeft = el.scrollLeft;
      }
    };

    measure();
    const raf = requestAnimationFrame(measure);
    const ro = new ResizeObserver(measure);
    if (parentRef.current) ro.observe(parentRef.current);
    window.addEventListener("resize", measure);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [campW, colWidths, visibleCols, filtered.length]);

  // Sync main scroll → totals scroll
  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const handler = () => {
      if (totalsScrollRef.current) totalsScrollRef.current.scrollLeft = el.scrollLeft;
    };
    el.addEventListener("scroll", handler, { passive: true });
    return () => el.removeEventListener("scroll", handler);
  }, []);

  const ResizeHandle = ({ colKey }: { colKey?: ColumnKey }) => (
    <div
      onMouseDown={(e) => onDragStart(e, colKey)}
      className="w-1.5 cursor-col-resize absolute right-0 top-0 bottom-0 hover:bg-primary/20 active:bg-primary/40 transition-colors z-10"
    />
  );

  // Calculate visible columns min-width for table
  const tableMinWidth = useMemo(() => {
    let w = STATUS_COL_W + campW;
    for (const c of COLUMN_DEFS) {
      if (visibleCols.has(c.key)) w += colWidths[c.key];
    }
    return Math.max(w, 1200);
  }, [visibleCols, colWidths, campW]);

  const renderRow = useCallback((row: GtxCampaignRow, index: number) => {
    const aiDec = aiDecisions.get(row.fullName);
    const decision = (aiDec?.decisao ?? row.gtxDecision ?? "OBSERVAR") as GtxDecision;
    const reason = aiDec?.motivo_curto ?? row.gtxReason ?? "";
    const st = DECISION_STYLE[decision];
    const cfg = GTX_DECISION_CONFIG[decision] ?? GTX_DECISION_CONFIG.OBSERVAR;
    const isTop3 = top3ProfitNames.has(row.fullName);
    const isSelected = selectedRows.has(row.fullName);
    const decisionDot = getDecisionDotColor(decision);

    return (
      <TableRow
        key={row.fullName}
        className={`border-b border-border transition-colors group cursor-pointer ${
          isTop3 ? "shadow-[inset_0_0_20px_rgba(0,194,122,0.04)]" : ""
        } ${isSelected ? "bg-primary/5 hover:bg-primary/8" : "hover:bg-muted/50"}`}
        onClick={() => openDrawer(row)}
        style={{ height: ROW_HEIGHT }}
      >
        {/* Checkbox */}
        <TableCell className={`${cellPy} w-[${STATUS_COL_W}px] min-w-[${STATUS_COL_W}px] ${STICKY_STATUS} ${isSelected ? "!bg-primary/5" : ""}`} style={{ background: isSelected ? undefined : 'hsl(var(--background))' }}>
          <div className="flex items-center justify-center">
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => toggleRowSelection(row.fullName)}
              onClick={(e) => e.stopPropagation()}
              className="h-3.5 w-3.5"
            />
          </div>
        </TableCell>

        {/* Campaign Name — sticky with OPAQUE bg */}
        <TableCell style={{ left: stickyLeft, width: campW, minWidth: campW, maxWidth: campW, background: 'hsl(var(--background))' }} className={`${cellPy} sticky z-20 border-r border-border/10 overflow-hidden ${isSelected ? "!bg-primary/5" : ""}`}>
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 overflow-hidden cursor-default" onClick={(e) => e.stopPropagation()}>
                  {row.status === "ACTIVE" ? (
                    <div className="flex items-center shrink-0" title="Ativa">
                      <div className="w-[26px] h-[14px] rounded-full bg-[#00c27a] flex items-center justify-end px-[2px]">
                        <div className="w-[10px] h-[10px] rounded-full bg-white" />
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center shrink-0" title="Pausada">
                      <div className="w-[26px] h-[14px] rounded-full bg-muted-foreground/20 flex items-center justify-start px-[2px]">
                        <div className="w-[10px] h-[10px] rounded-full bg-muted-foreground/40" />
                      </div>
                    </div>
                  )}
                  <div className="flex flex-col gap-0 overflow-hidden min-w-0">
                    <span className="text-[13px] font-medium text-foreground truncate block leading-snug">
                      {row.displayName || row.fullName}
                    </span>
                    <span className="text-[11px] text-muted-foreground truncate block">
                      {row.creativeId !== "SEM_ID" ? row.creativeId : row.accountName}
                    </span>
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[450px] p-2.5">
                <p className="text-xs break-all">{row.fullName}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </TableCell>

        {/* Phase */}
        {col("phase") && (
        <TableCell
          className={`${cellPy} border-r border-border/10 ${isSelected ? "!bg-primary/5" : ""}`}
          style={{ width: colWidths.phase, minWidth: colWidths.phase }}
        >
          <span className="text-[10px] font-mono text-muted-foreground/70 uppercase tracking-wider whitespace-nowrap">
            {row.phase === "OUTRO" ? "—" : structureLabels[row.phase] ?? row.phase}
          </span>
        </TableCell>
        )}

        {/* Account */}
        {col("account") && (
        <TableCell className={cellPy}>
          <div className="flex items-center gap-1 max-w-[80px]">
            {row.accountStatus !== 1 && (
              <span className="shrink-0 inline-block w-2 h-2 rounded-full bg-destructive animate-pulse shadow-[0_0_4px_hsl(var(--destructive))]" />
            )}
            <span className={`text-[10px] font-mono truncate block ${row.accountStatus !== 1 ? "text-destructive/70" : "text-muted-foreground/60"}`} title={row.accountName}>
              {row.accountName.substring(0, 12)}
            </span>
          </div>
        </TableCell>
        )}

        {col("budget") && <TableCell className={`${cellPy} text-right border-l border-border/10`}><span className="text-[11px] font-data font-medium text-foreground/70">{row.budget > 0 ? fmt(row.budget, "currency") : "—"}</span></TableCell>}
        {col("spend") && <TableCell className={`${cellPy} text-right`}><span className="text-[11px] font-data font-medium text-foreground">{fmt(row.spend, "currency")}</span></TableCell>}
        {col("impressions") && <TableCell className={`${cellPy} text-right`}><span className="text-[11px] font-data font-medium text-foreground/70">{row.impressions > 0 ? fmt(row.impressions, "number") : "—"}</span></TableCell>}
        {col("cpm") && <TableCell className={`${cellPy} text-right`}><span className="text-[11px] font-data font-medium text-foreground/70">{fmt(row.cpm, "currency")}</span></TableCell>}
        {col("ctr") && <TableCell className={`${cellPy} text-right`}><span className="text-[11px] font-data font-medium text-foreground/70">{fmt(row.ctr, "percent")}</span></TableCell>}
        {col("clicks") && <TableCell className={`${cellPy} text-right`}><span className="text-[11px] font-data font-medium text-foreground/70">{row.clicks > 0 ? fmt(row.clicks, "number") : "—"}</span></TableCell>}
        {col("cpc") && <TableCell className={`${cellPy} text-right`}><span className="text-[11px] font-data font-medium text-foreground/70">{fmt(row.cpc, "currency")}</span></TableCell>}
        {col("ic") && <TableCell className={`${cellPy} text-right`}><span className="text-[11px] font-data font-medium text-foreground/70">{row.ic > 0 ? fmt(row.ic, "number") : "—"}</span></TableCell>}
        {col("cpa") && <TableCell className={`${cellPy} text-right border-l border-border/10`}><span className="text-[11px] font-data font-medium text-foreground/70">{row.cpaPaid > 0 ? fmt(row.cpaPaid, "currency") : "—"}</span></TableCell>}
        {col("purchasesMeta") && <TableCell className={`${cellPy} text-right`}><span className="text-[11px] font-data font-medium text-foreground/70">{row.purchasesMeta > 0 ? fmt(row.purchasesMeta, "number") : "—"}</span></TableCell>}
        {col("revenue") && <TableCell className={`${cellPy} text-right`}><span className="text-[11px] font-data font-medium text-foreground">{row.revenue > 0 ? fmt(row.revenue, "currency") : "—"}</span></TableCell>}

        {/* ROAS — color coded */}
        {col("roas") && <TableCell className={`${cellPy} text-right border-l border-border/10`}>
          <span className={`text-[11px] font-data font-medium ${
            row.roas >= 1.8 ? "text-[#00c27a]" : row.roas >= 1.3 ? "text-[#e2b93b]" : row.roas > 0 ? "text-[#c0392b]" : "text-muted-foreground/40"
          }`}>{row.roas > 0 ? fmt(row.roas, "roas") : "—"}</span>
        </TableCell>}

        {/* Profit */}
        {col("profit") && (
        <TableCell className={`${cellPy} text-right`}>
          <span className={`text-[11px] font-data font-medium ${row.profit > 0 ? "text-[#00c27a]" : row.profit < 0 ? "text-[#c0392b]" : "text-muted-foreground/40"}`}>
            {row.spend > 0 ? fmt(row.profit, "currency") : "—"}
          </span>
        </TableCell>
        )}
        {col("profit3D") && (
        <TableCell className={`${cellPy} text-right`}>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex flex-col items-end gap-0.5 cursor-help" onClick={(e) => e.stopPropagation()}>
                  <span className={`text-[11px] font-data font-medium ${row.profit3DTotal > 0 ? "text-[#00c27a]" : row.profit3DTotal < 0 ? "text-[#c0392b]" : "text-muted-foreground/40"}`}>
                    {fmt(row.profit3DTotal, "currency")}
                  </span>
                  <div className="flex items-center gap-px">
                    {row.profit3D.map((p, i) => (
                      <div key={i} className={`h-1.5 w-5 rounded-sm ${p > 0 ? "bg-[#00c27a]/50" : p < 0 ? "bg-[#c0392b]/25" : "bg-muted-foreground/10"}`} />
                    ))}
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="left" className="p-2 space-y-1">
                <p className="text-[10px] font-medium text-foreground">Lucro acumulado nos últimos 3 dias</p>
                {row.profit3D.map((p, i) => (
                  <p key={i} className={`text-[10px] font-data ${p > 0 ? "text-[#00c27a]" : p < 0 ? "text-[#c0392b]" : "text-muted-foreground"}`}>
                    D{i + 1}: {fmt(p, "currency")}
                  </p>
                ))}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </TableCell>
        )}

        {/* ROI — color coded */}
        {col("roi") && <TableCell className={`${cellPy} text-right`}>
          <span className={`text-[11px] font-data font-medium ${getRoiColor(row.roi)}`}>
            {row.spend > 0 ? fmt(row.roi, "percent") : "—"}
          </span>
        </TableCell>}

        {col("margin") && <TableCell className={`${cellPy} text-right`}><span className={`text-[11px] font-data font-medium ${row.margin > 0 ? "text-[#00c27a]" : row.margin < 0 ? "text-[#c0392b]" : "text-muted-foreground/40"}`}>{row.revenue > 0 ? fmt(row.margin, "percent") : "—"}</span></TableCell>}

        {/* Sales */}
        {col("salesConfirmed") && <TableCell className={`${cellPy} text-right`}><span className={`text-[11px] font-data font-medium ${row.salesConfirmed > 0 ? "text-foreground" : "text-muted-foreground/40"}`}>{row.salesConfirmed}</span></TableCell>}

        {col("3d") && (
        <TableCell className={`${cellPy} text-center border-l border-border/10`}>
          <div className="flex items-center justify-center gap-0.5">
            {row.sales3D.map((s, i) => (
              <div key={i} className={`h-2 w-2 rounded-full ${s > 0 ? "bg-[#00c27a]/70" : "bg-muted-foreground/10"}`} title={`D${i + 1}: ${s}`} />
            ))}
          </div>
        </TableCell>
        )}

        {col("scoreGtx") && (
        <TableCell className={`${cellPy} text-center`}>
          <div className="flex items-center gap-1 justify-center">
            <div className="flex gap-px">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className={`h-3 w-[3px] rounded-[1px] ${
                  i < Math.round(row.scoreGtx / 10)
                    ? row.scoreGtx >= 70 ? "bg-[#00c27a]/60" : row.scoreGtx >= 40 ? "bg-[#d4a843]/50" : "bg-muted-foreground/20"
                    : "bg-muted-foreground/8"
                }`} />
              ))}
            </div>
            <span className="text-[9px] font-data text-muted-foreground/50 w-5 text-right">{row.scoreGtx}</span>
          </div>
        </TableCell>
        )}

        {/* Decision — sticky right */}
        {col("decision") && (
        <TableCell className={`${cellPy} sticky right-0 z-20 border-l border-border/10 ${isSelected ? "!bg-primary/5" : ""}`} style={{ background: 'hsl(var(--background))' }}>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 cursor-help justify-center" onClick={(e) => e.stopPropagation()}>
                  <div className={`h-2 w-2 rounded-full shrink-0 ${st.dot}`} />
                  <span className={`text-[11px] font-data font-semibold ${st.text}`}>{cfg.label}</span>
                  {row.scaleOpportunity && <span className="text-[10px]" title="Oportunidade de Escala">🚀</span>}
                  {row.painLevel === "cortar" && <span className="text-[10px]" title="Queimando dinheiro">🔥</span>}
                  {row.painLevel === "risco" && <span className="text-[10px]" title="Índice de dor alto">⚠️</span>}
                </div>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-[240px] space-y-1 p-2.5">
                <p className={`text-xs font-semibold ${st.text}`}>{cfg.label}</p>
                <p className="text-[10px] text-muted-foreground">{reason}</p>
                <p className="text-[10px] font-medium text-foreground">→ {aiDec?.acao_recomendada ?? row.gtxAction ?? "—"}</p>
                {row.painIndex > 0 && (
                  <p className={`text-[9px] font-mono ${row.painLevel === "cortar" ? "text-destructive" : row.painLevel === "risco" ? "text-orange-400" : row.painLevel === "atenção" ? "text-yellow-400" : "text-muted-foreground/60"}`}>
                    Índice de dor: {row.painIndex.toFixed(1)} ({row.painLevel})
                  </p>
                )}
                {row.scaleOpportunity && (
                  <p className="text-[9px] font-mono text-emerald-400">🚀 Oportunidade de escala detectada</p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </TableCell>
        )}
      </TableRow>
    );
  }, [aiDecisions, top3ProfitNames, col, colWidths, campW, openDrawer, selectedRows, toggleRowSelection]);

  return (
    <div className="rounded-md border border-border overflow-hidden bg-card relative" style={{ maxWidth: '100%', width: '100%', fontVariantNumeric: 'tabular-nums' }}>
      <div
        ref={(el) => {
          (parentRef as any).current = el;
          if (scrollContainerRef && 'current' in scrollContainerRef) (scrollContainerRef as any).current = el;
        }}
        className={`overflow-x-auto overflow-y-visible gtx-scroll-container ${
          canScrollLeft && canScrollRight ? "gtx-scroll-shadow-both" : canScrollLeft ? "gtx-scroll-shadow-left" : canScrollRight ? "gtx-scroll-shadow-right" : ""
        }`}
        style={{ width: 0, minWidth: '100%' }}
        onMouseDown={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest("button, a, input, [role=checkbox]")) return;
          const el = parentRef.current;
          if (!el) return;
          const startX = e.pageX;
          const scrollL = el.scrollLeft;
          let moved = false;
          const onMove = (ev: MouseEvent) => {
            const diff = ev.pageX - startX;
            if (Math.abs(diff) > 3) { moved = true; setScrollHintVisible(false); }
            el.scrollLeft = scrollL - diff;
          };
          const onUp = () => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
            if (moved) {
              const blocker = (ev: MouseEvent) => { ev.stopPropagation(); ev.preventDefault(); };
              el.addEventListener("click", blocker, { capture: true, once: true });
            }
          };
          document.addEventListener("mousemove", onMove);
          document.addEventListener("mouseup", onUp);
        }}
      >
        <table className="border-collapse" style={{ minWidth: tableMinWidth, width: "max-content" }}>
          {/* ── Sticky Header ── */}
          <thead className="gtx-virtual-header">
            <tr className="border-b border-border" style={{ background: 'hsl(var(--muted))' }}>
              {/* Checkbox + Status header */}
              <th className={`text-[9px] w-[${STATUS_COL_W}px] min-w-[${STATUS_COL_W}px] py-2.5 ${STICKY_STATUS_HEAD}`}>
                <Checkbox
                  checked={selectedRows.size === filtered.length && filtered.length > 0}
                  onCheckedChange={toggleAllSelection}
                  className="h-3.5 w-3.5 ml-1"
                />
              </th>
              <th style={{ left: stickyLeft, width: campW, minWidth: campW, maxWidth: campW, background: 'hsl(var(--muted))' }} className="text-xs font-semibold text-muted-foreground sticky z-30 border-r border-border relative py-2.5 text-left pl-3 overflow-hidden">
                <span>Campanha</span>
                <ResizeHandle />
              </th>
              {col("phase") && (
                <th
                  className="text-xs font-semibold text-muted-foreground whitespace-nowrap relative border-r border-border py-2.5 text-left pl-2"
                  style={{ width: colWidths.phase, minWidth: colWidths.phase }}
                >
                  Fase
                  <ResizeHandle colKey="phase" />
                </th>
              )}
              {col("account") && <th className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-semibold whitespace-nowrap relative py-2.5 text-left" style={{ width: colWidths.account, minWidth: colWidths.account }}>Conta<ResizeHandle colKey="account" /></th>}
              {col("budget") && <th className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-semibold cursor-pointer hover:text-foreground select-none whitespace-nowrap text-right relative py-2.5 border-l border-border/15" style={{ width: colWidths.budget, minWidth: colWidths.budget }} onClick={() => toggleSort("budget")}><span className="inline-flex items-center gap-0.5">Orçam.<ArrowUpDown className={`h-2.5 w-2.5 ${sortBy === "budget" ? "text-primary" : "opacity-30"}`} /></span><ResizeHandle colKey="budget" /></th>}
              {col("spend") && <th className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-semibold cursor-pointer hover:text-foreground select-none whitespace-nowrap text-right relative py-2.5" style={{ width: colWidths.spend, minWidth: colWidths.spend }} onClick={() => toggleSort("spend")}><span className="inline-flex items-center gap-0.5">Gasto<ArrowUpDown className={`h-2.5 w-2.5 ${sortBy === "spend" ? "text-primary" : "opacity-30"}`} /></span><ResizeHandle colKey="spend" /></th>}
              {col("impressions") && <th className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-semibold cursor-pointer hover:text-foreground select-none whitespace-nowrap text-right relative py-2.5" style={{ width: colWidths.impressions, minWidth: colWidths.impressions }} onClick={() => toggleSort("impressions")}><span className="inline-flex items-center gap-0.5">Impr.<ArrowUpDown className={`h-2.5 w-2.5 ${sortBy === "impressions" ? "text-primary" : "opacity-30"}`} /></span><ResizeHandle colKey="impressions" /></th>}
              {col("cpm") && <th className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-semibold cursor-pointer hover:text-foreground select-none whitespace-nowrap text-right relative py-2.5" style={{ width: colWidths.cpm, minWidth: colWidths.cpm }} onClick={() => toggleSort("cpm")}><span className="inline-flex items-center gap-0.5">CPM<ArrowUpDown className={`h-2.5 w-2.5 ${sortBy === "cpm" ? "text-primary" : "opacity-30"}`} /></span><ResizeHandle colKey="cpm" /></th>}
              {col("ctr") && <th className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-semibold cursor-pointer hover:text-foreground select-none whitespace-nowrap text-right relative py-2.5" style={{ width: colWidths.ctr, minWidth: colWidths.ctr }} onClick={() => toggleSort("ctr")}><span className="inline-flex items-center gap-0.5">CTR<ArrowUpDown className={`h-2.5 w-2.5 ${sortBy === "ctr" ? "text-primary" : "opacity-30"}`} /></span><ResizeHandle colKey="ctr" /></th>}
              {col("clicks") && <th className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-semibold cursor-pointer hover:text-foreground select-none whitespace-nowrap text-right relative py-2.5" style={{ width: colWidths.clicks, minWidth: colWidths.clicks }} onClick={() => toggleSort("clicks")}><span className="inline-flex items-center gap-0.5">Cliques<ArrowUpDown className={`h-2.5 w-2.5 ${sortBy === "clicks" ? "text-primary" : "opacity-30"}`} /></span><ResizeHandle colKey="clicks" /></th>}
              {col("cpc") && <th className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-semibold cursor-pointer hover:text-foreground select-none whitespace-nowrap text-right relative py-2.5" style={{ width: colWidths.cpc, minWidth: colWidths.cpc }} onClick={() => toggleSort("cpc")}><span className="inline-flex items-center gap-0.5">CPC<ArrowUpDown className={`h-2.5 w-2.5 ${sortBy === "cpc" ? "text-primary" : "opacity-30"}`} /></span><ResizeHandle colKey="cpc" /></th>}
              {col("ic") && <th className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-semibold cursor-pointer hover:text-foreground select-none whitespace-nowrap text-right relative py-2.5" style={{ width: colWidths.ic, minWidth: colWidths.ic }} onClick={() => toggleSort("ic")}><span className="inline-flex items-center gap-0.5">IC<ArrowUpDown className={`h-2.5 w-2.5 ${sortBy === "ic" ? "text-primary" : "opacity-30"}`} /></span><ResizeHandle colKey="ic" /></th>}
              {col("cpa") && <th className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-semibold whitespace-nowrap relative py-2.5 text-right border-l border-border/15" style={{ width: colWidths.cpa, minWidth: colWidths.cpa }}>CPA<ResizeHandle colKey="cpa" /></th>}
              {col("purchasesMeta") && <th className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-semibold cursor-pointer hover:text-foreground select-none whitespace-nowrap text-right relative py-2.5" style={{ width: colWidths.purchasesMeta, minWidth: colWidths.purchasesMeta }} onClick={() => toggleSort("purchasesMeta")}><span className="inline-flex items-center gap-0.5">Compras<ArrowUpDown className={`h-2.5 w-2.5 ${sortBy === "purchasesMeta" ? "text-primary" : "opacity-30"}`} /></span><ResizeHandle colKey="purchasesMeta" /></th>}
              {col("revenue") && <th className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-semibold cursor-pointer hover:text-foreground select-none whitespace-nowrap text-right relative py-2.5" style={{ width: colWidths.revenue, minWidth: colWidths.revenue }} onClick={() => toggleSort("revenue")}><span className="inline-flex items-center gap-0.5">Fat.<ArrowUpDown className={`h-2.5 w-2.5 ${sortBy === "revenue" ? "text-primary" : "opacity-30"}`} /></span><ResizeHandle colKey="revenue" /></th>}
              {col("roas") && <th className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-semibold cursor-pointer hover:text-foreground select-none whitespace-nowrap text-right relative py-2.5 border-l border-border/15" style={{ width: colWidths.roas, minWidth: colWidths.roas }} onClick={() => toggleSort("roas")}><span className="inline-flex items-center gap-0.5">ROAS<ArrowUpDown className={`h-2.5 w-2.5 ${sortBy === "roas" ? "text-primary" : "opacity-30"}`} /></span><ResizeHandle colKey="roas" /></th>}
              {col("profit") && <th className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-semibold cursor-pointer hover:text-foreground select-none whitespace-nowrap text-right relative py-2.5" style={{ width: colWidths.profit, minWidth: colWidths.profit }} onClick={() => toggleSort("profit")}><span className="inline-flex items-center gap-0.5">Lucro<ArrowUpDown className={`h-2.5 w-2.5 ${sortBy === "profit" ? "text-primary" : "opacity-30"}`} /></span><ResizeHandle colKey="profit" /></th>}
              {col("profit3D") && <th className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-semibold cursor-pointer hover:text-foreground select-none whitespace-nowrap text-right relative py-2.5" style={{ width: colWidths.profit3D, minWidth: colWidths.profit3D }} onClick={() => toggleSort("profit3DTotal")}><span className="inline-flex items-center gap-0.5">Lucro 3D<ArrowUpDown className={`h-2.5 w-2.5 ${sortBy === "profit3DTotal" ? "text-primary" : "opacity-30"}`} /></span><ResizeHandle colKey="profit3D" /></th>}
              {col("roi") && <th className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-semibold cursor-pointer hover:text-foreground select-none whitespace-nowrap text-right relative py-2.5" style={{ width: colWidths.roi, minWidth: colWidths.roi }} onClick={() => toggleSort("roi")}><span className="inline-flex items-center gap-0.5">ROI<ArrowUpDown className={`h-2.5 w-2.5 ${sortBy === "roi" ? "text-primary" : "opacity-30"}`} /></span><ResizeHandle colKey="roi" /></th>}
              {col("margin") && <th className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-semibold whitespace-nowrap relative py-2.5 text-right" style={{ width: colWidths.margin, minWidth: colWidths.margin }}>Margem<ResizeHandle colKey="margin" /></th>}
              {col("salesConfirmed") && <th className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-semibold cursor-pointer hover:text-foreground select-none whitespace-nowrap text-right relative py-2.5" style={{ width: colWidths.salesConfirmed, minWidth: colWidths.salesConfirmed }} onClick={() => toggleSort("salesConfirmed")}><span className="inline-flex items-center gap-0.5">Vendas<ArrowUpDown className={`h-2.5 w-2.5 ${sortBy === "salesConfirmed" ? "text-primary" : "opacity-30"}`} /></span><ResizeHandle colKey="salesConfirmed" /></th>}
              {col("3d") && <th className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-semibold whitespace-nowrap relative py-2.5 text-center border-l border-border/15" style={{ width: colWidths["3d"], minWidth: colWidths["3d"] }}>3D<ResizeHandle colKey="3d" /></th>}
              {col("scoreGtx") && <th className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-semibold cursor-pointer hover:text-foreground select-none whitespace-nowrap text-center relative py-2.5" style={{ width: colWidths.scoreGtx, minWidth: colWidths.scoreGtx }} onClick={() => toggleSort("scoreGtx")}><span className="inline-flex items-center gap-0.5">Score<ArrowUpDown className={`h-2.5 w-2.5 ${sortBy === "scoreGtx" ? "text-primary" : "opacity-30"}`} /></span><ResizeHandle colKey="scoreGtx" /></th>}
              {col("decision") && (
                <th
                  className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-semibold whitespace-nowrap relative sticky right-0 z-30 border-l border-border/20 text-center py-2.5"
                  style={{ width: colWidths.decision, minWidth: colWidths.decision, background: 'hsl(var(--card))' }}
                  data-decision-col
                >
                  Decisão
                  <ResizeHandle colKey="decision" />
                </th>
              )}
            </tr>
          </thead>

          {/* ── Body ── */}
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={23} className="text-center text-sm text-muted-foreground/50 py-16">
                  Nenhuma campanha encontrada
                </td>
              </tr>
            ) : (
              filtered.map((row, i) => renderRow(row, i))
            )}
          </tbody>

        </table>
        {/* Spacer so last rows aren't hidden behind fixed footer */}
        <div className="h-14" />
      </div>

      {/* ── TOTALS — FIXED at viewport bottom like Meta Ads Manager ── */}
      {filtered.length > 0 && (
        <div
          ref={totalsScrollRef}
          className="fixed bottom-0 z-50 overflow-x-auto border-t-2 border-border bg-card shadow-[0_-4px_16px_rgba(0,0,0,0.3)] gtx-totals-footer-scroll"
          style={{ scrollbarWidth: 'none', left: footerRect.left, width: footerRect.width }}
          onScroll={() => {
            if (parentRef.current && totalsScrollRef.current) {
              parentRef.current.scrollLeft = totalsScrollRef.current.scrollLeft;
            }
          }}
        >
          <table className="border-collapse" style={{ minWidth: footerScrollWidth, width: footerScrollWidth }}>
            <tbody>
              <tr>
                <td className="py-3 sticky left-0 z-20" style={{ width: STATUS_COL_W, minWidth: STATUS_COL_W, background: 'hsl(var(--card))' }}></td>
                <td style={{ left: stickyLeft, width: campW, minWidth: campW, background: 'hsl(var(--card))' }} className="py-3 text-[11px] font-data font-semibold text-foreground sticky z-20 border-r border-border/10 pl-3">
                  Resultados de {filtered.length} campanhas
                </td>
                {col("phase") && <td className="py-3 border-r border-border/10" style={{ width: colWidths.phase, minWidth: colWidths.phase, background: 'hsl(var(--card))' }}></td>}
                {col("account") && <td className="py-3" style={{ width: colWidths.account, minWidth: colWidths.account, background: 'hsl(var(--card))' }}></td>}
                {col("budget") && <td className="py-3 text-right text-[11px] font-data font-semibold text-foreground/70 pr-2" style={{ width: colWidths.budget, minWidth: colWidths.budget, background: 'hsl(var(--card))' }}>{totals.budget > 0 ? fmt(totals.budget, "currency") : "—"}</td>}
                {col("spend") && <td className="py-3 text-right text-[11px] font-data font-semibold text-foreground pr-2" style={{ width: colWidths.spend, minWidth: colWidths.spend, background: 'hsl(var(--card))' }}>{fmt(totals.spend, "currency")}</td>}
                {col("impressions") && <td className="py-3 text-right text-[11px] font-data font-semibold text-foreground/70 pr-2" style={{ width: colWidths.impressions, minWidth: colWidths.impressions, background: 'hsl(var(--card))' }}>{fmt(totals.impressions, "number")}</td>}
                {col("cpm") && <td className="py-3 text-right text-[11px] font-data font-semibold text-foreground/70 pr-2" style={{ width: colWidths.cpm, minWidth: colWidths.cpm, background: 'hsl(var(--card))' }}>{fmt(totals.cpm, "currency")}</td>}
                {col("ctr") && <td className="py-3 text-right text-[11px] font-data font-semibold text-foreground/70 pr-2" style={{ width: colWidths.ctr, minWidth: colWidths.ctr, background: 'hsl(var(--card))' }}>{fmt(totals.ctr, "percent")}</td>}
                {col("clicks") && <td className="py-3 text-right text-[11px] font-data font-semibold text-foreground/70 pr-2" style={{ width: colWidths.clicks, minWidth: colWidths.clicks, background: 'hsl(var(--card))' }}>{fmt(totals.clicks, "number")}</td>}
                {col("cpc") && <td className="py-3 text-right text-[11px] font-data font-semibold text-foreground/70 pr-2" style={{ width: colWidths.cpc, minWidth: colWidths.cpc, background: 'hsl(var(--card))' }}>{fmt(totals.cpc, "currency")}</td>}
                {col("ic") && <td className="py-3 text-right text-[11px] font-data font-semibold text-foreground/40 pr-2" style={{ width: colWidths.ic, minWidth: colWidths.ic, background: 'hsl(var(--card))' }}>—</td>}
                {col("cpa") && <td className="py-3 text-right text-[11px] font-data font-semibold text-foreground/70 pr-2" style={{ width: colWidths.cpa, minWidth: colWidths.cpa, background: 'hsl(var(--card))' }}>{totals.cpaPaid > 0 ? fmt(totals.cpaPaid, "currency") : "—"}</td>}
                {col("purchasesMeta") && <td className="py-3 text-right text-[11px] font-data font-semibold text-foreground/40 pr-2" style={{ width: colWidths.purchasesMeta, minWidth: colWidths.purchasesMeta, background: 'hsl(var(--card))' }}>—</td>}
                {col("revenue") && <td className="py-3 text-right text-[11px] font-data font-semibold text-foreground pr-2" style={{ width: colWidths.revenue, minWidth: colWidths.revenue, background: 'hsl(var(--card))' }}>{fmt(totals.revenue, "currency")}</td>}
                {col("roas") && <td className="py-3 text-right text-[11px] font-data font-semibold text-foreground pr-2" style={{ width: colWidths.roas, minWidth: colWidths.roas, background: 'hsl(var(--card))' }}>{totals.roas > 0 ? fmt(totals.roas, "roas") : "—"}</td>}
                {col("profit") && <td className={`py-3 text-right text-[11px] font-data font-semibold pr-2 ${totals.profit > 0 ? "text-[#00c27a]" : totals.profit < 0 ? "text-[#c0392b]" : "text-foreground"}`} style={{ width: colWidths.profit, minWidth: colWidths.profit, background: 'hsl(var(--card))' }}>{fmt(totals.profit, "currency")}</td>}
                {col("profit3D") && <td className="py-3" style={{ width: colWidths.profit3D, minWidth: colWidths.profit3D, background: 'hsl(var(--card))' }}></td>}
                {col("roi") && <td className={`py-3 text-right text-[11px] font-data font-semibold pr-2 ${totals.roi > 0 ? "text-[#00c27a]" : totals.roi < 0 ? "text-[#c0392b]" : "text-foreground"}`} style={{ width: colWidths.roi, minWidth: colWidths.roi, background: 'hsl(var(--card))' }}>{fmt(totals.roi, "percent")}</td>}
                {col("margin") && <td className={`py-3 text-right text-[11px] font-data font-semibold pr-2 ${totals.margin > 0 ? "text-[#00c27a]" : totals.margin < 0 ? "text-[#c0392b]" : "text-foreground"}`} style={{ width: colWidths.margin, minWidth: colWidths.margin, background: 'hsl(var(--card))' }}>{fmt(totals.margin, "percent")}</td>}
                {col("salesConfirmed") && <td className="py-3 text-right text-[11px] font-data font-semibold text-foreground pr-2" style={{ width: colWidths.salesConfirmed, minWidth: colWidths.salesConfirmed, background: 'hsl(var(--card))' }}>{totals.salesConfirmed}</td>}
                {col("3d") && <td className="py-3" style={{ width: colWidths["3d"], minWidth: colWidths["3d"], background: 'hsl(var(--card))' }}></td>}
                {col("scoreGtx") && <td className="py-3" style={{ width: colWidths.scoreGtx, minWidth: colWidths.scoreGtx, background: 'hsl(var(--card))' }}></td>}
                {col("decision") && <td className="py-3 sticky right-0 z-20 border-l border-border/10" style={{ width: colWidths.decision, minWidth: colWidths.decision, background: 'hsl(var(--card))' }}></td>}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Scroll hint overlay */}
      {scrollHintVisible && canScrollRight && (
        <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center animate-fade-out-delayed">
          <div className="flex items-center gap-2 bg-card/90 backdrop-blur-sm border border-border/30 rounded-full px-4 py-2 shadow-lg pointer-events-auto cursor-pointer"
            onClick={() => setScrollHintVisible(false)}
          >
            <MoveHorizontal className="h-3.5 w-3.5 text-primary animate-pulse" />
            <span className="text-[10px] font-mono text-muted-foreground">Arraste ou role para ver mais</span>
          </div>
        </div>
      )}
    </div>
  );
});
