import { useState, useMemo, useEffect, Fragment } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Package, Plus, Search, ArrowUpDown, Eye, Pencil, Archive, Loader2,
  ChevronDown, X, Save, Trash2, Filter, Flame, AlertTriangle, Sparkles,
  Columns3, LayoutGrid, Rows3, Download, Skull, Radar, List,
} from "lucide-react";
import { OfferCard } from "@/components/offers/OfferCard";
import { format, parseISO, differenceInDays } from "date-fns";
import { toast } from "sonner";
import { OfferDetailDrawer } from "@/components/offers/OfferDetailDrawer";
import { OfferWizardDialog } from "@/components/offers/OfferWizardDialog";
import { OfferStatusChangeDialog } from "@/components/offers/OfferStatusChangeDialog";
import { OffersInsightsBanner } from "@/components/offers/OffersInsightsBanner";
import { OffersPortfolioSummary } from "@/components/offers/OffersPortfolioSummary";
import { OfferSparkline } from "@/components/offers/OfferSparkline";
import { OfferCompareDrawer } from "@/components/offers/OfferCompareDrawer";
import { OffersBulkActionsBar } from "@/components/offers/OffersBulkActionsBar";
import { useOffersTraffic } from "@/hooks/useOffersTraffic";
import { useOffersTodayStats, useOrphanCampaignTagsToday } from "@/hooks/useOffersTodayStats";
import { useOfferBenchmarks, useOfferKpiMetrics } from "@/hooks/useOfferBenchmarks";
import { useOffersDayMetrics } from "@/hooks/useOffersDayMetrics";
import { useOffersVslCounts } from "@/hooks/useOfferVslMetrics";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useAuth } from "@/contexts/AuthContext";
import { BenchmarkBadge } from "@/components/offers/BenchmarkBadge";
import { OfferBenchmarksDialog } from "@/components/offers/OfferBenchmarksDialog";
import { useOperationId } from "@/contexts/OperationContext";
import { calcOfferHealth } from "@/lib/offerHealthScore";
import { detectOfferTwins, suggestKill } from "@/lib/offerTwins";
import { exportOffersCSV } from "@/lib/offerExport";
import type { Offer, OfferStatus, OfferNicho, OfferVendor, OfferGeo } from "@/types/offers";
import { cn } from "@/lib/utils";

/* ─────────── helpers ─────────── */
const fmtBRL = (v: number | null | undefined) =>
  v == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));
const fmtUSD = (v: number | null | undefined) =>
  v == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(v));
const fmtDate = (s: string | null) => (s ? format(parseISO(s), "dd/MM/yy") : "—");

