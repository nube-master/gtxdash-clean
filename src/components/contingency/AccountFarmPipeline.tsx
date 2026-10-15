import { useMemo, useState, useEffect, useRef, memo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Flame, Settings2, AlertCircle, CheckCircle2, Search, Save, Loader2,
  RefreshCw, Globe, CreditCard, Hourglass, Moon, GripVertical, RotateCcw,
  TrendingUp, Calendar, ExternalLink, Sparkles, Pause, Skull, AlertTriangle, Megaphone,
} from "lucide-react";
import { toast } from "sonner";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useAccountStatusHistory, type StatusLogEntry } from "@/hooks/useAccountStatusHistory";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors, useDraggable,
  useDroppable, closestCorners, type DragStartEvent, type DragEndEvent,
} from "@dnd-kit/core";
import {
  getInactiveReason, computeRecentDrops, sortRowsForStage,
  INACTIVE_REASON_META,
  computeForecast, isZombieReady, avgDaysInStage, computeStageChurn, computeBurnRate,
  type InactiveReason, type SortMode,
} from "./farm/farmHelpers";
import { InactiveReasonPills, ColumnSortMenu } from "./farm/ColumnControls";
import { BulkActionBar } from "./farm/BulkActionBar";
import { ForecastBanner, StageHeaderMetrics } from "./farm/StageInsights";
import { useFarmAccountSparklines } from "@/hooks/useFarmAccountSparklines";
import { useOperationId } from "@/contexts/OperationContext";
import { Sparkline } from "@/components/ui/sparkline";
import { useFarmOwners, ownerInitials, type FarmOwnerProfile } from "@/hooks/useFarmOwners";
import { FarmHealthDrawer } from "./farm/FarmHealthDrawer";
import { DensityToggle, useDensity, type Density } from "./farm/DensityToggle";
import { OriginBadge } from "./farm/OriginBadge";
import { useIsMobile } from "@/hooks/use-mobile";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Activity } from "lucide-react";
import { extractProjectCodeFromNaming } from "@/lib/projectUtils";
import { useOfferProjects } from "@/hooks/useOfferProjects";

// Tags obrigatórias (com colchetes) para identificar campanhas de farm/aquecimento
const FARM_TAGS = ["[FARM]", "[AQUECIMENTO]"];

function isFarmCampaignName(name: string | null | undefined): boolean {
  if (!name) return false;
  const upper = name.toUpperCase();
  return FARM_TAGS.some((tag) => upper.includes(tag));
}

const SETTINGS_KEY = "farm_pipeline_thresholds";
const OVERRIDES_KEY = "farm_pipeline_overrides";

interface Thresholds {
  warmingMaxDays: number;
  almostMaxDays: number;
}

const DEFAULT_THRESHOLDS: Thresholds = { warmingMaxDays: 4, almostMaxDays: 6 };

type Stage = "no_ads" | "warming" | "almost" | "ready" | "advertising" | "inactive";
type OverrideMap = Record<string, Stage>;

function autoStageOf(
  days: number | null,
  t: Thresholds,
  accountStatus: number | null | undefined,
  isAdvertising: boolean,
): Stage {
  if (accountStatus !== 1 && accountStatus !== null && accountStatus !== undefined) return "inactive";
  // Conta com campanha ativa de projeto real ([NDM],[CBCODE],etc) → Anunciando.
  // Tem prioridade sobre warming/almost/ready, mas não sobre "inativa".
  if (isAdvertising) return "advertising";
  if (days === null) return "no_ads";
  if (days <= t.warmingMaxDays) return "warming";
  if (days <= t.almostMaxDays) return "almost";
  return "ready";
}

interface StageMeta {
  label: string;
  icon: typeof Flame;
  color: string;
  bg: string;
  border: string;
  headerBg: string;
  accent: string;
  glow: string;
  ring: string;
  hex: string;
}

const stageMeta: Record<Stage, StageMeta> = {
  warming: {
    label: "Aquecendo",
    icon: Flame,
    color: "text-orange-400",
    bg: "bg-orange-500/[0.06]",
    border: "border-orange-500/25",
    headerBg: "bg-gradient-to-b from-orange-500/20 via-orange-500/10 to-transparent",
    accent: "bg-orange-500",
    glow: "shadow-[0_0_20px_-4px_rgba(251,146,60,0.4)]",
    ring: "ring-orange-500/40",
    hex: "#fb923c",
  },
  almost: {
    label: "Quase Pronta",
    icon: Hourglass,
    color: "text-amber-400",
    bg: "bg-amber-500/[0.06]",
    border: "border-amber-500/25",
    headerBg: "bg-gradient-to-b from-amber-500/20 via-amber-500/10 to-transparent",
    accent: "bg-amber-500",
    glow: "shadow-[0_0_20px_-4px_rgba(251,191,36,0.4)]",
    ring: "ring-amber-500/40",
    hex: "#fbbf24",
  },
  ready: {
    label: "Pronta",
    icon: CheckCircle2,
    color: "text-emerald-400",
    bg: "bg-emerald-500/[0.06]",
    border: "border-emerald-500/25",
    headerBg: "bg-gradient-to-b from-emerald-500/20 via-emerald-500/10 to-transparent",
    accent: "bg-emerald-500",
    glow: "shadow-[0_0_20px_-4px_rgba(52,211,153,0.4)]",
    ring: "ring-emerald-500/40",
    hex: "#34d399",
  },
  no_ads: {
    label: "Sem anúncios",
    icon: Moon,
    color: "text-slate-400",
    bg: "bg-slate-500/[0.04]",
    border: "border-slate-500/20",
    headerBg: "bg-gradient-to-b from-slate-500/15 via-slate-500/5 to-transparent",
    accent: "bg-slate-500",
    glow: "",
    ring: "ring-slate-500/40",
    hex: "#94a3b8",
  },
  inactive: {
    label: "Inativa / Caída",
    icon: AlertCircle,
    color: "text-rose-400",
    bg: "bg-rose-500/[0.06]",
    border: "border-rose-500/25",
    headerBg: "bg-gradient-to-b from-rose-500/20 via-rose-500/10 to-transparent",
    accent: "bg-rose-500",
    glow: "shadow-[0_0_20px_-4px_rgba(251,113,133,0.4)]",
    ring: "ring-rose-500/40",
    hex: "#fb7185",
  },
  advertising: {
    label: "Anunciando (ACTIVE)",
    icon: Megaphone,
    color: "text-cyan-400",
    bg: "bg-cyan-500/[0.06]",
    border: "border-cyan-500/25",
    headerBg: "bg-gradient-to-b from-cyan-500/20 via-cyan-500/10 to-transparent",
    accent: "bg-cyan-500",
    glow: "shadow-[0_0_20px_-4px_rgba(34,211,238,0.4)]",
    ring: "ring-cyan-500/40",
    hex: "#22d3ee",
  },
};

const STAGE_ORDER: Stage[] = ["no_ads", "warming", "almost", "ready", "advertising", "inactive"];

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

export interface AccountFarmPipelineProps {
  /** Optional set of account_ids to restrict the pipeline to (driven by upstream panels). */
  externalAccountIds?: Set<string> | null;
  /** Human label shown in the active filter chip (e.g. "🇧🇷 São Paulo (BRT)" or "NDM"). */
  externalFilterLabel?: string | null;
  /** Optional callback invoked when the user clears the chip. */
  onClearExternalFilter?: () => void;
}

export default function AccountFarmPipeline({
  externalAccountIds = null,
  externalFilterLabel = null,
  onClearExternalFilter,
}: AccountFarmPipelineProps = {}) {
  const queryClient = useQueryClient();
  const { dateRange } = useDateRange();
  const [startDate, endDate] = dateRange;
  const [search, setSearch] = useState("");

  const [stageFilter, setStageFilter] = useState<Stage | "all">("all");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [detailAccountId, setDetailAccountId] = useState<string | null>(null);
  const [historyStage, setHistoryStage] = useState<Stage | null>(null);

  // Fase 1: novos estados
  const [inactiveReason, setInactiveReason] = useState<InactiveReason>("all");
  const [sortByStage, setSortByStage] = useState<Record<Stage, SortMode>>({
    warming: "smart", almost: "smart", ready: "smart", advertising: "smart", inactive: "smart", no_ads: "smart",
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Logs recentes (2 dias) só pra detectar "caiu nas últimas 24h"
  const { data: recentLog } = useAccountStatusHistory(2);
  const recentDrops = useMemo(() => computeRecentDrops(recentLog, 24), [recentLog]);

  // Log 7d pra métricas por coluna (churn) e burn rate global
  const { data: weekLog } = useAccountStatusHistory(90);

  // Fase 3: density, owners, health drawer, owner filter
  const [density, setDensity] = useDensity();
  const isMobile = useIsMobile();
  // No mobile, "detailed" causaria overflow no top row do card — limita visualmente a "comfortable"
  const effectiveDensity: Density = isMobile && density === "detailed" ? "comfortable" : density;
  const [healthOpen, setHealthOpen] = useState(false);
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const opId = useOperationId();
  const { owners, members, saveOwner } = useFarmOwners();
  const memberById = useMemo(() => {
    const m = new Map<string, FarmOwnerProfile>();
    members.forEach((p) => m.set(p.user_id, p));
    return m;
  }, [members]);

  const thresholdsQueryKey = useMemo(() => ["farm-pipeline-thresholds", opId] as const, [opId]);
  const overridesQueryKey = useMemo(() => ["farm-pipeline-overrides", opId] as const, [opId]);

  const { data: thresholds } = useQuery({
    queryKey: thresholdsQueryKey,
    enabled: !!opId,
    queryFn: async (): Promise<Thresholds> => {
      if (!opId) return DEFAULT_THRESHOLDS;
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", SETTINGS_KEY)
        .eq("operation_id", opId)
        .maybeSingle();
      const v = (data?.value as any) || {};
      return {
        warmingMaxDays: Number(v.warmingMaxDays ?? DEFAULT_THRESHOLDS.warmingMaxDays),
        almostMaxDays: Number(v.almostMaxDays ?? DEFAULT_THRESHOLDS.almostMaxDays),
      };
    },
  });
  const t = thresholds ?? DEFAULT_THRESHOLDS;

  const { data: overrides } = useQuery({
    queryKey: overridesQueryKey,
    enabled: !!opId,
    queryFn: async (): Promise<OverrideMap> => {
      if (!opId) return {};
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", OVERRIDES_KEY)
        .eq("operation_id", opId)
        .maybeSingle();
      return ((data?.value as any) || {}) as OverrideMap;
    },
  });

  const saveOverrides = useMutation({
    mutationFn: async (next: OverrideMap) => {
      if (!opId) throw new Error("Operação ativa não encontrada.");
      const { error } = await supabase
        .from("app_settings")
        .upsert({ key: OVERRIDES_KEY, value: next as any, operation_id: opId }, { onConflict: "key,operation_id" });
      if (error) throw error;
    },
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: overridesQueryKey });
      const prev = queryClient.getQueryData<OverrideMap>(overridesQueryKey);
      queryClient.setQueryData(overridesQueryKey, next);
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(overridesQueryKey, ctx.prev);
      toast.error("Não foi possível salvar a posição.");
    },
    onSuccess: () => toast.success("Posição salva", { duration: 1500 }),
  });

  const { data: farmSpendData, isLoading: loadingFarmSpend } = useQuery({
    queryKey: ["farm-campaign-spend", startDate, endDate, opId],
    enabled: !!opId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("traffic_data")
        .select("account_id, campaign_name, spend:spend_brl, date")
        .eq("operation_id", opId!)
        .gte("date", startDate)
        .lte("date", endDate)
        .or("campaign_name.ilike.%[FARM]%,campaign_name.ilike.%[AQUECIMENTO]%")
        .limit(10000);
      if (error) throw error;
      const farmRows = (data || []).filter((r: any) => isFarmCampaignName(r.campaign_name));
      const totalSpend = farmRows.reduce((sum, r: any) => sum + Number(r.spend || 0), 0);
      const uniqueDates = new Set(farmRows.map((r: any) => r.date));
      const uniqueCampaigns = new Set(farmRows.map((r: any) => r.campaign_name));

      // Mapeia origem por conta agregando tags presentes nas campanhas de cada account_id.
      // Para AQUECIMENTO, exigimos atividade recente (últimos 7 dias) — campanhas antigas
      // de aquecimento não devem classificar a conta como "em aquecimento" hoje.
      const RECENT_WINDOW_DAYS = 7;
      const recentCutoff = new Date();
      recentCutoff.setDate(recentCutoff.getDate() - RECENT_WINDOW_DAYS);
      const recentCutoffStr = recentCutoff.toISOString().slice(0, 10);

      const tagsByAccount = new Map<string, { farm: boolean; aquecRecent: boolean; aquecStart: string | null }>();
      for (const r of farmRows as any[]) {
        const upper = String(r.campaign_name || "").toUpperCase();
        const acc = String(r.account_id || "");
        if (!acc) continue;
        const cur = tagsByAccount.get(acc) || { farm: false, aquecRecent: false, aquecStart: null };
        if (upper.includes("[FARM]")) cur.farm = true;
        if (upper.includes("[AQUECIMENTO]")) {
          const dateStr = String(r.date);
          const isRecent = dateStr >= recentCutoffStr && Number(r.spend || 0) > 0;
          if (isRecent) cur.aquecRecent = true;
          // Guarda a 1ª data em que essa conta apareceu com [AQUECIMENTO] (qualquer spend)
          // — usada pra contar dias na esteira.
          if (!cur.aquecStart || dateStr < cur.aquecStart) cur.aquecStart = dateStr;
        }
        tagsByAccount.set(acc, cur);
      }
      const originByAccount: Record<string, "farm" | "aquecimento"> = {};
      const aquecStartByAccount: Record<string, string> = {};
      tagsByAccount.forEach((v, k) => {
        originByAccount[k] = v.aquecRecent ? "aquecimento" : "farm";
        if (v.aquecStart) aquecStartByAccount[k] = v.aquecStart;
      });

      return {
        totalSpend,
        dailyAverage: totalSpend / Math.max(1, uniqueDates.size),
        numDays: uniqueDates.size,
        numCampaigns: uniqueCampaigns.size,
        originByAccount,
        aquecStartByAccount,
      };
    },
  });

  // Account_ids extras (não-farm) que estão em aquecimento ativo recente — alugadas/compradas.
  const aquecAccountIds = useMemo(() => {
    const map = farmSpendData?.originByAccount || {};
    return Object.entries(map).filter(([, o]) => o === "aquecimento").map(([id]) => id);
  }, [farmSpendData]);

  // Registra apelidos dinâmicos de offers (apelido_interno → tag de projeto)
  // pra que extractProjectCodeFromNaming reconheça [NEM], [CBCODE], etc.
  useOfferProjects();

  // Campanhas ACTIVE com tag de projeto → identifica contas "Anunciando".
  const { data: activeCampaigns } = useQuery({
    queryKey: ["farm-pipeline-active-campaigns", opId],
    enabled: !!opId,
    queryFn: async () => {
      const PAGE_SIZE = 1000;
      let all: any[] = [];
      let from = 0;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase
          .from("meta_campaign_status")
          .select("account_id, campaign_name, effective_status")
          .eq("effective_status", "ACTIVE")
          .eq("operation_id", opId!)
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        all = all.concat(data || []);
        hasMore = (data?.length || 0) === PAGE_SIZE;
        from += PAGE_SIZE;
      }
      return all;
    },
    staleTime: 60_000,
  });

  /**
   * "Anunciando" = conta com QUALQUER campanha ACTIVE no Meta (effective_status=ACTIVE).
   * Antes exigíamos tag de projeto reconhecida ([NDM], [CBCODE], ...) — isso subcontava
   * contas anunciando com nomenclatura fora do padrão (mostrava 4 em vez de 12+).
   */
  const advertisingAccountIds = useMemo(() => {
    const set = new Set<string>();
    for (const c of activeCampaigns || []) set.add(String(c.account_id));
    return set;
  }, [activeCampaigns]);

  /** account_id → projetos detectados nas campanhas ACTIVE (para filtro de projeto). */
  const projectsByAccount = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const c of activeCampaigns || []) {
      const code = extractProjectCodeFromNaming(c.campaign_name || "");
      if (!code || code === "OUTROS") continue;
      const acc = String(c.account_id);
      if (!m[acc]) m[acc] = [];
      if (!m[acc].includes(code)) m[acc].push(code);
    }
    return m;
  }, [activeCampaigns]);


  const { data: accounts, isLoading } = useQuery({
    queryKey: ["meta-ad-accounts-farm-all", aquecAccountIds.join(","), opId],
    enabled: !!opId,
    queryFn: async () => {
      // 1) Contas farm próprias (category=farm).
      const farmQ = supabase
        .from("meta_ad_accounts")
        .select("account_id, account_name, account_status, currency, timezone, category, is_active, created_at, first_ad_date")
        .eq("category", "farm")
        .eq("operation_id", opId!);
      // 2) Contas alugadas/compradas com [AQUECIMENTO] ativo recente (qualquer category).
      const aquecQ = aquecAccountIds.length > 0
        ? supabase
            .from("meta_ad_accounts")
            .select("account_id, account_name, account_status, currency, timezone, category, is_active, created_at, first_ad_date")
            .eq("operation_id", opId!)
            .in("account_id", aquecAccountIds)
        : null;
      // 3) TODAS as contas ativas no sistema (is_active=true + account_status=1) —
      //    cobre contas próprias/alugadas/compradas que já estão anunciando ofertas reais
      //    ou aguardando entrar na esteira.
      const allActiveQ = supabase
        .from("meta_ad_accounts")
        .select("account_id, account_name, account_status, currency, timezone, category, is_active, created_at, first_ad_date")
        .eq("is_active", true)
        .eq("account_status", 1)
        .eq("operation_id", opId!);
      // 4) TODAS as contas DESABILITADAS/CAÍDAS da operação — precisam aparecer no
      //    cambão "Inativa / Caída" mesmo sem serem farm/aquec, só que em cinza.
      const disabledQ = supabase
        .from("meta_ad_accounts")
        .select("account_id, account_name, account_status, currency, timezone, category, is_active, created_at, first_ad_date")
        .eq("operation_id", opId!)
        .or("is_active.eq.false,account_status.neq.1");
      const [farmRes, aquecRes, allRes, disabledRes] = await Promise.all([
        farmQ,
        aquecQ ?? Promise.resolve({ data: [], error: null } as any),
        allActiveQ,
        disabledQ,
      ]);
      if (farmRes.error) throw farmRes.error;
      if (aquecRes.error) throw aquecRes.error;
      if (allRes.error) throw allRes.error;
      if (disabledRes.error) throw disabledRes.error;
      const map = new Map<string, any>();
      const pipelineIds = new Set<string>();
      (farmRes.data || []).forEach((a: any) => { map.set(a.account_id, a); pipelineIds.add(a.account_id); });
      (aquecRes.data || []).forEach((a: any) => { map.set(a.account_id, a); pipelineIds.add(a.account_id); });
      (allRes.data || []).forEach((a: any) => { map.set(a.account_id, a); pipelineIds.add(a.account_id); });
      // Desabilitadas entram só como "shadow" no cambão de inativas.
      (disabledRes.data || []).forEach((a: any) => {
        if (!map.has(a.account_id)) map.set(a.account_id, { ...a, _disabledOnly: true });
      });
      return Array.from(map.values());
    },
  });


  const { data: financials } = useQuery({
    queryKey: ["meta-account-financials-farm", opId],
    enabled: !!opId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meta_account_financials")
        .select("account_id, payment_method_type, card_brand, card_last4")
        .eq("operation_id", opId!);
      if (error) throw error;
      return data || [];
    },
  });

  const finMap = useMemo(() => {
    const m = new Map<string, { payment_method_type: string | null; card_brand: string | null; card_last4: string | null }>();
    (financials || []).forEach((f: any) =>
      m.set(f.account_id, {
        payment_method_type: f.payment_method_type,
        card_brand: f.card_brand,
        card_last4: f.card_last4,
      }),
    );
    return m;
  }, [financials]);

  const accountIds = useMemo(() => (accounts || []).map((a: any) => a.account_id), [accounts]);
  const { data: sparkData } = useFarmAccountSparklines(accountIds);

  const rows = useMemo(() => {
    const ov = overrides || {};
    const originMap = farmSpendData?.originByAccount || {};
    const aquecStartMap = farmSpendData?.aquecStartByAccount || {};
    return (accounts || []).map((a: any) => {
      const origin: "farm" | "aquecimento" = originMap[a.account_id] || "farm";
      // Para contas em AQUECIMENTO: dias contam desde a 1ª campanha [AQUECIMENTO] vista.
      // Fallback pra first_ad_date se não temos data (raro — não cobre janela de busca).
      const baseDateStr = origin === "aquecimento"
        ? (aquecStartMap[a.account_id] || a.first_ad_date)
        : a.first_ad_date;
      const daysFromBase = daysSince(baseDateStr);
      const sparkForAccount = sparkData?.sparkByAccount[a.account_id];
      const sparkDates = sparkData?.dates;
      const firstSpendIdx = sparkForAccount?.findIndex((v: number) => Number(v) > 0) ?? -1;
      const daysFromSpark = firstSpendIdx >= 0 && sparkDates?.[firstSpendIdx]
        ? daysSince(sparkDates[firstSpendIdx])
        : null;
      // Se a data base veio truncada pelo filtro atual (ex.: só hoje), mas o sparkline 7d
      // mostra gasto anterior, usa o maior valor para exibir/classificar Aquecendo/Quase pronta.
      const days = daysFromBase !== null && daysFromSpark !== null
        ? Math.max(daysFromBase, daysFromSpark)
        : (daysFromBase ?? daysFromSpark);
      const isAdvertising = advertisingAccountIds.has(a.account_id);
      const autoStage = autoStageOf(days, t, a.account_status, isAdvertising);
      const overrideStage = ov[a.account_id];
      const stage: Stage = overrideStage ?? autoStage;
      const reason = getInactiveReason(a.account_status, days);
      const zombie = isZombieReady(
        { stage, account_status: a.account_status, account_id: a.account_id },
        sparkData?.spendLast48h,
      );
      const ownerUserId = owners[a.account_id] || null;
      const ownerProfile = ownerUserId ? memberById.get(ownerUserId) || null : null;
      return {
        ...a,
        days,
        stage,
        autoStage,
        isOverridden: !!overrideStage && overrideStage !== autoStage,
        financials: finMap.get(a.account_id) || null,
        inactiveReason: reason,
        recentlyDropped: recentDrops.has(a.account_id),
        zombieReady: zombie,
        spark: sparkForAccount,
        sparkDates,
        ownerUserId,
        ownerProfile,
        origin,
        projects: projectsByAccount[a.account_id] || [],
      };
    });
  }, [accounts, t, finMap, overrides, recentDrops, sparkData, owners, memberById, farmSpendData, projectsByAccount, advertisingAccountIds]);


  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return rows
      .filter((r) => !externalAccountIds || externalAccountIds.has(r.account_id))
      .filter((r) => stageFilter === "all" || r.stage === stageFilter)
      .filter((r) => !q || r.account_name.toLowerCase().includes(q) || r.account_id.includes(q))
      .filter((r) => {
        if (ownerFilter === "all") return true;
        if (ownerFilter === "__none__") return !r.ownerUserId;
        return r.ownerUserId === ownerFilter;
      });
  }, [rows, search, stageFilter, ownerFilter, externalAccountIds]);


  const counts = useMemo(() => {
    const c = { warming: 0, almost: 0, ready: 0, advertising: 0, no_ads: 0, inactive: 0, total: rows.length };
    rows.forEach((r) => c[r.stage]++);
    return c;
  }, [rows]);

  // Contagem por motivo dentro da coluna Inativa
  const inactiveReasonCounts = useMemo(() => {
    const c: Record<Exclude<InactiveReason, "all">, number> = {
      bm_down: 0, limit: 0, policy: 0, no_ads: 0, other: 0,
    };
    rows.filter((r) => r.stage === "inactive").forEach((r) => {
      const k = r.inactiveReason as Exclude<InactiveReason, "all">;
      if (k in c) c[k]++;
    });
    return c;
  }, [rows]);

  const withAds = counts.total - counts.no_ads - counts.inactive;
  const readyPct = withAds > 0 ? (counts.ready / withAds) * 100 : 0;

  // Fase 2: insights agregados
  const readyInNext3d = useMemo(() => computeForecast(rows, t.almostMaxDays, 3), [rows, t.almostMaxDays]);
  const zombieReadyCount = useMemo(() => rows.filter((r) => r.zombieReady).length, [rows]);
  const burnedLast7d = useMemo(() => computeBurnRate(weekLog, 168), [weekLog]);

  // Métricas por coluna (avg dias + churn 7d)
  const stageMetrics = useMemo(() => {
    const m: Record<Stage, { avgDays: number | null; churn7d: number }> = {
      warming: { avgDays: null, churn7d: 0 },
      almost: { avgDays: null, churn7d: 0 },
      ready: { avgDays: null, churn7d: 0 },
      advertising: { avgDays: null, churn7d: 0 },
      inactive: { avgDays: null, churn7d: 0 },
      no_ads: { avgDays: null, churn7d: 0 },
    };
    (STAGE_ORDER as Stage[]).forEach((s) => {
      const stageRows = rows.filter((r) => r.stage === s);
      const ids = new Set(stageRows.map((r) => r.account_id));
      m[s] = {
        avgDays: avgDaysInStage(stageRows),
        churn7d: computeStageChurn(ids, weekLog, 168),
      };
    });
    return m;
  }, [rows, weekLog]);

  const syncFirstAds = async (force = false) => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-meta-first-ad", {
        body: { category: "farm", force },
      });
      if (error) throw error;
      const { ok = 0, no_ads = 0, errors = 0 } = data || {};
      toast.success(`Sincronizado: ${ok} ok · ${no_ads} sem anúncios · ${errors} erro(s)`);
      queryClient.invalidateQueries({ queryKey: ["meta-ad-accounts-farm"] });
    } catch (e: any) {
      toast.error(e?.message || "Erro ao sincronizar primeiro anúncio");
    } finally {
      setSyncing(false);
    }
  };

  const handleDragStart = (e: DragStartEvent) => setActiveDragId(String(e.active.id));
  const handleDragEnd = (e: DragEndEvent) => {
    setActiveDragId(null);
    const accountId = String(e.active.id);
    const targetStage = e.over?.id as Stage | undefined;
    if (!targetStage || !STAGE_ORDER.includes(targetStage)) return;
    const row = rows.find((r) => r.account_id === accountId);
    if (!row || row.stage === targetStage) return;
    const next = { ...(overrides || {}) };
    if (targetStage === row.autoStage) delete next[accountId];
    else next[accountId] = targetStage;
    saveOverrides.mutate(next);
  };

  // Callbacks estáveis pra memoização dos cards funcionar
  const overridesRef = useRef(overrides);
  overridesRef.current = overrides;
  const resetOverride = useMemo(
    () => (accountId: string) => {
      const next = { ...(overridesRef.current || {}) };
      delete next[accountId];
      saveOverrides.mutate(next);
    },
    [saveOverrides],
  );
  const handleCardClick = useMemo(
    () => (id: string) => setDetailAccountId(id),
    [],
  );

  /* ── Fase 1: Quick action — define stage manual de uma única conta ── */
  const setStageManual = useMemo(
    () => (accountId: string, targetStage: Stage) => {
      const row = rows.find((r) => r.account_id === accountId);
      if (!row || row.stage === targetStage) return;
      const next = { ...(overridesRef.current || {}) };
      if (targetStage === row.autoStage) delete next[accountId];
      else next[accountId] = targetStage;
      saveOverrides.mutate(next);
    },
    [rows, saveOverrides],
  );

  /* ── Fase 1: Bulk — move várias contas de uma vez ── */
  const toggleSelected = useMemo(
    () => (accountId: string, on: boolean) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (on) next.add(accountId); else next.delete(accountId);
        return next;
      });
    },
    [],
  );

  const bulkMove = (targetStage: Stage) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const next = { ...(overridesRef.current || {}) };
    let changed = 0;
    ids.forEach((id) => {
      const row = rows.find((r) => r.account_id === id);
      if (!row || row.stage === targetStage) return;
      if (targetStage === row.autoStage) delete next[id];
      else next[id] = targetStage;
      changed++;
    });
    if (changed === 0) {
      toast.info("Contas selecionadas já estão neste status.");
      return;
    }
    saveOverrides.mutate(next);
    setSelected(new Set());
    toast.success(`${changed} conta(s) movida(s).`);
  };

  const bulkExportCsv = () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const selectedRows = rows.filter((r) => ids.includes(r.account_id));
    const header = ["account_id", "account_name", "stage", "days", "account_status", "inactive_reason", "currency", "timezone"];
    const csv = [header.join(",")]
      .concat(selectedRows.map((r) => [
        r.account_id, `"${(r.account_name || "").replace(/"/g, '""')}"`,
        r.stage, r.days ?? "", r.account_status ?? "", r.inactiveReason,
        r.currency || "", r.timezone || "",
      ].join(",")))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `farm-contas-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const activeRow = activeDragId ? rows.find((r) => r.account_id === activeDragId) : null;
  const detailRow = detailAccountId ? rows.find((r) => r.account_id === detailAccountId) : null;


  return (
    <TooltipProvider delayDuration={150}>
    <Card className="warroom-card overflow-hidden relative">
      {/* Backdrop premium */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(251,146,60,0.08),transparent_60%)] pointer-events-none" />

      <CardContent className="p-6 space-y-5 relative">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="relative h-10 w-10 rounded-lg bg-gradient-to-br from-orange-500/30 via-orange-500/10 to-transparent border border-orange-500/30 flex items-center justify-center shadow-[0_0_18px_-4px_rgba(251,146,60,0.5)]">
            <Flame className="h-5 w-5 text-orange-400" />
            <div className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-orange-400 animate-pulse" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-foreground flex items-center gap-2">
              Esteira de Contas
              <Sparkles className="h-3 w-3 text-orange-400/70" />
            </h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Ciclo de vida das contas · arraste cards entre colunas · clique para ver detalhes
            </p>
          </div>
          <DensityToggle value={density} onChange={setDensity} />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="outline" onClick={() => setHealthOpen(true)} className="gap-1.5 h-8">
                <Activity className="h-3.5 w-3.5 text-orange-400" />
                <span className="text-xs">Saúde</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Visão consolidada da esteira</TooltipContent>
          </Tooltip>
          <Button size="sm" variant="outline" onClick={() => syncFirstAds(false)} disabled={syncing} className="gap-1.5">
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            <span className="text-xs">Sincronizar 1º anúncio</span>
          </Button>
          <FarmThresholdsDialog
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            current={t}
            onSaved={() => queryClient.invalidateQueries({ queryKey: thresholdsQueryKey })}
          />
        </div>

        {!isLoading && counts.total === 0 && (
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <Flame className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
            <p className="text-sm font-semibold text-foreground">Nenhuma conta ativa encontrada</p>
            <p className="text-xs text-muted-foreground mt-1">
              Cadastre contas em Integrações → Meta Ads (ativas com status 1)
              para visualizar a esteira completa.
            </p>
          </div>
        )}

        {counts.total > 0 && (
          <>
            {counts.no_ads > 0 && (
              <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/20 p-3 backdrop-blur-sm">
                <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="text-xs flex-1">
                  <span className="font-semibold text-foreground">{counts.no_ads} conta(s)</span>
                  <span className="text-muted-foreground"> sem data do 1º anúncio. Clique em <em>Sincronizar 1º anúncio</em>.</span>
                </div>
                <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => syncFirstAds(true)} disabled={syncing}>
                  Forçar sync
                </Button>
              </div>
            )}

            <FarmSpendKpi
              totalSpend={farmSpendData?.totalSpend ?? 0}
              dailyAverage={farmSpendData?.dailyAverage ?? 0}
              numDays={farmSpendData?.numDays ?? 0}
              numCampaigns={farmSpendData?.numCampaigns ?? 0}
              loading={loadingFarmSpend}
              periodLabel={startDate === endDate ? startDate : `${startDate} → ${endDate}`}
            />

            {/* Distribution bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground uppercase tracking-wider">Disponibilidade da Esteira</span>
                <span className="font-mono font-semibold text-foreground">
                  {counts.ready} de {withAds} prontas ({readyPct.toFixed(0)}%)
                  {counts.inactive > 0 && <span className="text-rose-400 ml-1">· {counts.inactive} caídas</span>}
                </span>
              </div>
              <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-secondary/60 border border-border/40">
                {counts.no_ads > 0 && <div className="bg-muted" style={{ width: `${(counts.no_ads / counts.total) * 100}%` }} />}
                {counts.warming > 0 && <div className="bg-gradient-to-r from-orange-600 to-orange-400" style={{ width: `${(counts.warming / counts.total) * 100}%` }} />}
                {counts.almost > 0 && <div className="bg-gradient-to-r from-amber-600 to-amber-400" style={{ width: `${(counts.almost / counts.total) * 100}%` }} />}
                {counts.ready > 0 && <div className="bg-gradient-to-r from-emerald-600 to-emerald-400" style={{ width: `${(counts.ready / counts.total) * 100}%` }} />}
                {counts.advertising > 0 && <div className="bg-gradient-to-r from-cyan-600 to-cyan-400" style={{ width: `${(counts.advertising / counts.total) * 100}%` }} />}
                {counts.inactive > 0 && <div className="bg-gradient-to-r from-rose-600 to-rose-400" style={{ width: `${(counts.inactive / counts.total) * 100}%` }} />}
              </div>
            </div>

            {/* Fase 2: Banner de previsão + zumbis + queima */}
            <TooltipProvider delayDuration={150}>
              <ForecastBanner
                readyInNext3d={readyInNext3d}
                zombieReadyCount={zombieReadyCount}
                burnedLast7d={burnedLast7d}
                totalAccounts={counts.total}
              />
            </TooltipProvider>



            {/* Search + dica */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome ou ID..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-9 text-xs"
                />
              </div>
              {/* Filtro por gestor */}
              <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                <SelectTrigger className="h-9 w-[170px] text-xs">
                  <SelectValue placeholder="Gestor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os gestores</SelectItem>
                  <SelectItem value="__none__">Sem gestor atribuído</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.display_name || m.email || m.user_id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {stageFilter !== "all" && (
                <Button size="sm" variant="ghost" onClick={() => setStageFilter("all")} className="h-8 text-xs">
                  Mostrar todas
                </Button>
              )}
              {externalAccountIds && externalFilterLabel && (
                <button
                  onClick={() => onClearExternalFilter?.()}
                  className="h-8 px-2.5 rounded-md text-xs font-mono flex items-center gap-1.5 transition-all hover:bg-destructive/10"
                  style={{
                    background: "hsl(var(--primary) / 0.12)",
                    color: "hsl(var(--primary))",
                    border: "1px solid hsl(var(--primary) / 0.35)",
                  }}
                  title="Limpar filtro externo"
                >
                  <span className="opacity-70">Filtro:</span>
                  <span className="font-bold">{externalFilterLabel}</span>
                  <span className="opacity-60 ml-0.5">({externalAccountIds.size})</span>
                  <span className="ml-1">×</span>
                </button>
              )}

              {overrides && Object.keys(overrides).length > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm" variant="ghost"
                      onClick={() => saveOverrides.mutate({})}
                      className="h-8 text-xs gap-1.5 text-muted-foreground"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Limpar {Object.keys(overrides).length} ajuste(s)
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Volta todas as contas para a posição automática</TooltipContent>
                </Tooltip>
              )}
            </div>

            {/* Kanban Premium */}
            <TooltipProvider delayDuration={150}>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
                  {STAGE_ORDER.map((stage) => {
                    if (stageFilter !== "all" && stageFilter !== stage) return null;
                    let stageRows = filtered.filter((r) => r.stage === stage);
                    // Filtro de motivo só vale para coluna Inativa
                    if (stage === "inactive" && inactiveReason !== "all") {
                      stageRows = stageRows.filter((r) => r.inactiveReason === inactiveReason);
                    }
                    stageRows = sortRowsForStage(stageRows, stage, sortByStage[stage]);
                    return (
                      <KanbanColumn
                        key={stage}
                        stage={stage}
                        count={counts[stage]}
                        rows={stageRows}
                        thresholds={t}
                        onCardClick={handleCardClick}
                        onResetOverride={resetOverride}
                        onHeaderClick={() => setHistoryStage(stage)}
                        isDraggingOver={activeRow?.stage !== stage}
                        sortMode={sortByStage[stage]}
                        onSortChange={(m) => setSortByStage((p) => ({ ...p, [stage]: m }))}
                        inactiveReasonFilter={stage === "inactive" ? inactiveReason : "all"}
                        onInactiveReasonChange={setInactiveReason}
                        inactiveReasonCounts={inactiveReasonCounts}
                        selected={selected}
                        onToggleSelected={toggleSelected}
                        onQuickAction={setStageManual}
                        metrics={stageMetrics[stage]}
                        density={effectiveDensity}
                      />
                    );
                  })}
                </div>

                <DragOverlay dropAnimation={null}>
                  {activeRow ? (
                    <div className="rotate-2 scale-105">
                      <AccountCard
                        row={activeRow}
                        thresholds={t}
                        onClick={() => {}}
                        onResetOverride={() => {}}
                        isDragging
                        density={effectiveDensity}
                      />
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            </TooltipProvider>
          </>
        )}
      </CardContent>

      <AccountDetailSheet
        row={detailRow}
        startDate={startDate}
        endDate={endDate}
        onOpenChange={(open) => !open && setDetailAccountId(null)}
        onResetOverride={resetOverride}
      />

      <StageHistorySheet
        stage={historyStage}
        rows={rows}
        onOpenChange={(open) => !open && setHistoryStage(null)}
      />

      <BulkActionBar
        count={selected.size}
        selectedIds={Array.from(selected)}
        onMove={bulkMove}
        onClear={() => setSelected(new Set())}
        onExportCsv={bulkExportCsv}
      />
    </Card>

    <FarmHealthDrawer
      open={healthOpen}
      onOpenChange={setHealthOpen}
      rows={rows}
      weekLog={weekLog}
    />
    </TooltipProvider>
  );
}

/* ─── Coluna Kanban ─── */
function KanbanColumn({
  stage, count, rows, thresholds, onCardClick, onResetOverride, onHeaderClick, isDraggingOver,
  sortMode, onSortChange,
  inactiveReasonFilter, onInactiveReasonChange, inactiveReasonCounts,
  selected, onToggleSelected, onQuickAction, metrics, density,
}: {
  stage: Stage;
  count: number;
  rows: any[];
  thresholds: Thresholds;
  onCardClick: (id: string) => void;
  onResetOverride: (id: string) => void;
  onHeaderClick: () => void;
  isDraggingOver: boolean;
  sortMode: SortMode;
  onSortChange: (m: SortMode) => void;
  inactiveReasonFilter: InactiveReason;
  onInactiveReasonChange: (r: InactiveReason) => void;
  inactiveReasonCounts: Record<Exclude<InactiveReason, "all">, number>;
  selected: Set<string>;
  onToggleSelected: (id: string, on: boolean) => void;
  onQuickAction: (id: string, stage: Stage) => void;
  metrics: { avgDays: number | null; churn7d: number };
  density: Density;
}) {
  const sm = stageMeta[stage];
  const StageIcon = sm.icon;
  const { setNodeRef, isOver } = useDroppable({ id: stage });

  return (
    <div
      ref={setNodeRef}
      className={`
        flex flex-col rounded-xl border border-border/50 bg-muted/20
        min-h-[320px] max-h-[680px]
        transition-all duration-200
        ${isOver && isDraggingOver ? `ring-1 ${sm.ring} scale-[1.005]` : ""}
        backdrop-blur-sm
      `}
    >
      {/* Header da coluna (clicável + sort) */}
      <div className={`group relative flex items-center justify-between gap-2 px-3 py-2.5 rounded-t-xl ${sm.headerBg} border-b border-border/50`}>
        <button
          type="button"
          onClick={onHeaderClick}
          className="flex items-center gap-2 min-w-0 flex-1 hover:opacity-80 transition-opacity text-left"
          title="Ver histórico deste status"
        >
          <div className={`h-2 w-2 rounded-full ${sm.accent} shadow-[0_0_8px] shadow-current ${sm.color}`} />
          <StageIcon className={`h-3.5 w-3.5 ${sm.color}`} />
          <span className={`text-[10px] font-bold uppercase tracking-[0.14em] ${sm.color} truncate`}>
            {sm.label}
          </span>
        </button>
        <ColumnSortMenu current={sortMode} onChange={onSortChange} />
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-background/40 border border-border/40">
          <span className={`font-mono text-xs font-bold ${sm.color} tabular-nums`}>{count}</span>
        </div>
      </div>

      {/* Métricas da coluna: ⌀ dias só faz sentido em estágios de aquecimento/ativos;
          churn 7d só em estágios que partem de "ativa" (não em no_ads). */}
      {count > 0 && (
        <StageHeaderMetrics
          avgDays={stage === "inactive" || stage === "no_ads" ? null : metrics.avgDays}
          churn7d={stage === "no_ads" ? 0 : metrics.churn7d}
        />
      )}



      {/* Pills de motivo só na coluna Inativa */}
      {stage === "inactive" && count > 0 && (
        <InactiveReasonPills
          current={inactiveReasonFilter}
          counts={inactiveReasonCounts}
          onChange={onInactiveReasonChange}
        />
      )}

      {/* Lista virtualizada */}
      <VirtualCardList
        rows={rows}
        thresholds={thresholds}
        onCardClick={onCardClick}
        onResetOverride={onResetOverride}
        selected={selected}
        onToggleSelected={onToggleSelected}
        onQuickAction={onQuickAction}
        density={density}
        emptyState={
          <div className="flex flex-col items-center justify-center h-full py-10 text-center">
            <StageIcon className={`h-6 w-6 mb-2 opacity-20 ${sm.color}`} />
            <p className="text-[10px] text-muted-foreground/50 italic">
              {isOver && isDraggingOver ? "Solte aqui" : "Nenhuma conta"}
            </p>
          </div>
        }
      />
    </div>
  );
}

/* ─── Lista virtualizada (renderiza só os cards visíveis) ─── */
const CARD_GAP = 12;
const VIRTUAL_THRESHOLD = 15; // só virtualiza acima desse total — evita overhead com poucas contas
const CARD_HEIGHT_BY_DENSITY: Record<Density, number> = {
  compact: 64,
  comfortable: 124,
  detailed: 172,
};

function VirtualCardList({
  rows, thresholds, onCardClick, onResetOverride,
  selected, onToggleSelected, onQuickAction, emptyState, density,
}: {
  rows: any[];
  thresholds: Thresholds;
  onCardClick: (id: string) => void;
  onResetOverride: (id: string) => void;
  selected: Set<string>;
  onToggleSelected: (id: string, on: boolean) => void;
  onQuickAction: (id: string, stage: Stage) => void;
  emptyState: React.ReactNode;
  density: Density;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const shouldVirtualize = rows.length >= VIRTUAL_THRESHOLD;
  const cardHeight = CARD_HEIGHT_BY_DENSITY[density];

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => cardHeight + CARD_GAP,
    overscan: 6,
    getItemKey: (i) => rows[i]?.account_id ?? i,
  });

  if (rows.length === 0) {
    return <div className="flex-1 overflow-y-auto p-2 scrollbar-thin">{emptyState}</div>;
  }

  const gapClass = density === "compact" ? "space-y-2" : density === "detailed" ? "space-y-4" : "space-y-3";
  const padClass = density === "compact" ? "p-2" : "p-3";

  if (!shouldVirtualize) {
    return (
      <div ref={parentRef} className={`flex-1 overflow-y-auto ${padClass} ${gapClass} scrollbar-thin divide-y divide-border/20`}>
        {rows.map((r) => (
          <MemoDraggableCard
            key={r.account_id}
            row={r}
            thresholds={thresholds}
            onClick={onCardClick}
            onResetOverride={onResetOverride}
            isSelected={selected.has(r.account_id)}
            onToggleSelected={onToggleSelected}
            onQuickAction={onQuickAction}
            density={density}
          />
        ))}
      </div>
    );
  }

  const items = rowVirtualizer.getVirtualItems();

  return (
    <div ref={parentRef} className={`flex-1 overflow-y-auto ${padClass} scrollbar-thin`}>
      <div style={{ height: rowVirtualizer.getTotalSize(), width: "100%", position: "relative" }}>
        {items.map((vi) => {
          const r = rows[vi.index];
          return (
            <div
              key={r.account_id}
              ref={rowVirtualizer.measureElement}
              data-index={vi.index}
              style={{
                position: "absolute", top: 0, left: 0, right: 0,
                transform: `translateY(${vi.start}px)`,
                paddingBottom: CARD_GAP,
              }}
            >
              <MemoDraggableCard
                row={r}
                thresholds={thresholds}
                onClick={onCardClick}
                onResetOverride={onResetOverride}
                isSelected={selected.has(r.account_id)}
                onToggleSelected={onToggleSelected}
                onQuickAction={onQuickAction}
                density={density}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Card draggable wrapper (memoizado) ─── */
function DraggableCardImpl({
  row, thresholds, onClick, onResetOverride,
  isSelected, onToggleSelected, onQuickAction, density,
}: {
  row: any; thresholds: Thresholds;
  onClick: (id: string) => void;
  onResetOverride: (id: string) => void;
  isSelected: boolean;
  onToggleSelected: (id: string, on: boolean) => void;
  onQuickAction: (id: string, stage: Stage) => void;
  density: Density;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: row.account_id });
  return (
    <div
      ref={setNodeRef}
      style={{ opacity: isDragging ? 0.3 : 1 }}
      {...attributes}
    >
      <AccountCard
        row={row}
        thresholds={thresholds}
        onClick={() => onClick(row.account_id)}
        onResetOverride={() => onResetOverride(row.account_id)}
        dragHandleProps={listeners}
        isSelected={isSelected}
        onToggleSelected={onToggleSelected}
        onQuickAction={onQuickAction}
        density={density}
      />
    </div>
  );
}

// Compara só os campos que afetam visual
const MemoDraggableCard = memo(DraggableCardImpl, (prev, next) => {
  return (
    prev.row.account_id === next.row.account_id &&
    prev.row.stage === next.row.stage &&
    prev.row.days === next.row.days &&
    prev.row.isOverridden === next.row.isOverridden &&
    prev.row.account_status === next.row.account_status &&
    prev.row.account_name === next.row.account_name &&
    prev.row.recentlyDropped === next.row.recentlyDropped &&
    prev.row.inactiveReason === next.row.inactiveReason &&
    prev.row.zombieReady === next.row.zombieReady &&
    prev.row.spark === next.row.spark &&
    prev.row.origin === next.row.origin &&
    prev.isSelected === next.isSelected &&
    prev.density === next.density &&
    prev.thresholds === next.thresholds &&
    prev.onClick === next.onClick &&
    prev.onResetOverride === next.onResetOverride &&
    prev.onToggleSelected === next.onToggleSelected &&
    prev.onQuickAction === next.onQuickAction
  );
});




/* ─── Card de Conta (Premium) ─── */
function AccountCard({
  row, thresholds, onClick, onResetOverride, dragHandleProps, isDragging,
  isSelected, onToggleSelected, onQuickAction, density = "comfortable",
}: {
  row: any;
  thresholds: Thresholds;
  onClick: () => void;
  onResetOverride: () => void;
  dragHandleProps?: any;
  isDragging?: boolean;
  isSelected?: boolean;
  onToggleSelected?: (id: string, on: boolean) => void;
  onQuickAction?: (id: string, stage: Stage) => void;
  density?: Density;
}) {
  const isCompact = density === "compact";
  const isDetailed = density === "detailed";
  const d = {
    body: isCompact ? "p-1.5 pl-2 space-y-1" : isDetailed ? "p-3.5 pl-4 space-y-3" : "p-2.5 space-y-2 pl-3",
    nameSize: isCompact ? "text-[10px]" : isDetailed ? "text-[13px]" : "text-[11px]",
    idSize: isCompact ? "text-[8px]" : isDetailed ? "text-[10px]" : "text-[9px]",
    daysSize: isCompact ? "text-xs" : isDetailed ? "text-lg" : "text-base",
    daysLabelSize: isCompact ? "text-[7px]" : isDetailed ? "text-[9px]" : "text-[8px]",
    avatar: isCompact ? "h-4 w-4" : isDetailed ? "h-6 w-6" : "h-5 w-5",
    avatarText: isCompact ? "text-[7px]" : isDetailed ? "text-[10px]" : "text-[8px]",
    topGap: isCompact ? "gap-1" : "gap-1.5",
    footerPad: isCompact ? "pt-1" : isDetailed ? "pt-2" : "pt-1.5",
    footerText: isCompact ? "text-[8px]" : isDetailed ? "text-[10px]" : "text-[9px]",
    progressBar: isCompact ? "h-0.5" : isDetailed ? "h-1.5" : "h-1",
    sparkW: isCompact ? 60 : isDetailed ? 120 : 90,
    sparkH: isCompact ? 12 : isDetailed ? 22 : 16,
    showProgressMeta: !isCompact,
    showSparkline: !isCompact,
    showFooter: !isCompact,
  };

  const sm = stageMeta[row.stage as Stage];
  const targetDays = thresholds.almostMaxDays + 1;
  // Fallback: quando não há first_ad_date, deriva "dias rodando" a partir do 1º dia
  // com gasto no sparkline (mesma lógica do drawer). Garante que "Anunciando" mostre dias.
  const daysFromSpark = useMemo(() => {
    const spark = row.spark as number[] | undefined;
    const dates = row.sparkDates as string[] | undefined;
    if (!spark || !dates || spark.length === 0) return null;
    const firstIdx = spark.findIndex((v) => Number(v) > 0);
    if (firstIdx < 0 || !dates[firstIdx]) return null;
    const ms = Date.now() - new Date(dates[firstIdx]).getTime();
    return Math.max(0, Math.floor(ms / 86400000));
  }, [row.spark, row.sparkDates]);
  const effectiveDays: number | null = row.days ?? daysFromSpark;
  const pct = effectiveDays !== null ? Math.min(100, (effectiveDays / targetDays) * 100) : 0;
  const tz = row.timezone || "—";
  const tzShort = tz.split("/").pop()?.replace(/_/g, " ") || tz;
  const fin = row.financials;
  const payLabel = formatPayment(fin);
  const showProgress = row.stage !== "no_ads" && row.stage !== "inactive";
  const reasonMeta = row.stage === "inactive" && row.inactiveReason && row.inactiveReason !== "all"
    ? INACTIVE_REASON_META[row.inactiveReason as Exclude<InactiveReason, "all">]
    : null;
  const stopProp = (e: React.MouseEvent | React.PointerEvent) => e.stopPropagation();
  const [sparkOpen, setSparkOpen] = useState(false);

  return (
    <div
      {...(dragHandleProps || {})}
      className={`
        group relative rounded-lg border border-border/80
        bg-card shadow-sm
        transition-all duration-150
        ${isDragging ? `${sm.glow} border-foreground/30` : "hover:border-foreground/30 hover:-translate-y-0.5 hover:shadow-md"}
        ${isSelected ? `ring-1 ring-primary/50` : ""}
        ${row.recentlyDropped ? "ring-1 ring-rose-500/40" : ""}
        ${row._disabledOnly ? "opacity-50 grayscale hover:opacity-80" : ""}
        overflow-hidden cursor-grab active:cursor-grabbing touch-none select-none
      `}
      onClick={onClick}
    >

      {/* Faixa lateral colorida — único indicador de cor da fase no card */}
      <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${sm.accent}`} />

      {/* Badge "Caiu recentemente" — canto superior esquerdo */}
      {row.recentlyDropped && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="absolute top-1 left-1.5 z-10 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-rose-500/90 border border-rose-300/50 shadow-[0_0_10px_-1px_rgba(251,113,133,0.7)]">
              <AlertTriangle className="h-2.5 w-2.5 text-white" />
              <span className="text-[8px] font-bold uppercase tracking-wider text-white">Caiu 24h</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>Conta caiu nas últimas 24h — priorize recuperação</TooltipContent>
        </Tooltip>
      )}

      {/* Badge "Pronta zumbi" — Pronta sem gasto há 48h */}
      {row.zombieReady && !row.recentlyDropped && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="absolute top-1 left-1.5 z-10 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-500/90 border border-amber-300/50 shadow-[0_0_10px_-1px_rgba(251,191,36,0.7)]">
              <Skull className="h-2.5 w-2.5 text-white" />
              <span className="text-[8px] font-bold uppercase tracking-wider text-white">Zumbi</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>Pronta sem nenhum gasto registrado nas últimas 48h</TooltipContent>
        </Tooltip>
      )}


      {/* Override indicator */}
      {row.isOverridden && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={(e) => { e.stopPropagation(); onResetOverride(); }}
              className="absolute top-1 right-1 h-5 w-5 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center hover:bg-primary/30 z-10"
            >
              <RotateCcw className="h-2.5 w-2.5 text-primary" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Posição manual · clique para resetar</TooltipContent>
        </Tooltip>
      )}

      <div className={`${d.body} ${(row.recentlyDropped || row.zombieReady) ? "pt-6" : ""} ${onQuickAction ? "[@media(hover:none)]:pb-8" : ""}`}>
        {/* Top: checkbox + drag handle + nome + dias */}
        <div className={`flex items-start ${d.topGap}`}>
          {onToggleSelected && (
            <div
              className={`shrink-0 mt-0.5 transition-opacity ${isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100"}`}
              onClick={stopProp}
              onPointerDown={stopProp}
            >
              <Checkbox
                checked={!!isSelected}
                onCheckedChange={(v) => onToggleSelected(row.account_id, !!v)}
                className="h-3.5 w-3.5"
              />
            </div>
          )}
          <button
            {...dragHandleProps}
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 mt-0.5 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground transition-colors"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 min-w-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className={`${d.nameSize} font-semibold leading-tight truncate cursor-help`}>
                    {row.account_name}
                  </p>
                </TooltipTrigger>
                <TooltipContent>{row.account_name}</TooltipContent>
              </Tooltip>
              {row.origin && <OriginBadge origin={row.origin} size={isDetailed ? "sm" : "xs"} showLabel={!isCompact} />}
            </div>
            {!isCompact && (
              <p className={`${d.idSize} font-mono text-muted-foreground/70 truncate mt-0.5`}>
                {row.account_id}
              </p>
            )}
          </div>
          {row.ownerProfile && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Avatar className={`${d.avatar} shrink-0 border border-border/60 cursor-help`}>
                  {row.ownerProfile.avatar_url && <AvatarImage src={row.ownerProfile.avatar_url} />}
                  <AvatarFallback className={`${d.avatarText} bg-muted/40`}>
                    {ownerInitials(row.ownerProfile)}
                  </AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent>
                Gestor: {row.ownerProfile.display_name || row.ownerProfile.email}
              </TooltipContent>
            </Tooltip>
          )}
          <div className={`shrink-0 flex flex-col items-end leading-tight ${row.isOverridden ? "mr-5" : ""}`}>
            {effectiveDays !== null ? (
              <>
                <span className={`font-mono ${d.daysSize} font-bold ${sm.color} tabular-nums`}>{effectiveDays}</span>
                {!isCompact && <span className={`${d.daysLabelSize} text-muted-foreground uppercase tracking-wider`}>dias</span>}
              </>
            ) : (
              <span className="font-mono text-[10px] text-muted-foreground/60">—</span>
            )}
          </div>
        </div>

        {/* Tag de motivo da queda (na coluna inativa) */}
        {reasonMeta && (
          <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold border ${reasonMeta.tone}`}>
            <Skull className="h-2.5 w-2.5" />
            {reasonMeta.label}
          </div>
        )}

        {/* Progress bar */}
        {showProgress && (
          <div className="space-y-0.5">
            <div className={`relative ${d.progressBar} rounded-full bg-secondary/60 overflow-hidden`}>
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all"
                style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${sm.hex}AA, ${sm.hex})` }}
              />
            </div>
            {d.showProgressMeta && (
              <div className="flex items-center justify-between text-[8px] text-muted-foreground/70 uppercase tracking-wider">
                <span>maturidade</span>
                <span className="font-mono">{pct.toFixed(0)}%</span>
              </div>
            )}
          </div>
        )}

        {/* Mini-sparkline 7d de gasto — clique abre modal centralizado */}
        {d.showSparkline && row.spark && row.spark.some((v: number) => v > 0) && (
          <>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setSparkOpen(true); }}
              className="flex items-center gap-1.5 w-full text-left rounded-md hover:bg-muted/40 px-1 -mx-1 py-0.5 transition-colors"
              title="Clique para ver detalhes"
            >
              <span className="text-[8px] uppercase tracking-wider text-muted-foreground/60 shrink-0">7d</span>
              <Sparkline data={row.spark} width={d.sparkW} height={d.sparkH} color={sm.hex} className="flex-1" />
            </button>
            <Dialog open={sparkOpen} onOpenChange={setSparkOpen}>
              <DialogContent
                className="max-w-md"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <DialogHeader>
                  <DialogTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" style={{ color: sm.hex }} />
                    Gasto últimos 7 dias · {row.account_name}
                  </DialogTitle>
                </DialogHeader>
                <SparklineDetail spark={row.spark as number[]} dates={(row.sparkDates as string[]) || []} color={sm.hex} />
              </DialogContent>
            </Dialog>
          </>
        )}


        {/* Footer: fuso + pagamento */}
        {d.showFooter && (
          <div className={`flex items-center justify-between gap-2 ${d.footerPad} border-t border-border/40`}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={`flex items-center gap-1 ${d.footerText} text-muted-foreground/80 min-w-0`}>
                  <Globe className="h-2.5 w-2.5 shrink-0" />
                  <span className="truncate">{tzShort}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>{tz}</TooltipContent>
            </Tooltip>
            <span className={`${d.footerText} font-mono text-muted-foreground/60 uppercase`}>{row.currency || ""}</span>
            {payLabel ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={`flex items-center gap-1 ${d.footerText} text-muted-foreground/80 min-w-0`}>
                    <CreditCard className="h-2.5 w-2.5 shrink-0" />
                    <span className={`truncate ${isDetailed ? "max-w-[100px]" : "max-w-[60px]"}`}>{payLabel}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>{fin?.payment_method_type || "Tipo desconhecido"}</TooltipContent>
              </Tooltip>
            ) : (
              <span className={`${d.footerText} text-muted-foreground/30`}>sem pgto</span>
            )}
          </div>
        )}

        {/* Linha extra de status (apenas em detalhado) */}
        {isDetailed && row.account_status && (
          <div className="flex items-center justify-between text-[9px] text-muted-foreground/70 pt-1 border-t border-border/30">
            <span className="uppercase tracking-wider">status meta</span>
            <span className="font-mono">{row.account_status}</span>
          </div>
        )}


        {/* Quick actions — visível só no hover */}
        {onQuickAction && !isDragging && (
          <div
            className="absolute bottom-1.5 right-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity bg-background/95 backdrop-blur-sm rounded-md border border-border/60 shadow-lg p-0.5"
            onClick={stopProp}
            onPointerDown={stopProp}
          >
            {row.stage !== "ready" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => { onQuickAction(row.account_id, "ready"); toast.success(`${row.account_name} → Pronta`); }}
                    className="h-5 w-5 rounded flex items-center justify-center hover:bg-emerald-500/20 text-emerald-400"
                  >
                    <CheckCircle2 className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Marcar como Pronta</TooltipContent>
              </Tooltip>
            )}
            {row.stage !== "warming" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => { onQuickAction(row.account_id, "warming"); toast.success(`${row.account_name} → Aquecendo`); }}
                    className="h-5 w-5 rounded flex items-center justify-center hover:bg-orange-500/20 text-orange-400"
                  >
                    <Flame className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Mover para Aquecendo</TooltipContent>
              </Tooltip>
            )}
            {row.stage !== "inactive" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => { onQuickAction(row.account_id, "inactive"); toast.success(`${row.account_name} → Caída`); }}
                    className="h-5 w-5 rounded flex items-center justify-center hover:bg-rose-500/20 text-rose-400"
                  >
                    <AlertCircle className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Marcar como Caída</TooltipContent>
              </Tooltip>
            )}
            {row.stage !== "no_ads" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => { onQuickAction(row.account_id, "no_ads"); toast.success(`${row.account_name} → Sem ads`); }}
                    className="h-5 w-5 rounded flex items-center justify-center hover:bg-slate-500/20 text-slate-400"
                  >
                    <Pause className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Pausar (sem ads)</TooltipContent>
              </Tooltip>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Drawer de Detalhes da Conta ─── */