const STATUS_META: Record<OfferStatus, { label: string; cls: string; dot: string }> = {
  ativa:     { label: "Ativa",     cls: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30", dot: "bg-emerald-500" },
  em_teste:  { label: "Em teste",  cls: "bg-amber-500/15 text-amber-500 border-amber-500/30",       dot: "bg-amber-500" },
  pausada:   { label: "Pausada",   cls: "bg-red-500/15 text-red-500 border-red-500/30",             dot: "bg-red-500" },
  morta:     { label: "Morta",     cls: "bg-muted text-muted-foreground border-border",             dot: "bg-muted-foreground/50" },
  arquivada: { label: "Arquivada", cls: "bg-muted/50 text-muted-foreground border-border/50",      dot: "bg-muted-foreground/30" },
};

const STATUS_RANK: Record<OfferStatus, number> = {
  ativa: 0,
  em_teste: 1,
  pausada: 2,
  morta: 3,
  arquivada: 4,
};

const STATUS_BORDER: Record<OfferStatus, string> = {
  ativa:     "border-l-emerald-500/60",
  em_teste:  "border-l-amber-500/60",
  pausada:   "border-l-red-500/60",
  morta:     "border-l-muted-foreground/30",
  arquivada: "border-l-muted-foreground/20",
};

const NICHO_LABEL: Partial<Record<OfferNicho, string>> = {
  brain_memory: "Brain", vision: "Vision", hearing: "Hearing", blood_sugar: "Blood Sugar", glp1: "GLP-1", blood_sugar_glp1: "Blood Sugar / GLP-1",
  weight_loss: "Weight Loss", mens_health_ed: "Mens Health", womens_health: "Womens Health", heart_bp: "Heart", prostate: "Prostate",
  tinnitus: "Tinnitus", joint_pain: "Joint", skin_beauty: "Skin & Beauty", hair_loss: "Hair Loss", dental: "Dental",
  sleep: "Sleep", energy: "Energy", immunity: "Immunity", digestive: "Digestive", kidney_liver: "Kidney/Liver",
  anti_aging: "Anti-Aging", muscle: "Muscle", detox: "Detox", thyroid: "Thyroid", spiritual: "Spiritual",
  survival: "Survival", pet: "Pet", financial: "Financial", outro: "Outros",
};

const VENDOR_LABEL: Partial<Record<OfferVendor, string>> = {
  clickbank: "ClickBank", buygoods: "BuyGoods", cartpanda: "Cartpanda",
  hotmart: "Hotmart", kiwify: "Kiwify", monetizze: "Monetizze", cod_europa: "COD Europa", outro: "Outros",
};

const GEO_FLAG: Record<OfferGeo, string> = {
  BR: "🇧🇷", US: "🇺🇸", UK: "🇬🇧", DE: "🇩🇪", FR: "🇫🇷",
  ES: "🇪🇸", IT: "🇮🇹", CA: "🇨🇦", AU: "🇦🇺",
  HU: "🇭🇺", PL: "🇵🇱", RO: "🇷🇴", NL: "🇳🇱", PT: "🇵🇹", MX: "🇲🇽",
  SK: "🇸🇰", CZ: "🇨🇿", AT: "🇦🇹", CH: "🇨🇭", BE: "🇧🇪", IE: "🇮🇪",
  SE: "🇸🇪", NO: "🇳🇴", DK: "🇩🇰", FI: "🇫🇮", GR: "🇬🇷", BG: "🇧🇬",
  HR: "🇭🇷", SI: "🇸🇮", LT: "🇱🇹", LV: "🇱🇻", EE: "🇪🇪", LU: "🇱🇺",
  AR: "🇦🇷", CL: "🇨🇱", CO: "🇨🇴", PE: "🇵🇪", UY: "🇺🇾", EC: "🇪🇨",
  PY: "🇵🇾", BO: "🇧🇴", VE: "🇻🇪", CR: "🇨🇷", PA: "🇵🇦", DO: "🇩🇴", GT: "🇬🇹",
  NZ: "🇳🇿", ZA: "🇿🇦", IN: "🇮🇳", JP: "🇯🇵", KR: "🇰🇷", SG: "🇸🇬",
  MY: "🇲🇾", PH: "🇵🇭", TH: "🇹🇭", ID: "🇮🇩", VN: "🇻🇳",
  TR: "🇹🇷", IL: "🇮🇱", AE: "🇦🇪", SA: "🇸🇦",
};

const STATUS_OPTIONS: OfferStatus[] = ["ativa", "em_teste", "pausada", "morta", "arquivada"];
const NICHO_OPTIONS: { value: OfferNicho; label: string }[] = [
  { value: "brain_memory", label: "Brain" }, { value: "blood_sugar", label: "Blood Sugar" }, { value: "glp1", label: "GLP-1" },
  { value: "weight_loss", label: "Weight Loss" }, { value: "mens_health_ed", label: "Mens Health" },
  { value: "heart_bp", label: "Heart" }, { value: "prostate", label: "Prostate" },
  { value: "tinnitus", label: "Tinnitus" }, { value: "joint_pain", label: "Joint" },
  { value: "financial", label: "Financial" }, { value: "outro", label: "Outros" },
];
const VENDOR_OPTIONS: { value: OfferVendor; label: string }[] = [
  { value: "clickbank", label: "ClickBank" }, { value: "buygoods", label: "BuyGoods" },
  { value: "cartpanda", label: "Cartpanda" }, { value: "hotmart", label: "Hotmart" },
  { value: "kiwify", label: "Kiwify" }, { value: "monetizze", label: "Monetizze" },
  { value: "outro", label: "Outros" },
];
const GEO_OPTIONS: { value: string; label: string; flag?: string }[] = [
  { value: "BR", label: "BR", flag: "🇧🇷" }, { value: "US", label: "US", flag: "🇺🇸" },
  { value: "UK", label: "UK", flag: "🇬🇧" }, { value: "outro", label: "Outros", flag: "🌐" },
];

type SortKey = "data_inicio" | "apelido_interno" | "produto_real" | "ticket_front_brl" | "cpa_target_brl" | "lifetime" | "spend_7d" | "revenue_7d" | "roi_7d" | "health";
type SortDir = "asc" | "desc";

type QuickFilter = "all" | "active_combo" | "winners" | "selling_today" | "no_spend" | "dying" | "archived";

const QUICK_FILTERS: { value: QuickFilter; label: string; icon?: React.ComponentType<any>; tooltip: string }[] = [
  { value: "all",           label: "Todas",            tooltip: "Mostrar todas as ofertas (exceto arquivadas)" },
  { value: "active_combo",  label: "Ativos",           tooltip: "Ativa + Em teste + Pausada" },
  { value: "winners",       label: "🔥 ROI > 1.2x",    icon: Flame,         tooltip: "Ofertas escalando (ROI 7d acima de 1.2x)" },
  { value: "selling_today", label: "Vendendo hoje",    icon: Sparkles,      tooltip: "Ofertas com pelo menos 1 venda hoje" },
  { value: "no_spend",      label: "Sem spend 7d",     icon: AlertTriangle, tooltip: "Ofertas ativas/teste sem investimento nos últimos 7 dias" },
  { value: "dying",         label: "Morrendo",         tooltip: "Pausadas + Mortas nos últimos 30d" },
  { value: "archived",      label: "🗄️ Arquivadas",   icon: Archive,       tooltip: "Somente ofertas arquivadas" },
];

type Density = "comfortable" | "compact";
type GroupBy = "none" | "nicho" | "vendor" | "geo" | "status";

type ColumnId =
  | "checkbox" | "status" | "apelido" | "produto" | "nicho" | "geo" | "vendor"
  | "ticket" | "cpa" | "margem" | "spark" | "spend7d" | "spend30d" | "contas"
  | "vendas_hoje" | "receita7d" | "receita30d" | "roi7d" | "health" | "inicio" | "lifetime" | "acoes"
  | "spend_hoje" | "receita_hoje" | "roi_hoje"
  | "spend_dia" | "vendas_dia" | "receita_dia" | "roi_dia" | "vsls";

const COLUMN_LABELS: Record<ColumnId, string> = {
  checkbox: "—", status: "Status", apelido: "Apelido", produto: "Produto",
  nicho: "Nicho", geo: "Geo", vendor: "Plataforma", ticket: "CPA",
  cpa: "CPA", margem: "Margem", spark: "Tendência 7d", spend7d: "Spend 7d",
  spend30d: "Spend 30d", contas: "Contas", vendas_hoje: "Vendas hoje",
  receita7d: "Receita 7d", receita30d: "Receita 30d", roi7d: "ROI 7d", health: "Health",
  inicio: "Início", lifetime: "Lifetime", acoes: "Ações",
  spend_hoje: "Spend hoje", receita_hoje: "Receita hoje", roi_hoje: "ROI hoje",
  spend_dia: "Spend (período)", vendas_dia: "Vendas (período)",
  receita_dia: "Receita (período)", roi_dia: "ROI (período)", vsls: "VSLs",
};

const DEFAULT_COLS: Record<Density, ColumnId[]> = {
  // Visão limpa: identidade + KPIs essenciais. Restante ligado via "Colunas".
  comfortable: [
    "checkbox", "status", "apelido", "produto", "geo",
    "spark",
    "spend_hoje", "vendas_hoje", "receita_hoje", "roi_hoje",
    "receita7d", "roi7d",
    "health", "acoes",
  ],
  compact: [
    "checkbox", "status", "apelido", "geo", "spark",
    "vendas_hoje", "receita_hoje", "roi_hoje",
    "receita7d", "health", "acoes",
  ],
};

// Sem auto-injeção: respeita escolha do usuário após reset v4
const FORCE_VISIBLE: ColumnId[] = [];

/* ─────────── saved views ─────────── */
type SavedView = {
  id: string; name: string; status: OfferStatus[]; nicho: OfferNicho[];
  vendor: OfferVendor[]; geo: string[]; quick: QuickFilter; search: string;
};
const VIEWS_KEY = "offers:saved-views:v1";
const ACTIVE_VIEW_KEY = "offers:active-view:v1";
const COLS_KEY = "offers:visible-cols:v4";
const DENSITY_KEY = "offers:density:v1";
const GROUP_KEY = "offers:group-by:v1";
const VIEW_MODE_KEY = "offers:view-mode:v1";
const STATUS_FILTER_KEY = "offers:status-filter:v1";
const QUICK_FILTER_KEY = "offers:quick-filter:v1";
const SORT_KEY_KEY = "offers:sort-key:v1";
const SORT_DIR_KEY = "offers:sort-dir:v1";

type ViewMode = "table" | "cards";

const loadJSON = <T,>(k: string, fallback: T): T => {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
};

export default function Offers() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  /* filters */
  const [statusFilter, setStatusFilter] = useState<Set<OfferStatus>>(
    () => new Set(loadJSON<OfferStatus[]>(STATUS_FILTER_KEY, [])),
  );
  const [nichoFilter, setNichoFilter] = useState<Set<OfferNicho>>(new Set());
  const [vendorFilter, setVendorFilter] = useState<Set<OfferVendor>>(new Set());
  const [geoFilter, setGeoFilter] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");

  const [sortKey, setSortKey] = useState<SortKey>(
    () => loadJSON<SortKey>(SORT_KEY_KEY, "data_inicio"),
  );
  const [sortDir, setSortDir] = useState<SortDir>(
    () => loadJSON<SortDir>(SORT_DIR_KEY, "desc"),
  );

  /* visual prefs */
  const [density, setDensity] = useState<Density>(() => loadJSON<Density>(DENSITY_KEY, "comfortable"));
  const [groupBy, setGroupBy] = useState<GroupBy>(() => loadJSON<GroupBy>(GROUP_KEY, "none"));
  const [viewMode, setViewMode] = useState<ViewMode>(() => loadJSON<ViewMode>(VIEW_MODE_KEY, "cards"));
  const [visibleCols, setVisibleCols] = useState<Set<ColumnId>>(() => {
    const saved = loadJSON<ColumnId[]>(COLS_KEY, DEFAULT_COLS.comfortable);
    const merged = new Set<ColumnId>(saved.filter((c) => c !== ("cpa" as ColumnId)));
    FORCE_VISIBLE.forEach((c) => merged.add(c));
    return merged;
  });

  /* dialogs */
  const [selectedOffer, setSelectedOffer] = useState<Offer | null>(null);
  const [editingOffer, setEditingOffer] = useState<Offer | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardPrefill, setWizardPrefill] = useState<any | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [statusChange, setStatusChange] = useState<{ offer: Offer; newStatus: OfferStatus } | null>(null);
  const [benchmarksOpen, setBenchmarksOpen] = useState(false);
  const operationId = useOperationId();
  const { isAdmin } = useAuth();
  const { dateRange: dr } = useDateRange();
  const [drStart, drEnd] = dr;
  const { data: benchmarksMap } = useOfferBenchmarks(operationId);
  const { data: kpiMap } = useOfferKpiMetrics(operationId, drStart, drEnd);
  const { data: dayMetrics } = useOffersDayMetrics(drStart, drEnd, operationId);
  const { data: vslCounts } = useOffersVslCounts(operationId);

  /* saved views */
  const [savedViews, setSavedViews] = useState<SavedView[]>(() => loadJSON<SavedView[]>(VIEWS_KEY, []));
  const [activeViewId, setActiveViewId] = useState<string | null>(
    () => localStorage.getItem(ACTIVE_VIEW_KEY) || null,
  );

  /* selection (bulk) */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [compareOpen, setCompareOpen] = useState(false);

  /* persist visual prefs */
  useEffect(() => { localStorage.setItem(DENSITY_KEY, JSON.stringify(density)); }, [density]);
  useEffect(() => { localStorage.setItem(GROUP_KEY, JSON.stringify(groupBy)); }, [groupBy]);
  useEffect(() => { localStorage.setItem(VIEW_MODE_KEY, JSON.stringify(viewMode)); }, [viewMode]);
  useEffect(() => { localStorage.setItem(COLS_KEY, JSON.stringify(Array.from(visibleCols))); }, [visibleCols]);
  useEffect(() => { localStorage.setItem(VIEWS_KEY, JSON.stringify(savedViews)); }, [savedViews]);
  useEffect(() => { localStorage.setItem(STATUS_FILTER_KEY, JSON.stringify(Array.from(statusFilter))); }, [statusFilter]);
  useEffect(() => { localStorage.setItem(QUICK_FILTER_KEY, JSON.stringify(quickFilter)); }, [quickFilter]);
  useEffect(() => { localStorage.setItem(SORT_KEY_KEY, JSON.stringify(sortKey)); }, [sortKey]);
  useEffect(() => { localStorage.setItem(SORT_DIR_KEY, JSON.stringify(sortDir)); }, [sortDir]);

  /* ─── Spy → Offers prefill (?prefill_from_spy=<spyOfferId>) ─── */
  useEffect(() => {
    const spyId = searchParams.get("prefill_from_spy");
    if (!spyId || wizardOpen) return;
    (async () => {
      const { data: spy, error } = await supabase
        .from("spy_offers")
        .select("offer_name, product_name, briefing_md, funnel_urls, checkout_urls, ad_library_url, idioma, primary_advertiser, geo_main")
        .eq("id", spyId)
        .maybeSingle();
      if (error || !spy) {
        toast.error("Oferta do Spy não encontrada");
        searchParams.delete("prefill_from_spy");
        setSearchParams(searchParams);
        return;
      }
      const apelidoBase = (spy.offer_name || "spy")
        .toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
      const apelido = `${apelidoBase}-replica`;
      const funnel = ((spy.funnel_urls as string[] | null) ?? [])[0] ?? "";
      const checkout = ((spy.checkout_urls as string[] | null) ?? [])[0] ?? "";
      const geoMap: Record<string, string> = { "US": "US", "BR": "BR", "UK": "UK", "ES": "ES", "IT": "IT", "DE": "DE", "FR": "FR" };
      const geo = geoMap[(spy.geo_main || "").toUpperCase()] ?? "BR";
      const notas =
        `🕵️ Origem: Spy — ${spy.offer_name}\n` +
        (spy.primary_advertiser ? `Anunciante: ${spy.primary_advertiser}\n` : "") +
        (spy.ad_library_url ? `Ad Library: ${spy.ad_library_url}\n` : "") +
        (spy.briefing_md ? `\n--- BRIEFING ENZO ---\n${(spy.briefing_md as string).slice(0, 4000)}` : "");

      setWizardPrefill({
        apelido_interno: apelido,
        produto_real: spy.product_name || spy.offer_name,
        sales_page_url: funnel,
        link_checkout: checkout,
        geo: geo as any,
        notas,
        tags: ["spy-replica"],
        status: "em_teste",
      });
      setEditingOffer(null);
      setWizardOpen(true);
      searchParams.delete("prefill_from_spy");
      setSearchParams(searchParams, { replace: true });
      toast.success(`Pré-preenchido a partir do Spy: ${spy.offer_name}`);
    })();
  }, [searchParams, wizardOpen, setSearchParams]);
  const { data: offers = [], isLoading } = useQuery({
    queryKey: ["offers", operationId],
    queryFn: async () => {
      let q = supabase.from("offers").select("*").order("data_inicio", { ascending: false });
      if (operationId) q = q.eq("operation_id", operationId);
      const { data, error } = await q;
      if (error) throw error;
      return data as Offer[];
    },
    enabled: !!operationId,
  });


  // FAST: today-only stats sempre ligado
  const { data: todayMap, dataUpdatedAt: todayUpdatedAt } = useOffersTodayStats(operationId);
  const { data: orphanTags } = useOrphanCampaignTagsToday(operationId);

  // LAZY: 7d/30d. Liga só quando o usuário precisa (sort/filter/coluna visível).
  const needs7d30d = useMemo(() => {
    if (viewMode === "cards") return true; // cards show 7d KPIs always
    if (["spend_7d", "revenue_7d", "roi_7d", "health"].includes(sortKey)) return true;
    if (["winners", "no_spend"].includes(quickFilter)) return true;
    const heavyCols: ColumnId[] = ["spend7d", "spend30d", "receita7d", "receita30d", "roi7d", "spark", "health", "contas"];
    if (heavyCols.some((c) => visibleCols.has(c))) return true;
    return false;
  }, [sortKey, quickFilter, visibleCols, viewMode]);
  const [force7d30d, setForce7d30d] = useState(false);
  const heavyEnabled = needs7d30d || force7d30d;
  const { data: trafficMap7d, dataUpdatedAt: heavyUpdatedAt } = useOffersTraffic(heavyEnabled ? operationId : null, heavyEnabled);

  // Map adapter: usa 7d/30d quando carregado, senão fallback p/ today-only
  const trafficMap = useMemo(() => {
    if (trafficMap7d && heavyEnabled) return trafficMap7d;
    // adapter pra interface compatível
    const m = new Map<string, any>();
    todayMap?.forEach((t, id) => {
      m.set(id, {
        offer_id: id,
        apelido_interno: t.apelido_interno,
        spend_today_brl: t.spend_today_brl,
        spend_7d_brl: 0,
        spend_30d_brl: 0,
        accounts_count: t.accounts_count,
        active_campaigns_count: t.active_campaigns_count,
        last_spend_date: null,
        revenue_today_brl: t.revenue_today_brl,
        sales_today: t.sales_today,
        revenue_7d_brl: 0, sales_7d: 0,
        revenue_30d_brl: 0, sales_30d: 0,
        roi_7d: null, roi_30d: null,
        profit_7d_brl: 0, profit_30d_brl: 0,
      });
    });
    return m;
  }, [trafficMap7d, heavyEnabled, todayMap]);
  const dataUpdatedAt = heavyEnabled ? heavyUpdatedAt : todayUpdatedAt;

  /* counts */
  const counts = useMemo(() => {
    const status: Record<string, number> = {}, nicho: Record<string, number> = {};
    const vendor: Record<string, number> = {}, geo: Record<string, number> = {};
    offers.forEach((o) => {
      status[o.status] = (status[o.status] ?? 0) + 1;
      nicho[o.nicho] = (nicho[o.nicho] ?? 0) + 1;
      vendor[o.vendor] = (vendor[o.vendor] ?? 0) + 1;
      const k = ["BR", "US", "UK"].includes(o.geo) ? o.geo : "outro";
      geo[k] = (geo[k] ?? 0) + 1;
    });
    return { status, nicho, vendor, geo };
  }, [offers]);

  /* twins */
  const twins = useMemo(() => detectOfferTwins(offers), [offers]);
  const twinKeys = useMemo(() => {
    const s = new Set<string>();
    twins.forEach((arr) => arr.forEach((o) => s.add(o.id)));
    return s;
  }, [twins]);

  /* filter */
  const filtered = useMemo(() => {
    return offers.filter((o) => {
      // Se o usuário escolheu status manualmente, ele tem prioridade sobre o quick filter
      const hasManualStatus = statusFilter.size > 0;
      if (!hasManualStatus && quickFilter === "active_combo" && !["ativa", "em_teste", "pausada"].includes(o.status)) return false;
      if (!hasManualStatus && quickFilter === "all" && o.status === "arquivada") return false;
      if (quickFilter === "archived" && o.status !== "arquivada") return false;
      if (quickFilter === "winners") {
        const roi = trafficMap?.get(o.id)?.roi_7d ?? null;
        if (roi == null || roi < 1.2) return false;
      }
      if (quickFilter === "selling_today") {
        if ((trafficMap?.get(o.id)?.sales_today ?? 0) <= 0) return false;
      }
      if (quickFilter === "no_spend") {
        if (!["ativa", "em_teste"].includes(o.status)) return false;
        if ((trafficMap?.get(o.id)?.spend_7d_brl ?? 0) > 0) return false;
      }
      if (quickFilter === "dying") {
        if (o.status === "pausada") return true;
        if (o.status === "morta" && o.data_morte) {
          return differenceInDays(new Date(), parseISO(o.data_morte)) <= 30;
        }
        return false;
      }


      if (statusFilter.size > 0 && !statusFilter.has(o.status)) return false;
      if (nichoFilter.size > 0 && !nichoFilter.has(o.nicho)) return false;
      if (vendorFilter.size > 0 && !vendorFilter.has(o.vendor)) return false;
      if (geoFilter.size > 0) {
        const isOutro = !["BR", "US", "UK"].includes(o.geo);
        const matches = geoFilter.has(o.geo) || (geoFilter.has("outro") && isOutro);
        if (!matches) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        if (
          !o.apelido_interno.toLowerCase().includes(q) &&
          !o.produto_real.toLowerCase().includes(q) &&
          !(o.tags || []).some((t) => t.toLowerCase().includes(q))
        ) return false;
      }
      return true;
    });
  }, [offers, statusFilter, nichoFilter, vendorFilter, geoFilter, search, quickFilter, trafficMap]);

  /* sort — status hierarchy primeiro, depois sortKey escolhido */
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      // 1º: hierarquia de status (ativo > teste > pausada > morta > arquivada)
      const rankDiff = STATUS_RANK[a.status] - STATUS_RANK[b.status];
      if (rankDiff !== 0) return rankDiff;

      // 2º: sort escolhido pelo usuário
      let av: any, bv: any;
      if (sortKey === "lifetime") {
        const lt = (o: Offer) => {
          if (!o.data_inicio) return 0;
          const end = o.status === "morta" && o.data_morte ? parseISO(o.data_morte) : new Date();
          return differenceInDays(end, parseISO(o.data_inicio));
        };
        av = lt(a); bv = lt(b);
      } else if (sortKey === "spend_7d")   { av = trafficMap?.get(a.id)?.spend_7d_brl ?? 0; bv = trafficMap?.get(b.id)?.spend_7d_brl ?? 0; }
      else if (sortKey === "revenue_7d") { av = trafficMap?.get(a.id)?.revenue_7d_brl ?? 0; bv = trafficMap?.get(b.id)?.revenue_7d_brl ?? 0; }
      else if (sortKey === "roi_7d")     { av = trafficMap?.get(a.id)?.roi_7d ?? -1; bv = trafficMap?.get(b.id)?.roi_7d ?? -1; }
      else if (sortKey === "health")     { av = calcOfferHealth(a, trafficMap?.get(a.id)).score; bv = calcOfferHealth(b, trafficMap?.get(b.id)).score; }
      else { av = a[sortKey] ?? ""; bv = b[sortKey] ?? ""; }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filtered, sortKey, sortDir, trafficMap]);

  /* group */
  const grouped = useMemo(() => {
    // Cards view: auto-agrupa por status (Escalando/Em teste/Pausadas/etc) quando groupBy = none
    const effectiveGroup = groupBy === "none" && viewMode === "cards" ? "status" : groupBy;
    if (effectiveGroup === "none") return [{ key: "__all__", label: "", offers: sorted }];
    const map = new Map<string, { label: string; rank: number; offers: Offer[] }>();
    sorted.forEach((o) => {
      let k: string; let label: string; let rank = 999;
      if (effectiveGroup === "nicho")  { k = NICHO_LABEL[o.nicho]; label = k; }
      else if (effectiveGroup === "vendor") { k = VENDOR_LABEL[o.vendor]; label = k; }
      else if (effectiveGroup === "geo")    { k = `${GEO_FLAG[o.geo] ?? "🌐"} ${o.geo}`; label = k; }
      else { k = o.status; label = STATUS_META[o.status].label; rank = STATUS_RANK[o.status]; }
      if (!map.has(k)) map.set(k, { label, rank, offers: [] });
      map.get(k)!.offers.push(o);
    });
    const entries = Array.from(map.entries()).map(([key, v]) => ({ key, label: v.label, rank: v.rank, offers: v.offers }));
    if (effectiveGroup === "status") {
      return entries.sort((a, b) => a.rank - b.rank);
    }
    return entries.sort((a, b) => b.offers.length - a.offers.length);
  }, [sorted, groupBy, viewMode]);


  /* summary */
  const summary = useMemo(() => {
    const total = offers.filter((o) => o.status !== "arquivada").length;
    const ativas = offers.filter((o) => o.status === "ativa").length;
    const em_teste = offers.filter((o) => o.status === "em_teste").length;
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
    const mortas30d = offers.filter((o) => o.status === "morta" && o.data_morte && parseISO(o.data_morte) >= cutoff).length;

    // Totais financeiros somados (todas as offers visíveis no inventário)
    let totalSpend = 0;
    let totalRevenue = 0;
    offers.forEach((o) => {
      if (o.status === "arquivada") return;
      totalSpend += dayMetrics?.get(o.id)?.spend_brl ?? 0;
      totalRevenue += dayMetrics?.get(o.id)?.revenue_brl ?? 0;
    });
    // Net profit = Receita - Spend - Meta Tax (12.15%) - Account Rent (5.5%)
    const metaTax = totalSpend * 0.1215;
    const rent = totalSpend * 0.055;
    const totalProfit = totalRevenue - totalSpend - metaTax - rent;
    const roi = totalSpend > 0 ? (totalProfit / totalSpend) * 100 : 0;

    return { total, ativas, em_teste, mortas30d, totalSpend, totalRevenue, totalProfit, roi };
  }, [offers, trafficMap, dayMetrics]);

  const activeFilterCount =
    statusFilter.size + nichoFilter.size + vendorFilter.size + geoFilter.size + (search ? 1 : 0) + (quickFilter !== "active_combo" ? 1 : 0);

  const clearAllFilters = () => {
    setStatusFilter(new Set()); setNichoFilter(new Set()); setVendorFilter(new Set());
    setGeoFilter(new Set()); setSearch(""); setQuickFilter("active_combo");
    setActiveViewId(null); localStorage.removeItem(ACTIVE_VIEW_KEY);
  };

  const toggleSet = <T,>(set: Set<T>, value: T, setter: (s: Set<T>) => void) => {
    const next = new Set(set);
    next.has(value) ? next.delete(value) : next.add(value);
    setter(next);
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const handleArchive = async (offer: Offer) => {
    if (!confirm(`Arquivar "${offer.apelido_interno}"?`)) return;
    const { error } = await supabase.from("offers").update({ status: "arquivada" }).eq("id", offer.id);
    if (error) { toast.error("Erro ao arquivar"); return; }
    toast.success("Oferta arquivada");
    qc.invalidateQueries({ queryKey: ["offers"] });
  };

  const handleBulkArchive = async () => {
    if (!confirm(`Arquivar ${selected.size} ofertas?`)) return;
    const { error } = await supabase.from("offers").update({ status: "arquivada" }).in("id", Array.from(selected));
    if (error) { toast.error("Erro no bulk"); return; }
    toast.success(`${selected.size} ofertas arquivadas`);
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ["offers"] });
  };

  const handleDelete = async (offer: Offer) => {
    if (!confirm(`⚠️ EXCLUIR permanentemente "${offer.apelido_interno}"?\n\nEsta ação NÃO pode ser desfeita.`)) return;
    const { error } = await supabase.from("offers").delete().eq("id", offer.id);
    if (error) { toast.error(`Erro ao excluir: ${error.message}`); return; }
    toast.success("Oferta excluída");
    qc.invalidateQueries({ queryKey: ["offers"] });
  };

  const handleBulkDelete = async () => {
    if (!confirm(`⚠️ EXCLUIR permanentemente ${selected.size} ofertas?\n\nEsta ação NÃO pode ser desfeita.`)) return;
    const { error } = await supabase.from("offers").delete().in("id", Array.from(selected));
    if (error) { toast.error(`Erro ao excluir: ${error.message}`); return; }
    toast.success(`${selected.size} ofertas excluídas`);
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ["offers"] });
  };


  const handleBulkExport = () => {
    const offersToExport = offers.filter((o) => selected.has(o.id));
    exportOffersCSV(offersToExport, trafficMap);
    toast.success(`${offersToExport.length} offers exportadas`);
  };

  const handleExportAll = () => {
    exportOffersCSV(sorted, trafficMap);
    toast.success(`${sorted.length} offers exportadas`);
  };

  const handleInlineStatus = async (offer: Offer, newStatus: OfferStatus) => {
    if (newStatus === offer.status) return;
    // se for morte/pausada → abre dialog pra coletar motivo
    if (["morta", "pausada"].includes(newStatus)) {
      setStatusChange({ offer, newStatus });
      return;
    }
    const { error } = await supabase.from("offers").update({ status: newStatus }).eq("id", offer.id);
    if (error) { toast.error("Erro ao mudar status"); return; }
    toast.success(`Status alterado para ${STATUS_META[newStatus].label}`);
    qc.invalidateQueries({ queryKey: ["offers"] });
  };

  const handleStatusChangeRequest = (offer: Offer, newStatus: OfferStatus) => {
    setStatusChange({ offer, newStatus });
  };

  /* saved views */
  const handleSaveView = () => {
    const name = prompt("Nome da view:");
    if (!name) return;
    const view: SavedView = {
      id: crypto.randomUUID(), name,
      status: Array.from(statusFilter), nicho: Array.from(nichoFilter),
      vendor: Array.from(vendorFilter), geo: Array.from(geoFilter),
      quick: quickFilter, search,
    };
    setSavedViews((v) => [...v, view]);
    setActiveViewId(view.id);
    localStorage.setItem(ACTIVE_VIEW_KEY, view.id);
    toast.success(`View "${name}" salva`);
  };
  const handleApplyView = (v: SavedView) => {
    setStatusFilter(new Set(v.status)); setNichoFilter(new Set(v.nicho));
    setVendorFilter(new Set(v.vendor)); setGeoFilter(new Set(v.geo));
    setQuickFilter(v.quick); setSearch(v.search);
    setActiveViewId(v.id); localStorage.setItem(ACTIVE_VIEW_KEY, v.id);
  };
  const handleDeleteView = (id: string) => {
    setSavedViews((v) => v.filter((x) => x.id !== id));
    if (activeViewId === id) { setActiveViewId(null); localStorage.removeItem(ACTIVE_VIEW_KEY); }
  };

  /* selection handlers */
  const toggleAllVisible = () => {
    if (selected.size === sorted.length && sorted.length > 0) setSelected(new Set());
    else setSelected(new Set(sorted.map((o) => o.id)));
  };

  /* insights banner click */
  const handleInsightClick = (kind: "winners" | "no_spend" | "selling_today" | "limbo") => {
    if (kind === "limbo") setQuickFilter("dying");
    else setQuickFilter(kind);
  };

  /* Spy navigation */
  const goToSpy = (offer: Offer) => navigate(`/spy?nicho=${offer.nicho}&geo=${offer.geo}`);

  /* selected offers para compare */
  const selectedOffers = useMemo(
    () => offers.filter((o) => selected.has(o.id)).slice(0, 4),
    [offers, selected],
  );

  /* última atualização */
  const updateAgo = useMemo(() => {
    if (!dataUpdatedAt) return null;
    const sec = Math.floor((Date.now() - dataUpdatedAt) / 1000);
    if (sec < 60) return `há ${sec}s`;
    return `há ${Math.floor(sec / 60)}min`;
  }, [dataUpdatedAt]);

  const padY = density === "compact" ? "py-1" : "py-3";
  const txtSize = density === "compact" ? "text-[11px]" : "text-sm";

  return (
    <div className="space-y-4 sm:space-y-6 w-full px-3 sm:px-4 full-width-page">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div
            className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "rgba(255,30,30,0.12)", boxShadow: "0 0 12px rgba(255,30,30,0.25)" }}
          >
            <Package className="h-[18px] w-[18px] text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">Central de Offers</h1>
            <p className="text-xs text-muted-foreground">
              Inventário operacional · atualiza a cada 2 min{updateAgo ? ` · última ${updateAgo}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setBenchmarksOpen(true)} className="gap-1.5 rounded-lg">
            🎯 <span className="hidden sm:inline">Benchmarks</span>
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportAll} className="gap-1.5 rounded-lg">
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Exportar</span>
          </Button>
          <Button onClick={() => { setEditingOffer(null); setWizardOpen(true); }} size="sm" className="rounded-lg">
            <Plus className="h-4 w-4 mr-1.5" /> Nova Offer
          </Button>
        </div>
      </div>

      {/* Portfolio summary — counters por status + KPIs agregados 7d (topo da página) */}
      <OffersPortfolioSummary
        offers={offers}
        trafficMap={trafficMap}
        activeStatusFilter={statusFilter}
        onStatusClick={(s) => {
          if (s === "all") { setStatusFilter(new Set()); return; }
          const next = new Set(statusFilter);
          if (next.has(s)) next.delete(s); else { next.clear(); next.add(s); }
          setStatusFilter(next);
        }}
      />


      {/* 7d/30d lazy indicator */}
      {!heavyEnabled && (
        <div className="flex items-center justify-end gap-2 text-[11px] text-muted-foreground">
          <span>📊 Métricas 7d/30d carregam sob demanda (sort/filtro/coluna).</span>
          <button
            onClick={() => setForce7d30d(true)}
            className="px-2 py-0.5 rounded border border-border hover:bg-accent text-foreground"
          >
            Carregar 7d/30d agora
          </button>
        </div>
      )}

      {/* Toolbar */}
      <Card className="rounded-xl">
        <CardContent className="p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar apelido, produto ou tag..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 rounded-lg"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 hover:bg-muted"
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              )}
            </div>

            <FilterDropdown label="Status"
              options={STATUS_OPTIONS.map((s) => ({ value: s, label: STATUS_META[s].label, count: counts.status[s] ?? 0, dot: STATUS_META[s].dot }))}
              selected={statusFilter as Set<string>}
              onToggle={(v) => toggleSet(statusFilter, v as OfferStatus, setStatusFilter)}
              onClear={() => setStatusFilter(new Set())} />
            <FilterDropdown label="Nicho"
              options={NICHO_OPTIONS.map((n) => ({ value: n.value, label: n.label, count: counts.nicho[n.value] ?? 0 }))}
              selected={nichoFilter as Set<string>}
              onToggle={(v) => toggleSet(nichoFilter, v as OfferNicho, setNichoFilter)}
              onClear={() => setNichoFilter(new Set())} />
            <FilterDropdown label="Plataforma"
              options={VENDOR_OPTIONS.map((v) => ({ value: v.value, label: v.label, count: counts.vendor[v.value] ?? 0 }))}
              selected={vendorFilter as Set<string>}
              onToggle={(v) => toggleSet(vendorFilter, v as OfferVendor, setVendorFilter)}
              onClear={() => setVendorFilter(new Set())} />
            <FilterDropdown label="Geo"
              options={GEO_OPTIONS.map((g) => ({ value: g.value, label: `${g.flag ?? ""} ${g.label}`.trim(), count: counts.geo[g.value] ?? 0 }))}
              selected={geoFilter}
              onToggle={(v) => toggleSet(geoFilter, v, setGeoFilter)}
              onClear={() => setGeoFilter(new Set())} />

            <div className="flex-1" />

            {/* View mode toggle Tabela / Cards */}
            <div className="flex items-center rounded-lg border border-border h-9 p-0.5">
              <button
                onClick={() => setViewMode("table")}
                className={cn("px-2 h-full rounded-md text-xs flex items-center gap-1 transition-colors",
                  viewMode === "table" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground")}
                title="Visualização em tabela"
              >
                <List className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Tabela</span>
              </button>
              <button
                onClick={() => setViewMode("cards")}
                className={cn("px-2 h-full rounded-md text-xs flex items-center gap-1 transition-colors",
                  viewMode === "cards" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground")}
                title="Visualização em cards"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Cards</span>
              </button>
            </div>


            {/* Density toggle */}
            <div className="flex items-center rounded-md border border-border h-9 p-0.5">
              <button
                onClick={() => setDensity("comfortable")}
                className={cn("px-2 h-full rounded text-xs flex items-center gap-1 transition-colors",
                  density === "comfortable" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground")}
                title="Modo confortável"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setDensity("compact")}
                className={cn("px-2 h-full rounded text-xs flex items-center gap-1 transition-colors",
                  density === "compact" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground")}
                title="Modo compacto"
              >
                <Rows3 className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Group by */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5">
                  Agrupar
                  {groupBy !== "none" && (
                    <Badge variant="outline" className="h-4 px-1 text-[10px] font-normal capitalize">{groupBy}</Badge>
                  )}
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuLabel className="text-xs">Agrupar por</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {(["none", "nicho", "vendor", "geo", "status"] as GroupBy[]).map((g) => (
                  <DropdownMenuItem key={g} onClick={() => setGroupBy(g)} className={cn("capitalize", groupBy === g && "bg-accent")}>
                    {g === "none" ? "Sem agrupamento" : g}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Columns */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5">
                  <Columns3 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Colunas</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 max-h-80 overflow-y-auto">
                <DropdownMenuLabel className="text-xs">Mostrar colunas</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {(Object.keys(COLUMN_LABELS) as ColumnId[]).filter((c) => c !== "checkbox" && c !== "acoes").map((c) => (
                  <DropdownMenuItem
                    key={c}
                    onSelect={(e) => { e.preventDefault(); }}
                    onClick={() => {
                      const next = new Set(visibleCols);
                      next.has(c) ? next.delete(c) : next.add(c);
                      setVisibleCols(next);
                    }}
                  >
                    <Checkbox checked={visibleCols.has(c)} className="mr-2" />
                    {COLUMN_LABELS[c]}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setVisibleCols(new Set(DEFAULT_COLS[density]))}>
                  Restaurar padrão
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Saved views */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5">
                  <Filter className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Views</span>
                  {activeViewId && (
                    <Badge variant="outline" className="ml-0.5 h-4 px-1 text-[10px] font-normal">
                      {savedViews.find((v) => v.id === activeViewId)?.name ?? "?"}
                    </Badge>
                  )}
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-2" align="end">
                <div className="space-y-1">
                  {savedViews.length === 0 && (
                    <p className="text-xs text-muted-foreground px-2 py-2">Nenhuma view salva.</p>
                  )}
                  {savedViews.map((v) => (
                    <div key={v.id} className={cn("flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent group", activeViewId === v.id && "bg-accent")}>
                      <button onClick={() => handleApplyView(v)} className="flex-1 text-left truncate">{v.name}</button>
                      <button onClick={() => handleDeleteView(v.id)} className="opacity-0 group-hover:opacity-100 rounded p-0.5 hover:bg-destructive/15 text-destructive">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <div className="border-t my-1" />
                  <button onClick={handleSaveView} className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent text-primary">
                    <Save className="h-3.5 w-3.5" />
                    Salvar filtros atuais
                  </button>
                </div>
              </PopoverContent>
            </Popover>

            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearAllFilters} className="h-9 gap-1.5 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
                Limpar
                <Badge variant="outline" className="h-4 px-1 text-[10px] font-normal">{activeFilterCount}</Badge>
              </Button>
            )}
          </div>

          {/* contagem de ofertas */}
          <div className="flex items-center justify-end">
            <span className="text-xs text-muted-foreground tabular-nums">
              {sorted.length} {sorted.length === 1 ? "oferta" : "ofertas"}
            </span>
          </div>


          {(statusFilter.size + nichoFilter.size + vendorFilter.size + geoFilter.size) > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border/40">
              {Array.from(statusFilter).map((s) => <ActiveChip key={`s-${s}`} label={`Status: ${STATUS_META[s].label}`} onRemove={() => toggleSet(statusFilter, s, setStatusFilter)} />)}
              {Array.from(nichoFilter).map((n) => <ActiveChip key={`n-${n}`} label={`Nicho: ${NICHO_LABEL[n]}`} onRemove={() => toggleSet(nichoFilter, n, setNichoFilter)} />)}
              {Array.from(vendorFilter).map((v) => <ActiveChip key={`v-${v}`} label={`Plataforma: ${VENDOR_LABEL[v]}`} onRemove={() => toggleSet(vendorFilter, v, setVendorFilter)} />)}
              {Array.from(geoFilter).map((g) => <ActiveChip key={`g-${g}`} label={`Geo: ${g.toUpperCase()}`} onRemove={() => toggleSet(geoFilter, g, setGeoFilter)} />)}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="divide-y divide-border/40">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
                  <div className="h-3.5 w-3.5 rounded-sm bg-muted/60" />
                  <div className="h-5 w-16 rounded-full bg-muted/50" />
                  <div className="h-4 w-24 rounded bg-muted/60" />
                  <div className="h-4 w-32 rounded bg-muted/40" />
                  <div className="h-4 w-8 rounded bg-muted/40" />
                  <div className="flex-1" />
                  <div className="h-4 w-16 rounded bg-muted/40" />
                  <div className="h-4 w-16 rounded bg-muted/50" />
                  <div className="h-4 w-12 rounded bg-muted/40" />
                  <div className="h-4 w-10 rounded bg-muted/40" />
                </div>
              ))}
            </div>
          ) : sorted.length === 0 ? (
            <div className="text-center py-20 px-4 space-y-4">
              <div className="mx-auto h-14 w-14 rounded-full bg-muted/40 flex items-center justify-center">
                <Package className="h-6 w-6 text-muted-foreground/60" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground/80">Nenhuma oferta encontrada</p>
                <p className="text-xs text-muted-foreground">
                  {activeFilterCount > 0 ? "Ajuste os filtros ou limpe-os para ver tudo." : "Crie sua primeira oferta para começar."}
                </p>
              </div>
              {activeFilterCount > 0 ? (
                <Button variant="outline" size="sm" onClick={clearAllFilters}>Limpar filtros</Button>
              ) : (
                <Button size="sm" onClick={() => { setEditingOffer(null); setWizardOpen(true); }}>
                  <Plus className="h-4 w-4 mr-1.5" /> Nova Offer
                </Button>
              )}
            </div>
          ) : viewMode === "cards" ? (
            <div className="p-4 space-y-6">
              {grouped.map((group) => (
                <div key={group.key} className="space-y-3">
                  {(groupBy !== "none" || (viewMode === "cards" && group.key !== "__all__")) && (
                    <div className="flex items-center gap-2 px-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      <span>{group.label}</span>
                      <span className="text-muted-foreground/50">({group.offers.length})</span>
                      <div className="flex-1 h-px bg-border/40" />
                    </div>
                  )}
                  <div className={cn(
                    "grid gap-2 sm:gap-3",
                    density === "compact"
                      ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 [@media(min-width:1920px)]:grid-cols-9 [@media(min-width:2560px)]:grid-cols-10 [@media(min-width:3200px)]:grid-cols-12"
                      : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 [@media(min-width:1920px)]:grid-cols-8 [@media(min-width:2560px)]:grid-cols-9 [@media(min-width:3200px)]:grid-cols-10"
                  )}>

                    {group.offers.map((o) => {
                      const traffic = trafficMap?.get(o.id);
                      const health = calcOfferHealth(o, traffic);
                      const kill = suggestKill(o, traffic?.spend_7d_brl ?? 0, traffic?.roi_7d ?? null);
                      const isTwin = twinKeys.has(o.id);
                      const isSelected = selected.has(o.id);
                      return (
                        <OfferCard
                          key={o.id}
                          offer={o}
                          traffic={traffic}
                          health={health}
                          isTwin={isTwin}
                          killReason={kill.suggest ? kill.reason ?? null : null}
                          isSelected={isSelected}
                          density={density}
                          benchmark={benchmarksMap?.get(o.nicho)}
                          benchmarkActual={kpiMap?.get(o.id)}
                          onSelectToggle={() => {
                            const next = new Set(selected);
                            next.has(o.id) ? next.delete(o.id) : next.add(o.id);
                            setSelected(next);
                          }}
                          onOpenDetail={() => setSelectedOffer(o)}
                          onEdit={() => { setEditingOffer(o); setWizardOpen(true); }}
                          onArchive={() => handleArchive(o)}
                          onDelete={() => handleDelete(o)}
                          onSpy={() => goToSpy(o)}
                          onStatusChange={(s) => handleInlineStatus(o, s)}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {visibleCols.has("checkbox") && (
                      <TableHead className="w-8">
                        <Checkbox
                          checked={selected.size === sorted.length && sorted.length > 0}
                          onCheckedChange={toggleAllVisible}
                        />
                      </TableHead>
                    )}
                    {visibleCols.has("status") && <TableHead>Status</TableHead>}
                    {visibleCols.has("apelido") && <SortHead label="Apelido" k="apelido_interno" sortKey={sortKey} sortDir={sortDir} onClick={handleSort} />}
                    {visibleCols.has("produto") && <SortHead label="Produto" k="produto_real" sortKey={sortKey} sortDir={sortDir} onClick={handleSort} />}
                    {visibleCols.has("nicho") && <TableHead>Nicho</TableHead>}
                    {visibleCols.has("geo") && <TableHead>Geo</TableHead>}
                    {visibleCols.has("vendor") && <TableHead>Plataforma</TableHead>}
                    {visibleCols.has("ticket") && <SortHead label="CPA" k="cpa_target_brl" sortKey={sortKey} sortDir={sortDir} onClick={handleSort} className="text-right" />}
                    {/* Margem column removed per request */}
                    {visibleCols.has("spark") && <TableHead className="text-center">7d</TableHead>}
                    {visibleCols.has("spend7d") && <SortHead label="Spend 7d" k="spend_7d" sortKey={sortKey} sortDir={sortDir} onClick={handleSort} className="text-right" />}
                    {visibleCols.has("spend30d") && <TableHead className="text-right">Spend 30d</TableHead>}
                    {visibleCols.has("contas") && <TableHead className="text-center">Contas</TableHead>}
                    {visibleCols.has("vendas_hoje") && <TableHead className="text-center">Vendas hoje</TableHead>}
                    {visibleCols.has("spend_dia") && <TableHead className="text-right">Spend (período)</TableHead>}
                    {visibleCols.has("vendas_dia") && <TableHead className="text-center">Vendas (período)</TableHead>}
                    {visibleCols.has("receita_dia") && <TableHead className="text-right">Receita (período)</TableHead>}
                    {visibleCols.has("roi_dia") && <TableHead className="text-center">ROI (período)</TableHead>}
                    {visibleCols.has("vsls") && <TableHead className="text-center">VSLs</TableHead>}
                    {visibleCols.has("spend_hoje") && <TableHead className="text-right">Spend hoje</TableHead>}
                    {visibleCols.has("receita_hoje") && <TableHead className="text-right">Receita hoje</TableHead>}
                    {visibleCols.has("roi_hoje") && <TableHead className="text-center">ROI hoje</TableHead>}
                    {visibleCols.has("receita7d") && <SortHead label="Receita 7d" k="revenue_7d" sortKey={sortKey} sortDir={sortDir} onClick={handleSort} className="text-right" />}
                    {visibleCols.has("receita30d") && <TableHead className="text-right">Receita 30d</TableHead>}
                    {visibleCols.has("roi7d") && <SortHead label="ROI 7d" k="roi_7d" sortKey={sortKey} sortDir={sortDir} onClick={handleSort} className="text-center" />}
                    {visibleCols.has("health") && <SortHead label="Health" k="health" sortKey={sortKey} sortDir={sortDir} onClick={handleSort} className="text-center" />}
                    {visibleCols.has("inicio") && <SortHead label="Início" k="data_inicio" sortKey={sortKey} sortDir={sortDir} onClick={handleSort} />}
                    {visibleCols.has("lifetime") && <SortHead label="Lifetime" k="lifetime" sortKey={sortKey} sortDir={sortDir} onClick={handleSort} />}
                    {visibleCols.has("acoes") && <TableHead className="text-right">Ações</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grouped.map((group) => (
                    <Fragment key={group.key}>
                      {groupBy !== "none" && (
                        <TableRow key={`g-${group.key}`} className="bg-muted/30 hover:bg-muted/30">
                          <TableCell colSpan={visibleCols.size} className="py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            {group.label} <span className="ml-2 text-muted-foreground/60">({group.offers.length})</span>
                          </TableCell>
                        </TableRow>
                      )}
                      {group.offers.map((o) => {
                        const lifetime = o.data_inicio
                          ? differenceInDays(o.status === "morta" && o.data_morte ? parseISO(o.data_morte) : new Date(), parseISO(o.data_inicio))
                          : null;
                        const traffic = trafficMap?.get(o.id);
                        const health = calcOfferHealth(o, traffic);
                        const kill = suggestKill(o, traffic?.spend_7d_brl ?? 0, traffic?.roi_7d ?? null);
                        const isTwin = twinKeys.has(o.id);
                        const isSelected = selected.has(o.id);

                        return (
                          <TableRow
                            key={o.id}
                            className={cn(
                              "group cursor-pointer hover:bg-accent/40 border-l-[3px] transition-colors",
                              STATUS_BORDER[o.status],
                              isSelected && "bg-primary/5",
                            )}
                            onClick={(e) => {
                              if ((e.target as HTMLElement).closest("[data-no-row-click]")) return;
                              setSelectedOffer(o);
                            }}
                          >
                            {visibleCols.has("checkbox") && (
                              <TableCell className={padY} data-no-row-click>
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => {
                                    const next = new Set(selected);
                                    next.has(o.id) ? next.delete(o.id) : next.add(o.id);
                                    setSelected(next);
                                  }}
                                />
                              </TableCell>
                            )}
                            {visibleCols.has("status") && (
                              <TableCell className={padY} data-no-row-click>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button>
                                      <Badge variant="outline" className={cn(STATUS_META[o.status].cls, "cursor-pointer hover:opacity-80")}>
                                        {STATUS_META[o.status].label}
                                        <ChevronDown className="h-2.5 w-2.5 ml-1 opacity-60" />
                                      </Badge>
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="start" className="w-40">
                                    {STATUS_OPTIONS.filter((s) => s !== o.status).map((s) => (
                                      <DropdownMenuItem key={s} onClick={() => handleInlineStatus(o, s)}>
                                        <span className={cn("h-2 w-2 rounded-full mr-2", STATUS_META[s].dot)} />
                                        {STATUS_META[s].label}
                                      </DropdownMenuItem>
                                    ))}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            )}
                            {visibleCols.has("apelido") && (
                              <TableCell className={cn(padY, "font-mono font-bold", txtSize)}>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {o.apelido_interno}
                                  {isTwin && <span title="Oferta gêmea (mesmo nicho+geo ativa)" className="text-amber-500"><AlertTriangle className="h-3 w-3" /></span>}
                                  {kill.suggest && <span title={kill.reason} className="text-red-500"><Skull className="h-3 w-3" /></span>}
                                  <BenchmarkBadge nicho={o.nicho} actual={kpiMap?.get(o.id)} target={benchmarksMap?.get(o.nicho)} />
                                  {(() => {
                                    const teto = (o as any).teto_validacao_brl as number | null;
                                    const spent = traffic?.spend_30d_brl ?? 0;
                                    if (!teto || teto <= 0) return null;
                                    const pct = (spent / teto) * 100;
                                    if (pct < 80) return null;
                                    const isOver = pct >= 100;
                                    return (
                                      <span
                                        title={`Teto de validação: ${fmtBRL(spent)} de ${fmtBRL(teto)} (${pct.toFixed(0)}%)`}
                                        className={cn(
                                          "text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border",
                                          isOver
                                            ? "bg-red-500/15 text-red-500 border-red-500/40"
                                            : "bg-amber-500/15 text-amber-500 border-amber-500/40"
                                        )}
                                      >
                                        {isOver ? "🚨" : "⚠️"} {pct.toFixed(0)}% teto
                                      </span>
                                    );
                                  })()}
                                </div>
                              </TableCell>
                            )}
                            {visibleCols.has("produto") && <TableCell className={cn(padY, txtSize)}>{o.produto_real}</TableCell>}
                            {visibleCols.has("nicho") && <TableCell className={padY}><Badge variant="outline" className="text-xs font-normal">{NICHO_LABEL[o.nicho]}</Badge></TableCell>}
                            {visibleCols.has("geo") && <TableCell className={cn(padY, txtSize)}><span className="mr-1">{GEO_FLAG[o.geo] ?? "🌐"}</span>{o.geo}</TableCell>}
                            {visibleCols.has("vendor") && <TableCell className={cn(padY, txtSize)}>{VENDOR_LABEL[o.vendor]}</TableCell>}
                            {visibleCols.has("ticket") && (
                              <TableCell className={cn(padY, "text-right tabular-nums", txtSize)}>
                                {fmtUSD((o as any).comissao_usd ?? o.cpa_target_brl)}
                              </TableCell>
                            )}
                            {/* Margem cell removed */}
                            {visibleCols.has("spark") && (
                              <TableCell className={cn(padY, "text-center")}>
                                <OfferSparkline offerId={o.id} />
                              </TableCell>
                            )}
                            {visibleCols.has("spend7d") && (
                              <TableCell className={cn(padY, "text-right tabular-nums", txtSize)}>
                                {traffic && traffic.spend_7d_brl > 0 ? fmtBRL(traffic.spend_7d_brl) : <span className="text-muted-foreground/40">—</span>}
                              </TableCell>
                            )}
                            {visibleCols.has("spend30d") && (
                              <TableCell className={cn(padY, "text-right tabular-nums", txtSize)}>
                                {traffic && traffic.spend_30d_brl > 0 ? fmtBRL(traffic.spend_30d_brl) : <span className="text-muted-foreground/40">—</span>}
                              </TableCell>
                            )}
                            {visibleCols.has("contas") && (
                              <TableCell className={cn(padY, "text-center")}>
                                {traffic && traffic.accounts_count > 0
                                  ? <Badge variant="outline" className="font-mono text-xs">{traffic.accounts_count}</Badge>
                                  : <span className="text-muted-foreground/40 text-xs">—</span>}
                              </TableCell>
                            )}
                            {visibleCols.has("vendas_hoje") && (
                              <TableCell className={cn(padY, "text-center")}>
                                {traffic && traffic.sales_today > 0
                                  ? <Badge variant="outline" className="font-mono text-xs bg-emerald-500/10 text-emerald-500 border-emerald-500/30">{traffic.sales_today}</Badge>
                                  : <span className="text-muted-foreground/40 text-xs">—</span>}
                              </TableCell>
                            )}
                            {visibleCols.has("spend_dia") && (
                              <TableCell className={cn(padY, "text-right tabular-nums", txtSize)}>
                                {dayMetrics?.get(o.id)?.spend_brl ? fmtBRL(dayMetrics.get(o.id)!.spend_brl) : <span className="text-muted-foreground/40">—</span>}
                              </TableCell>
                            )}
                            {visibleCols.has("vendas_dia") && (
                              <TableCell className={cn(padY, "text-center")}>
                                {dayMetrics?.get(o.id)?.sales
                                  ? <Badge variant="outline" className="font-mono text-xs bg-emerald-500/10 text-emerald-500 border-emerald-500/30">{dayMetrics.get(o.id)!.sales}</Badge>
                                  : <span className="text-muted-foreground/40 text-xs">—</span>}
                              </TableCell>
                            )}
                            {visibleCols.has("receita_dia") && (
                              <TableCell className={cn(padY, "text-right tabular-nums", txtSize)}>
                                {dayMetrics?.get(o.id)?.revenue_brl ? fmtBRL(dayMetrics.get(o.id)!.revenue_brl) : <span className="text-muted-foreground/40">—</span>}
                              </TableCell>
                            )}
                            {visibleCols.has("roi_dia") && (
                              <TableCell className={cn(padY, "text-center")}><RoiBadge roi={dayMetrics?.get(o.id)?.roi ?? null} /></TableCell>
                            )}
                            {visibleCols.has("vsls") && (
                              <TableCell className={cn(padY, "text-center")}>
                                {vslCounts?.get(o.id)
                                  ? <Badge variant="outline" className="font-mono text-xs">{vslCounts.get(o.id)}</Badge>
                                  : <span className="text-muted-foreground/40 text-xs">—</span>}
                              </TableCell>
                            )}
                            {visibleCols.has("spend_hoje") && (
                              <TableCell className={cn(padY, "text-right tabular-nums", txtSize)}>
                                {traffic && traffic.spend_today_brl > 0 ? fmtBRL(traffic.spend_today_brl) : <span className="text-muted-foreground/40">—</span>}
                              </TableCell>
                            )}
                            {visibleCols.has("receita_hoje") && (
                              <TableCell className={cn(padY, "text-right tabular-nums", txtSize)}>
                                {traffic && traffic.revenue_today_brl > 0 ? fmtBRL(traffic.revenue_today_brl) : <span className="text-muted-foreground/40">—</span>}
                              </TableCell>
                            )}
                            {visibleCols.has("roi_hoje") && (
                              <TableCell className={cn(padY, "text-center")}>
                                <RoiBadge roi={traffic && traffic.spend_today_brl > 0 ? traffic.revenue_today_brl / traffic.spend_today_brl : null} />
                              </TableCell>
                            )}
                            {visibleCols.has("receita7d") && (
                              <TableCell className={cn(padY, "text-right tabular-nums", txtSize)}>
                                {traffic && traffic.revenue_7d_brl > 0 ? fmtBRL(traffic.revenue_7d_brl) : <span className="text-muted-foreground/40">—</span>}
                              </TableCell>
                            )}
                            {visibleCols.has("receita30d") && (
                              <TableCell className={cn(padY, "text-right tabular-nums", txtSize)}>
                                {traffic && traffic.revenue_30d_brl > 0 ? fmtBRL(traffic.revenue_30d_brl) : <span className="text-muted-foreground/40">—</span>}
                              </TableCell>
                            )}
                            {visibleCols.has("roi7d") && <TableCell className={cn(padY, "text-center")}><RoiBadge roi={traffic?.roi_7d ?? null} /></TableCell>}
                            {visibleCols.has("health") && <TableCell className={cn(padY, "text-center")}><HealthBadge health={health} /></TableCell>}
                            {visibleCols.has("inicio") && <TableCell className={cn(padY, "text-muted-foreground", txtSize)}>{fmtDate(o.data_inicio)}</TableCell>}
                            {visibleCols.has("lifetime") && (
                              <TableCell className={cn(padY, txtSize)}>
                                {lifetime != null ? <span className={o.status === "morta" ? "text-muted-foreground" : ""}>{lifetime}d{o.status === "morta" ? " ✕" : ""}</span> : "—"}
                              </TableCell>
                            )}
                            {visibleCols.has("acoes") && (
                              <TableCell className={cn(padY, "text-right")} data-no-row-click>
                                <div className="flex justify-end gap-0.5 opacity-50 group-hover:opacity-100 transition-opacity">
                                  <Button variant="ghost" size="icon" className="h-7 w-7" title="Ver detalhes" onClick={() => setSelectedOffer(o)}>
                                    <Eye className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" title="Espionar concorrentes" onClick={() => goToSpy(o)}>
                                    <Radar className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" title="Editar" onClick={() => { setEditingOffer(o); setWizardOpen(true); }}>
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" title="Arquivar" onClick={() => handleArchive(o)}>
                                    <Archive className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10" title="Excluir permanentemente" onClick={() => handleDelete(o)}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>

                                </div>
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bulk actions bar */}
      <OffersBulkActionsBar
        count={selected.size}
        onCompare={() => setCompareOpen(true)}
        onArchive={handleBulkArchive}
        onExport={handleBulkExport}
        onDelete={handleBulkDelete}
        onClear={() => setSelected(new Set())}
      />

      {/* Compare drawer */}
      <OfferCompareDrawer
        offers={selectedOffers}
        trafficMap={trafficMap}
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
      />

      {/* Drawer detalhes */}
      <OfferDetailDrawer
        offer={selectedOffer}
        open={!!selectedOffer}
        onClose={() => setSelectedOffer(null)}
        onEdit={(o) => { setSelectedOffer(null); setEditingOffer(o); setWizardOpen(true); }}
        onStatusChange={handleStatusChangeRequest}
      />

      {/* Wizard */}
      <OfferWizardDialog
        open={wizardOpen}
        onClose={() => { setWizardOpen(false); setEditingOffer(null); setWizardPrefill(null); }}
        editing={editingOffer}
        prefill={wizardPrefill}
        onSaved={() => qc.invalidateQueries({ queryKey: ["offers"] })}
      />

      {/* Status change dialog */}
      {statusChange && (
        <OfferStatusChangeDialog
          offer={statusChange.offer}
          newStatus={statusChange.newStatus}
          onClose={() => setStatusChange(null)}
          onSaved={() => {
            setStatusChange(null);
            qc.invalidateQueries({ queryKey: ["offers"] });
            const fresh = offers.find((o) => o.id === statusChange.offer.id);
            if (fresh) setSelectedOffer(fresh);
          }}
        />
      )}

      {/* Benchmarks dialog */}
      <OfferBenchmarksDialog
        open={benchmarksOpen}
        onClose={() => setBenchmarksOpen(false)}
        operationId={operationId}
      />

      {/* ───── Diagnósticos (somente admin) ───── */}
      {isAdmin && (
        <div className="mt-12 pt-6 border-t border-border/50 space-y-3">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
            <AlertTriangle className="h-3.5 w-3.5" />
            Diagnósticos internos · admin
          </div>



          {/* Insights banner (Tier 1) */}
          <OffersInsightsBanner offers={offers} trafficMap={trafficMap} onApplyFilter={handleInsightClick} />

          {/* Orphan tags banner */}
          {orphanTags && orphanTags.length > 0 && (
            <Card className="p-3 border-l-2 border-l-amber-500/60 border-y border-r border-border/50 bg-amber-500/[0.03] shadow-none">
              <div className="flex items-start gap-2 text-xs">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500/80 mt-0.5" />
                <div className="flex-1">
                  <div className="text-foreground/80 font-medium mb-1.5">
                    {orphanTags.length} tag{orphanTags.length > 1 ? "s" : ""} rodando hoje sem offer cadastrada
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {orphanTags.map((t) => (
                      <button
                        key={t.tag}
                        onClick={() => { setEditingOffer(null); setWizardOpen(true); }}
                        className="font-mono text-[11px] px-2 py-0.5 rounded border border-border/60 bg-background/60 text-foreground/70 hover:border-amber-500/40 hover:text-amber-500 hover:bg-amber-500/5 transition-colors"
                        title={`${t.campaigns_count} campanha(s) · ${fmtBRL(t.spend_brl)} hoje · clique para criar offer`}
                      >
                        [{t.tag}] · {fmtBRL(t.spend_brl)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Twins warning */}
          {twins.size > 0 && (
            <Card className="p-2.5 border-l-2 border-l-amber-500/60 border-y border-r border-border/50 bg-amber-500/[0.03] shadow-none">
              <div className="flex items-center gap-2 text-xs text-foreground/70">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500/80" />
                <span>
                  <b className="text-foreground/90">{twins.size}</b> grupo{twins.size > 1 ? "s" : ""} com ofertas gêmeas (mesmo nicho+geo, ativas):{" "}
                  {Array.from(twins.entries()).slice(0, 3).map(([k, arr]) => (
                    <span key={k} className="font-mono mr-3 text-foreground/80">
                      {arr.map((o) => o.apelido_interno).join(" × ")}
                    </span>
                  ))}
                </span>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────── subcomponents ─────────── */
function KpiCard({ label, value, valueClass }: { label: string; value: number | string; valueClass?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className={`text-2xl font-bold mt-1 tabular-nums ${valueClass ?? "text-foreground"}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function FilterDropdown({
  label, options, selected, onToggle, onClear,
}: {
  label: string;
  options: { value: string; label: string; count: number; dot?: string }[];
  selected: Set<string>;
  onToggle: (v: string) => void;
  onClear: () => void;
}) {
  const count = selected.size;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("h-9 gap-1.5", count > 0 && "border-primary/40 bg-primary/5 text-primary")}>
          {label}
          {count > 0 && <Badge variant="outline" className="h-4 px-1 text-[10px] font-normal border-primary/40 bg-primary/15 text-primary">{count}</Badge>}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <div className="space-y-0.5 max-h-72 overflow-y-auto">
          {options.map((opt) => {
            const active = selected.has(opt.value);
            return (
              <button
                key={opt.value}
                onClick={() => onToggle(opt.value)}
                className={cn("w-full flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors", active && "bg-primary/10 text-primary")}
              >
                <span className="flex items-center gap-2 truncate">
                  {opt.dot && <span className={cn("h-2 w-2 rounded-full shrink-0", opt.dot)} />}
                  <span className="truncate">{opt.label}</span>
                </span>
                <span className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] text-muted-foreground tabular-nums">{opt.count}</span>
                  {active && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                </span>
              </button>
            );
          })}
        </div>
        {count > 0 && (
          <>
            <div className="border-t my-1" />
            <button onClick={onClear} className="w-full text-xs text-muted-foreground hover:text-foreground py-1 px-2 text-left">
              Limpar {label.toLowerCase()}
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

function ActiveChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 text-[11px] text-primary">
      {label}
      <button onClick={onRemove} className="hover:bg-primary/20 rounded-sm p-0.5">
        <X className="h-2.5 w-2.5" />
      </button>
    </span>
  );
}

function SortHead({
  label, k, sortKey, sortDir, onClick, className,
}: { label: string; k: SortKey; sortKey: SortKey; sortDir: SortDir; onClick: (k: SortKey) => void; className?: string }) {
  const active = sortKey === k;
  return (
    <TableHead className={className}>
      <button onClick={() => onClick(k)} className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${active ? "text-foreground" : ""}`}>
        {label}
        <ArrowUpDown className={`h-3 w-3 ${active ? "text-primary" : "text-muted-foreground/50"}`} />
        {active && <span className="text-[10px] text-muted-foreground">{sortDir === "asc" ? "↑" : "↓"}</span>}
      </button>
    </TableHead>
  );
}

function RoiBadge({ roi }: { roi: number | null }) {
  if (roi == null) return <span className="text-muted-foreground/40 text-xs">—</span>;
  let cls = "bg-red-500/15 text-red-500 border-red-500/30";
  if (roi >= 1.2) cls = "bg-emerald-500/15 text-emerald-500 border-emerald-500/30";
  else if (roi >= 1.0) cls = "bg-amber-500/15 text-amber-500 border-amber-500/30";
  return <Badge variant="outline" className={`${cls} font-mono text-xs tabular-nums`}>{roi.toFixed(2)}x</Badge>;
}

function HealthBadge({ health }: { health: { score: number; tone: "good" | "warn" | "bad" | "neutral"; reasons: string[] } }) {
  if (health.tone === "neutral") return <span className="text-muted-foreground/40 text-xs">—</span>;
  const barCls =
    health.tone === "good" ? "bg-emerald-500"
    : health.tone === "warn" ? "bg-amber-500"
    : "bg-red-500";
  const txtCls =
    health.tone === "good" ? "text-emerald-500"
    : health.tone === "warn" ? "text-amber-500"
    : "text-red-500";
  const pct = Math.max(2, Math.min(100, health.score));
  return (
    <div
      className="inline-flex flex-col items-end gap-1 cursor-help min-w-[52px]"
      title={health.reasons.join(" · ")}
    >
      <span className={cn("text-[11px] font-mono font-semibold tabular-nums leading-none", txtCls)}>
        {health.score}
      </span>
      <div className="w-12 h-1 rounded-full bg-muted/40 overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", barCls)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