function AccountDetailSheet({
  row, startDate, endDate, onOpenChange, onResetOverride,
}: {
  row: any | null | undefined;
  startDate: string;
  endDate: string;
  onOpenChange: (open: boolean) => void;
  onResetOverride: (id: string) => void;
}) {
  const open = !!row;

  // Janela fixa do card: últimos 30 dias (independente do filtro global da página),
  // pra mostrar histórico real da conta mesmo quando o filtro do dashboard é curto.
  const cardWindow = useMemo(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 29);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    return { start: fmt(start), end: fmt(end), days: 30 };
  }, []);

  const opId = useOperationId();
  const { data: accountSpend, isLoading: loadingSpend } = useQuery({
    queryKey: ["farm-account-spend", row?.account_id, cardWindow.start, cardWindow.end, opId],
    queryFn: async () => {
      const empty = { total: 0, totalImpr: 0, totalClicks: 0, byDay: [] as { date: string; spend: number }[], firstSpendDate: null as string | null, lastSpendDate: null as string | null, lastSpendValue: 0 };
      if (!row) return empty;

      // Usa a RPC normalizada (mesmo source do sparkline) — retorna spend em BRL
      // já convertido por câmbio comercial, evitando descasamento com traffic_data raw (USD).
      const params: any = { p_start_date: cardWindow.start, p_end_date: cardWindow.end };
      if (opId) params.p_operation_id = opId;

      const PAGE = 1000;
      const rows: any[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .rpc("get_traffic_spend_by_account_normalized" as any, params)
          .eq("account_id", row.account_id)
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const batch = (data as any[]) || [];
        rows.push(...batch);
        if (batch.length < PAGE) break;
        from += PAGE;
        if (from > 50000) break;
      }

      const byDayMap = new Map<string, number>();
      rows.forEach((r: any) => {
        const v = Number(r.total_spend || r.spend || 0);
        byDayMap.set(r.date, (byDayMap.get(r.date) || 0) + v);
      });
      const byDay = Array.from(byDayMap.entries())
        .map(([date, spend]) => ({ date, spend }))
        .sort((a, b) => a.date.localeCompare(b.date));
      const total = byDay.reduce((s, d) => s + d.spend, 0);
      const daysWithSpend = byDay.filter((d) => d.spend > 0);
      const firstSpendDate = daysWithSpend[0]?.date || null;
      const lastFromWindow = daysWithSpend[daysWithSpend.length - 1] || null;

      // Fallback: se 30d veio vazio, busca último dia com gasto registrado (qualquer data)
      let lastSpendDate: string | null = lastFromWindow?.date || null;
      let lastSpendValue: number = lastFromWindow?.spend || 0;
      if (total === 0) {
        const fallbackParams: any = { p_start_date: "2025-01-01", p_end_date: cardWindow.end };
        if (opId) fallbackParams.p_operation_id = opId;
        const { data: last } = await supabase
          .rpc("get_traffic_spend_by_account_normalized" as any, fallbackParams)
          .eq("account_id", row.account_id)
          .gt("total_spend", 0)
          .order("date", { ascending: false })
          .limit(1);
        if (last && (last as any[]).length) {
          lastSpendDate = (last as any[])[0].date as string;
          lastSpendValue = Number((last as any[])[0].total_spend || 0);
        }
      }

      return { total, totalImpr: 0, totalClicks: 0, byDay, firstSpendDate, lastSpendDate, lastSpendValue };
    },
    enabled: !!row,
  });





  // Vendas + Receita + Campanhas Ativas (mesma janela de 30 dias do card)
  const { data: accountSales } = useQuery({
    queryKey: ["farm-account-sales", row?.account_id, cardWindow.start, cardWindow.end],
    queryFn: async () => {
      if (!row) return { vendas: 0, receitaUSD: 0, activeCampaigns: 0, totalCampaigns: 0 };
      // 1) Campanhas da conta (todas + ativas)
      const { data: campRows, error: campErr } = await supabase
        .from("meta_campaign_status")
        .select("campaign_id, effective_status")
        .eq("account_id", row.account_id);
      if (campErr) throw campErr;
      const campaignIds = (campRows || []).map((c: any) => String(c.campaign_id)).filter(Boolean);
      const activeCampaigns = (campRows || []).filter((c: any) => c.effective_status === "ACTIVE").length;
      const totalCampaigns = campRows?.length || 0;

      // 2) Vendas via redtrack_events linkadas pelo meta_campaign_id (tag da campanha → conta)
      let vendas = 0;
      let receitaUSD = 0;
      if (campaignIds.length > 0) {
        const CHUNK = 500;
        for (let i = 0; i < campaignIds.length; i += CHUNK) {
          const chunk = campaignIds.slice(i, i + CHUNK);
          const { data: evRows, error: evErr } = await supabase
            .from("redtrack_events")
            .select("amount, currency")
            .in("meta_campaign_id", chunk)
            .eq("event_type", "purchase")
            .gte("occurred_at", `${cardWindow.start}T00:00:00`)
            .lte("occurred_at", `${cardWindow.end}T23:59:59`)
            .limit(10000);
          if (evErr) throw evErr;
          for (const e of evRows || []) {
            vendas += 1;
            // amount já vem capado em USD 235 via trigger fix_redtrack_amount (front-end only)
            receitaUSD += Number((e as any).amount || 0);
          }
        }
      }
      return { vendas, receitaUSD, activeCampaigns, totalCampaigns };
    },
    enabled: !!row,
  });


  if (!row) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent />
      </Sheet>
    );
  }

  const sm = stageMeta[row.stage as Stage];
  const StageIcon = sm.icon;
  const fin = row.financials;
  const accountCurrency = (row.currency || "BRL").toUpperCase();
  const fmtMoney = (v: number, ccy = accountCurrency) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: ccy, maximumFractionDigits: 0 }).format(v);
  const fmtUSD = (v: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
  const maxDaySpend = Math.max(1, ...(accountSpend?.byDay || []).map((d) => d.spend));

  // Dias rodando: para "Anunciando" sem first_ad_date, usa data do 1º gasto no período.
  const effectiveDays = (() => {
    if (row.days !== null && row.days !== undefined) return row.days;
    if (accountSpend?.firstSpendDate) {
      return Math.max(0, Math.floor((Date.now() - new Date(accountSpend.firstSpendDate).getTime()) / 86400000));
    }
    return null;
  })();

  const vendas = accountSales?.vendas ?? 0;
  const receitaUSD = accountSales?.receitaUSD ?? 0;
  const spend = accountSpend?.total ?? 0;
  const cpa = vendas > 0 ? spend / vendas : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="space-y-3">
          <div className="flex items-start gap-3">
            <div className={`h-12 w-12 rounded-lg ${sm.bg} border ${sm.border} flex items-center justify-center shrink-0 ${sm.glow}`}>
              <StageIcon className={`h-6 w-6 ${sm.color}`} />
            </div>
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-base leading-tight truncate">{row.account_name}</SheetTitle>
              <SheetDescription className="font-mono text-[10px] mt-1">
                act_{row.account_id}
              </SheetDescription>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className={`text-[10px] ${sm.bg} ${sm.color} ${sm.border} gap-1`}>
              <StageIcon className="h-3 w-3" />
              {sm.label}
            </Badge>
            {row.isOverridden && (
              <Badge variant="outline" className="text-[10px] gap-1">
                <Sparkles className="h-3 w-3" />
                Posição manual
              </Badge>
            )}
            {row.account_status === 1 ? (
              <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                Meta · Ativa
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] bg-rose-500/10 text-rose-400 border-rose-500/30">
                Meta · Inativa
              </Badge>
            )}
          </div>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          {/* KPIs principais */}
          <div className="grid grid-cols-2 gap-2">
            <DetailMetric
              icon={<Calendar className="h-3.5 w-3.5" />}
              label="Dias rodando"
              value={effectiveDays !== null ? `${effectiveDays}d` : "—"}
              color={sm.color}
            />
            <DetailMetric
              icon={<TrendingUp className="h-3.5 w-3.5" />}
              label={spend > 0 || !accountSpend?.lastSpendDate ? "Gasto (30d)" : `Último gasto · ${new Date(accountSpend.lastSpendDate).toLocaleDateString("pt-BR")}`}
              value={loadingSpend ? "—" : (spend > 0 ? fmtMoney(spend, "BRL") : (accountSpend?.lastSpendValue ? fmtMoney(accountSpend.lastSpendValue, "BRL") : fmtMoney(0, "BRL")))}
              color={spend > 0 ? "text-foreground" : "text-muted-foreground"}
            />
            <DetailMetric
              icon={<CheckCircle2 className="h-3.5 w-3.5" />}
              label="Vendas no período"
              value={vendas > 0 ? String(vendas) : "0"}
              color={vendas > 0 ? "text-emerald-400" : "text-muted-foreground"}
            />
            <DetailMetric
              icon={<TrendingUp className="h-3.5 w-3.5" />}
              label="Receita (front-end)"
              value={receitaUSD > 0 ? fmtUSD(receitaUSD) : "$ 0"}
              color={receitaUSD > 0 ? "text-emerald-400" : "text-muted-foreground"}
            />
            <DetailMetric
              icon={<TrendingUp className="h-3.5 w-3.5" />}
              label="CPA médio"
              value={cpa !== null ? fmtMoney(cpa, "BRL") : "—"}
              color={cpa !== null && cpa > 0 ? "text-amber-400" : "text-muted-foreground"}
              small
            />
            <DetailMetric
              icon={<Flame className="h-3.5 w-3.5" />}
              label="Camp. ativas"
              value={
                accountSales
                  ? `${accountSales.activeCampaigns}${accountSales.totalCampaigns ? ` / ${accountSales.totalCampaigns}` : ""}`
                  : "—"
              }
              color={accountSales && accountSales.activeCampaigns > 0 ? "text-cyan-400" : "text-muted-foreground"}
              small
            />
            <DetailMetric
              icon={<Globe className="h-3.5 w-3.5" />}
              label="Fuso horário"
              value={row.timezone || "—"}
              color="text-foreground"
              small
            />
            <DetailMetric
              icon={<CreditCard className="h-3.5 w-3.5" />}
              label="Pagamento"
              value={formatPayment(fin) || "—"}
              color="text-foreground"
              small
            />
          </div>

          {/* Dados Meta */}
          <div className="space-y-2">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Informações da conta</h3>
            <div className="rounded-lg border border-border/60 bg-muted/20 divide-y divide-border/40 text-xs">
              <DetailRow label="Moeda" value={row.currency || "—"} />
              <DetailRow label="1º anúncio" value={row.first_ad_date ? new Date(row.first_ad_date).toLocaleDateString("pt-BR") : "—"} />
              <DetailRow label="Criada em" value={row.created_at ? new Date(row.created_at).toLocaleDateString("pt-BR") : "—"} />
              <DetailRow label="Categoria" value={row.category || "—"} />
              <DetailRow label="Tipo pgto." value={fin?.payment_method_type || "—"} />
              {fin?.card_brand && <DetailRow label="Bandeira" value={fin.card_brand} />}
              {fin?.card_last4 && <DetailRow label="Final cartão" value={`····${fin.card_last4}`} />}
            </div>
          </div>

          {/* Mini chart de gasto diário */}
          {(accountSpend?.byDay?.length ?? 0) > 0 && (
            <div className="space-y-2">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Gasto diário · últimos 30 dias
              </h3>

              <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
                <div className="flex items-end gap-0.5 h-20">
                  {accountSpend!.byDay.map((d) => (
                    <Tooltip key={d.date}>
                      <TooltipTrigger asChild>
                        <div
                          className="flex-1 rounded-sm transition-all hover:opacity-80 cursor-help"
                          style={{
                            height: `${(d.spend / maxDaySpend) * 100}%`,
                            background: `linear-gradient(180deg, ${sm.hex}, ${sm.hex}44)`,
                            minHeight: "2px",
                          }}
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="text-xs">
                          <div className="font-mono">{d.date}</div>
                          <div className="font-semibold">{fmtMoney(d.spend, "BRL")}</div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Ações */}
          <div className="space-y-2 pt-2">
            {row.isOverridden && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => { onResetOverride(row.account_id); onOpenChange(false); }}
                className="w-full gap-2 text-xs"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Resetar para posição automática ({stageMeta[row.autoStage as Stage].label})
              </Button>
            )}
            <Button
              variant="outline" size="sm"
              asChild
              className="w-full gap-2 text-xs"
            >
              <a
                href={`https://business.facebook.com/adsmanager/manage/campaigns?act=${row.account_id}`}
                target="_blank" rel="noopener noreferrer"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Abrir no Meta Ads Manager
              </a>
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DetailMetric({
  icon, label, value, color, small,
}: { icon: React.ReactNode; label: string; value: string; color: string; small?: boolean }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
      <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`mt-1 font-data font-bold ${color} ${small ? "text-xs" : "text-lg"} truncate`}>
        {value}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="text-muted-foreground text-[11px]">{label}</span>
      <span className="font-mono text-[11px] text-foreground text-right truncate max-w-[60%]">{value}</span>
    </div>
  );
}

function formatPayment(fin: { payment_method_type: string | null; card_brand: string | null; card_last4: string | null } | null): string | null {
  if (!fin) return null;
  const brand = fin.card_brand?.trim();
  const last4 = fin.card_last4?.trim();
  if (brand && last4) return `${brand.toUpperCase()} ····${last4}`;
  if (last4) return `····${last4}`;
  if (brand) return brand.toUpperCase();
  if (fin.payment_method_type) return fin.payment_method_type;
  return null;
}

function FarmSpendKpi({
  totalSpend, dailyAverage, numDays, numCampaigns, loading, periodLabel,
}: {
  totalSpend: number; dailyAverage: number; numDays: number; numCampaigns: number;
  loading: boolean; periodLabel: string;
}) {
  const fmt = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
  return (
    <div className="relative flex items-center justify-between gap-3 rounded-lg border border-orange-500/25 bg-gradient-to-r from-orange-500/[0.08] via-orange-500/[0.04] to-transparent px-3.5 py-2.5 overflow-hidden">
      <div className="flex items-center gap-2 min-w-0">
        <Flame className="h-4 w-4 text-orange-400 shrink-0" />
        <span className="text-[10px] uppercase tracking-[0.15em] text-orange-400/90 font-bold shrink-0">
          Gasto com Farm
        </span>
        <span className="text-[10px] text-muted-foreground truncate">
          · {periodLabel} · {numCampaigns} camp.
          {numDays > 1 && <> · média {fmt(dailyAverage)}/d</>}
        </span>
      </div>
      <div className="font-data text-base font-bold text-orange-400 tabular-nums shrink-0">
        {loading ? "—" : fmt(totalSpend)}
      </div>
    </div>
  );
}

function FarmThresholdsDialog({
  open, onOpenChange, current, onSaved,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  current: Thresholds; onSaved: () => void;
}) {
  const [warming, setWarming] = useState(current.warmingMaxDays);
  const [almost, setAlmost] = useState(current.almostMaxDays);
  const opId = useOperationId();

  useEffect(() => {
    setWarming(current.warmingMaxDays);
    setAlmost(current.almostMaxDays);
  }, [current.warmingMaxDays, current.almostMaxDays, open]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (warming < 0 || almost <= warming) {
        throw new Error("'Quase Pronta' deve ser maior que 'Aquecendo'.");
      }
      if (!opId) throw new Error("Operação ativa não encontrada.");
      const { error } = await supabase
        .from("app_settings")
        .upsert({ key: SETTINGS_KEY, value: { warmingMaxDays: warming, almostMaxDays: almost } as any, operation_id: opId }, { onConflict: "key,operation_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Limiares atualizados");
      onSaved();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message || "Erro ao salvar"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Settings2 className="h-3.5 w-3.5" />
          <span className="text-xs">Limiares</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-orange-400" />
            Configurar Maturidade da Esteira
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-xs">🔵 Aquecendo: 0 até</Label>
            <Input type="number" min={0} value={warming} onChange={(e) => setWarming(Number(e.target.value))} className="h-9" />
            <p className="text-[10px] text-muted-foreground">Dias em que a conta ainda está em fase inicial.</p>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">🟡 Quase Pronta: até</Label>
            <Input type="number" min={warming + 1} value={almost} onChange={(e) => setAlmost(Number(e.target.value))} className="h-9" />
            <p className="text-[10px] text-muted-foreground">A partir do dia seguinte é considerada 🟢 Pronta.</p>
          </div>
          <div className="rounded-md bg-muted/30 p-3 text-[11px] text-muted-foreground">
            <strong className="text-foreground">Resumo:</strong> 0–{warming}d aquecendo · {warming + 1}–{almost}d quase pronta · {almost + 1}d+ pronta
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Drawer: Histórico do status (coluna) ─── */
function StageHistorySheet({
  stage, rows, onOpenChange,
}: {
  stage: Stage | null;
  rows: any[];
  onOpenChange: (open: boolean) => void;
}) {
  const open = stage !== null;
  const [historyDays, setHistoryDays] = useState<number>(30);
  const [accountSearch, setAccountSearch] = useState("");

  const { data: log, isLoading } = useAccountStatusHistory(historyDays);

  const q = accountSearch.toLowerCase().trim();

  const stageRows = useMemo(
    () => (stage ? rows.filter((r) => r.stage === stage) : []),
    [rows, stage],
  );

  const filteredStageRows = useMemo(() => {
    if (!q) return stageRows;
    return stageRows.filter(
      (r) =>
        r.account_name.toLowerCase().includes(q) ||
        r.account_id.includes(q),
    );
  }, [stageRows, q]);

  const stageAccountIds = useMemo(
    () => new Set(stageRows.map((r) => r.account_id)),
    [stageRows],
  );

  // Últimas mudanças envolvendo contas que estão atualmente neste status
  const relatedChanges: StatusLogEntry[] = useMemo(() => {
    if (!stage || !log) return [];
    return log
      .filter((e) => stageAccountIds.has(e.account_id))
      .filter((e) => !q || e.account_name.toLowerCase().includes(q) || e.account_id.includes(q))
      .slice(0, 100);
  }, [log, stage, stageAccountIds, q]);

  // Histograma simples: mudanças por dia (últimos 14 dias) entre as contas atuais do status
  const dailyCounts = useMemo(() => {
    const buckets = new Map<string, number>();
    const today = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      buckets.set(d.toISOString().slice(0, 10), 0);
    }
    relatedChanges.forEach((e) => {
      const k = e.changed_at.slice(0, 10);
      if (buckets.has(k)) buckets.set(k, (buckets.get(k) || 0) + 1);
    });
    return Array.from(buckets.entries()).map(([date, n]) => ({ date, n }));
  }, [relatedChanges]);

  const maxDaily = Math.max(1, ...dailyCounts.map((d) => d.n));
  const sm = stage ? stageMeta[stage] : null;

  const dayOptions = [
    { label: "7D", value: 7 },
    { label: "14D", value: 14 },
    { label: "30D", value: 30 },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        {sm && stage && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <sm.icon className={`h-4 w-4 ${sm.color}`} />
                <span className={sm.color}>{sm.label}</span>
                <Badge variant="outline" className="ml-1 font-mono">{filteredStageRows.length}</Badge>
              </SheetTitle>
              <SheetDescription>
                Contagem atual e últimas mudanças das contas neste status.
              </SheetDescription>
            </SheetHeader>

            <div className="mt-5 space-y-5">
              {/* Filtros */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 rounded-md border border-border/60 bg-muted/20 p-0.5 shrink-0">
                  {dayOptions.map((opt) => (
                    <Button
                      key={opt.value}
                      size="sm"
                      variant={historyDays === opt.value ? "default" : "ghost"}
                      className="h-6 text-[10px] px-2"
                      onClick={() => setHistoryDays(opt.value)}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
                <div className="flex-1 relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Buscar conta…"
                    value={accountSearch}
                    onChange={(e) => setAccountSearch(e.target.value)}
                    className="h-7 pl-7 text-xs"
                  />
                </div>
              </div>

              {/* Histograma 14d */}
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                  Mudanças por dia · últimos 14 dias
                </div>
                <div className="flex items-end gap-1 h-20 rounded-md border border-border/40 bg-muted/10 p-2">
                  {dailyCounts.map((d) => (
                    <Tooltip key={d.date}>
                      <TooltipTrigger asChild>
                        <div className="flex-1 flex flex-col justify-end h-full">
                          <div
                            className={`w-full rounded-sm ${sm.accent} opacity-80 hover:opacity-100 transition-opacity`}
                            style={{ height: `${(d.n / maxDaily) * 100}%`, minHeight: d.n > 0 ? 2 : 0 }}
                          />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-[10px]">
                        {d.date} · {d.n} mudança(s)
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              </div>

              {/* Lista de mudanças recentes */}
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                  Últimas mudanças
                </div>
                {isLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
                  </div>
                ) : relatedChanges.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border/50 p-4 text-center text-xs text-muted-foreground">
                    Sem mudanças registradas nos últimos {historyDays} dias para as contas atuais deste status.
                  </div>
                ) : (
                  <ScrollArea className="h-[340px] pr-2">
                    <ul className="space-y-1.5">
                      {relatedChanges.map((e) => (
                        <li
                          key={e.id}
                          className="flex items-center justify-between gap-2 rounded-md border border-border/40 bg-background/40 px-2.5 py-2 text-xs"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium text-foreground">{e.account_name}</div>
                            <div className="text-[10px] text-muted-foreground font-mono truncate">{e.account_id}</div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Badge variant="outline" className="text-[10px] h-5 font-mono">
                              {e.old_status ?? "—"} → {e.new_status}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground tabular-nums">
                              {new Date(e.changed_at).toLocaleString("pt-BR", {
                                day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                              })}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>
                )}
              </div>

              {/* Lista das contas atualmente no status */}
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                  Contas atualmente neste status ({filteredStageRows.length})
                </div>
                {filteredStageRows.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border/50 p-4 text-center text-xs text-muted-foreground">
                    {q ? "Nenhuma conta corresponde à busca." : "Nenhuma conta."}
                  </div>
                ) : (
                  <ScrollArea className="h-[220px] pr-2">
                    <ul className="space-y-1">
                      {filteredStageRows.map((r) => (
                        <li
                          key={r.account_id}
                          className="flex items-center justify-between gap-2 rounded-md border border-border/40 bg-background/30 px-2.5 py-1.5 text-xs"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium text-foreground">{r.account_name}</div>
                            <div className="text-[10px] text-muted-foreground font-mono truncate">{r.account_id}</div>
                          </div>
                          <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                            {r.days === null ? "sem ads" : `${r.days}d`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/* ─── Detalhe do Sparkline (modal centralizado) ─── */
function SparklineDetail({ spark, dates, color }: { spark: number[]; dates: string[]; color: string }) {
  const fmtBRL = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
  const total = spark.reduce((s, v) => s + v, 0);
  const max = Math.max(1, ...spark);
  const avg = spark.length > 0 ? total / spark.length : 0;
  const peakIdx = spark.indexOf(Math.max(...spark));

  return (
    <div className="space-y-4">
      {/* KPIs topo */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Total 7d</div>
          <div className="mt-1 font-data font-bold text-base" style={{ color }}>{fmtBRL(total)}</div>
        </div>
        <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Média/dia</div>
          <div className="mt-1 font-data font-bold text-base text-foreground">{fmtBRL(avg)}</div>
        </div>
        <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Pico</div>
          <div className="mt-1 font-data font-bold text-base text-amber-400">{fmtBRL(spark[peakIdx] || 0)}</div>
        </div>
      </div>

      {/* Barras diárias */}
      <div className="rounded-lg border border-border/60 bg-muted/10 p-4">
        <div className="flex items-end gap-2 h-32">
          {spark.map((v, i) => {
            const h = (v / max) * 100;
            const date = dates[i];
            const isPeak = i === peakIdx && v > 0;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                <div className="text-[9px] font-mono text-muted-foreground/70 truncate">{v > 0 ? fmtBRL(v) : "—"}</div>
                <div className="w-full flex-1 flex items-end">
                  <div
                    className="w-full rounded-t-sm transition-all"
                    style={{
                      height: `${Math.max(2, h)}%`,
                      background: `linear-gradient(180deg, ${color}, ${color}55)`,
                      boxShadow: isPeak ? `0 0 12px ${color}66` : undefined,
                    }}
                  />
                </div>
                <div className="text-[9px] font-mono text-muted-foreground/60">
                  {date ? new Date(date + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : `D${i + 1}`}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground/70 text-center">
        Gasto diário em BRL (normalizado por câmbio comercial). Clique no card pra ver detalhes completos da conta.
      </p>
    </div>
  );
}

