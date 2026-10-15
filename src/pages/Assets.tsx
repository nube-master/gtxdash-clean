import { useMemo, useState, useCallback } from "react";
import { mergeAllSales } from "@/lib/salesMerge";
import { isUpsellItemName } from "@/lib/frontEndSale";
import { useDashboardTotals } from "@/hooks/useDashboardTotals";
import {
  RefreshCw, Loader2, Clock, Search, AlertTriangle, Shield, ShieldCheck,
  ShieldAlert, ShieldOff, Activity, Layers, FlaskConical, TrendingUp, Rocket,
  DollarSign, Eye, Zap, Brain, ChevronDown, ChevronRight, X, Filter,
  Monitor, Smartphone, Globe, BarChart3, Wifi, WifiOff, Target, Settings2,
  ArrowUpDown, ArrowUp, ArrowDown,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useSpendByAccount } from "@/hooks/useSpendByAccount";
import { useRealSales } from "@/hooks/useRealSales";
import { useRedTrackSales } from "@/hooks/useRedTrackSales";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useCampaignStatuses } from "@/hooks/useCampaignStatuses";
import {
  useAccountStatuses,
  getAccountStatusLabel,
  getAccountStatusColor,
} from "@/hooks/useAccountStatuses";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  detectStructure, structureLabels, structureColors,
  formatCampaignName,
  type CampaignStructure,
} from "@/lib/formatNames";
import { extractProjectCode } from "@/lib/projectUtils";
import { toast } from "sonner";

import MappingRulesPanel from "@/components/contingency/MappingRulesPanel";
import AccountInfraPanel from "@/components/contingency/AccountInfraPanel";
import ProjectDistributionPanel from "@/components/contingency/ProjectDistributionPanel";
import ContingencyIntelligence from "@/components/contingency/ContingencyIntelligence";
import TimezoneDistributionPanel from "@/components/contingency/TimezoneDistributionPanel";
import AccountFarmPipeline from "@/components/contingency/AccountFarmPipeline";
import { AccountSelector } from "@/components/header/AccountSelector";

/* ═══════════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════════ */

function fmt(value: number, type: "currency" | "number" | "percent" | "roas") {
  if (type === "currency")
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  if (type === "number") return new Intl.NumberFormat("pt-BR").format(Math.round(value));
  if (type === "percent") return `${value.toFixed(1)}%`;
  if (type === "roas") return `${value.toFixed(2)}x`;
  return String(value);
}

function timeAgo(date: Date | null): string {
  if (!date) return "—";
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

const DATE_RANGE_LABELS: Record<string, string> = {
  today: "Hoje", yesterday: "Ontem", "7": "Últimos 7 dias",
  "14": "Últimos 14 dias", "30": "Últimos 30 dias", custom: "Personalizado",
};

type TrackingHealth = "OK" | "Atenção" | "Crítico";

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

const healthColors: Record<TrackingHealth, string> = {
  OK: "text-wr-positive border-wr-positive/30 bg-wr-positive/5",
  "Atenção": "text-amber-400 border-amber-400/30 bg-amber-400/5",
  "Crítico": "text-destructive border-destructive/30 bg-destructive/5",
};

/* ═══════════════════════════════════════════════════════════════════════
   STATUS HOVER CARD
   ═══════════════════════════════════════════════════════════════════════ */

function StatusHoverCard({ accounts, label, children }: { accounts: any[]; label: string; children: React.ReactNode }) {
  if (accounts.length === 0) return <>{children}</>;
  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent side="bottom" align="start" className="w-72 p-0">
        <div className="px-3 py-2 border-b border-border">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {label} ({accounts.length})
          </p>
        </div>
        <div className="max-h-48 overflow-y-auto p-2 space-y-1">
          {accounts.map((acc: any) => (
            <div key={acc.accountId} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-secondary/30">
              <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{
                background: acc.accountStatus === 1 ? "hsl(var(--wr-positive))" : acc.accountStatus === 2 || acc.accountStatus === 101 ? "hsl(var(--muted-foreground))" : "hsl(var(--destructive))",
              }} />
              <span className="text-xs text-foreground truncate flex-1">{acc.accountName}</span>
              <span className="text-[9px] font-mono text-muted-foreground shrink-0">{acc.currency}</span>
            </div>
          ))}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════ */

export default function Assets() {
  const { data: spendByAccountData } = useSpendByAccount();
  const { data: skyTotals } = useDashboardTotals();
  const { data: salesDataRaw } = useRealSales();
  const { data: redTrackSalesRaw } = useRedTrackSales();
  const { data: campaignStatuses, syncNow: syncCampaigns } = useCampaignStatuses();
  const { data: accountStatuses, syncNow, lastSyncTime } = useAccountStatuses();
  const { rangeKey } = useDateRange();
  const [syncing, setSyncing] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currencyFilter, setCurrencyFilter] = useState("all");
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<number>>(new Set());
  const [projectFilter, setProjectFilter] = useState("all");
  const [tableSortKey, setTableSortKey] = useState<"spend" | "revenue" | "profit" | "roas" | "saleCount" | "activeCampaigns">("spend");
  const [tableSortDir, setTableSortDir] = useState<"asc" | "desc">("desc");

  // Pipeline cross-filter (driven by Project/Timezone panels above)
  const [pipelineFilter, setPipelineFilter] = useState<
    | { kind: "project"; key: string; label: string; accountIds: Set<string> }
    | { kind: "timezone"; key: string; label: string; accountIds: Set<string> }
    | null
  >(null);
  const handleSelectProject = useCallback((project: string | null, accountIds: Set<string>) => {
    if (!project) setPipelineFilter(null);
    else setPipelineFilter({ kind: "project", key: project, label: project, accountIds });
  }, []);
  const handleSelectTimezone = useCallback((tz: string | null, accountIds: Set<string>, label: string) => {
    if (!tz) setPipelineFilter(null);
    else setPipelineFilter({ kind: "timezone", key: tz, label, accountIds });
  }, []);
  const clearPipelineFilter = useCallback(() => setPipelineFilter(null), []);

  const handleTableSort = useCallback((key: typeof tableSortKey) => {
    if (tableSortKey === key) {
      setTableSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setTableSortKey(key);
      setTableSortDir("desc");
    }
  }, [tableSortKey]);

  // Fetch UTM aliases
  const { data: utmAliases } = useQuery({
    queryKey: ["account-utm-aliases"],
    queryFn: async () => {
      const { data, error } = await supabase.from("account_utm_aliases").select("*");
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch RedTrack device data
  const { data: redtrackDeviceData } = useQuery({
    queryKey: ["redtrack-device-analytics"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("redtrack_events")
        .select("country, city, os, browser, device, amount, status, event_type")
        .eq("event_type", "purchase")
        .eq("status", "approved")
        .limit(1000);
      if (error) throw error;
      return data || [];
    },
  });

  const isToday = rangeKey === "today";
  const periodLabel = DATE_RANGE_LABELS[rangeKey] || "Período";

  /* ─── Build data ────────────────────────────────────────────────────── */
  const {
    accountRows, totals, structureTotals, accountStatusCounts,
    diagnostics, recommendations, deviceAnalytics,
  } = useMemo(() => {
    const spendRows = spendByAccountData || [];
    const allMerged = mergeAllSales(salesDataRaw || [], redTrackSalesRaw || []);
    // Front-end only: exclui upsell/order bump/upgrade/last chance/downsell
    // (RedTrack/CB já vêm filtrados por amount 200-260 USD na origem; aqui
    // protege CartPanda e qualquer linha com nome de upsell).
    const sales = allMerged.filter((s: any) => {
      const name = s.product_name || s.offer_name || s.item_name || "";
      return !isUpsellItemName(name);
    });
    const accounts = accountStatuses || [];
    const campaigns = campaignStatuses || [];
    const aliases = utmAliases || [];

    const healthyAccountIds = new Set(
      accounts.filter((a: any) => a.account_status === 1).map((a: any) => a.account_id)
    );

    // Active campaigns per account + project detection (1 account = 1 project)
    const activeCampaignsByAccount = new Map<string, Set<string>>();
    // For project detection: only consider campaigns updated in the last 3 days
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const projectVotesByAccount = new Map<string, Map<string, number>>();
    const activeCampaignsByStructure: Record<CampaignStructure, Set<string>> = {
      TESTE: new Set(), "PRÉ ESCALA": new Set(), ESCALA: new Set(), OUTRO: new Set(),
    };

    for (const c of campaigns) {
      const eff = (c as any).effective_status || "UNKNOWN";
      const name = (c as any).campaign_name || "";
      const accId = (c as any).account_id;
      const updatedAt = new Date((c as any).updated_at || 0);

      // Detect project from recent campaigns (last 3 days) — pick the dominant one
      if (updatedAt >= threeDaysAgo) {
        const proj = extractProjectCode(name);
        if (proj !== "OUTROS") {
          if (!projectVotesByAccount.has(accId)) projectVotesByAccount.set(accId, new Map());
          const votes = projectVotesByAccount.get(accId)!;
          votes.set(proj, (votes.get(proj) || 0) + 1);
        }
      }

      if (eff === "ACTIVE" && name.toLowerCase().includes("[vendas]") && healthyAccountIds.has(accId)) {
        if (!activeCampaignsByAccount.has(accId)) activeCampaignsByAccount.set(accId, new Set());
        activeCampaignsByAccount.get(accId)!.add(name);
        activeCampaignsByStructure[detectStructure(name)].add(name);
      }
    }

    // Resolve single project per account (most frequent in recent campaigns)
    const projectByAccount = new Map<string, string>();
    for (const [accId, votes] of projectVotesByAccount.entries()) {
      let best = "";
      let bestCount = 0;
      for (const [proj, count] of votes.entries()) {
        if (count > bestCount) { best = proj; bestCount = count; }
      }
      if (best) projectByAccount.set(accId, best);
    }

    // Spend per account (fonte BRT normalizada; usedFallback = daily de reserva)
    const spendByAccount = new Map<string, number>();
    const spendFallbackAccounts = new Set<string>();
    for (const r of spendRows) {
      spendByAccount.set(r.account_id, (spendByAccount.get(r.account_id) || 0) + r.spend);
      if ((r as any).usedFallback) spendFallbackAccounts.add(r.account_id);
    }

    // Revenue attribution
    const revenueByAccount = new Map<string, number>();
    const salesByAccount = new Map<string, number>();
    const salesWithoutUtmByAccount = new Map<string, number>();
    const lastSaleByAccount = new Map<string, Date>();
    let unattributedRevenue = 0;

    const tagToAccount = new Map<string, string>();
    // Build campaign_name → account_id lookup from campaignStatuses (no traffic needed)
    // Build campaign_name → account_id with spend-weighting for collisions
    const campaignNameCandidates = new Map<string, Map<string, number>>();
    for (const c of campaigns) {
      const name = (c as any).campaign_name || "";
      const accId = (c as any).account_id;
      const match = name.match(/\[([^\]]+)\]/);
      if (match) {
        const tag = match[1].toLowerCase();
        if (!tagToAccount.has(tag)) tagToAccount.set(tag, accId);
      }
      const cn = name.toLowerCase().trim();
      if (cn) {
        if (!campaignNameCandidates.has(cn)) campaignNameCandidates.set(cn, new Map());
        const accSpend = spendByAccount.get(accId) || 0;
        const existing = campaignNameCandidates.get(cn)!;
        existing.set(accId, (existing.get(accId) || 0) + accSpend);
      }
    }
    // Resolve: pick account with highest spend for each campaign name
    const campaignNameToAccount = new Map<string, string>();
    for (const [cn, accMap] of campaignNameCandidates) {
      let bestAcc = "";
      let bestSpend = -1;
      for (const [accId, spend] of accMap) {
        if (spend > bestSpend) { bestSpend = spend; bestAcc = accId; }
      }
      if (bestAcc) campaignNameToAccount.set(cn, bestAcc);
    }

    const aliasMap = new Map<string, string>();
    for (const a of aliases) {
      const utmArr = (a as any).utm_aliases || [];
      for (const alias of utmArr) {
        aliasMap.set(String(alias).toLowerCase(), (a as any).account_id);
      }
    }

    for (const sale of sales) {
      let matchedAccId: string | null = null;
      const hasUtm = Boolean(sale.utm_campaign || (sale as any).utm_content || sale.utm_source);

      // 1) Manual aliases
      if (aliasMap.size > 0) {
        const utmFields = [sale.utm_campaign, (sale as any).utm_content, sale.utm_source, sale.utm_term].filter(Boolean);
        for (const field of utmFields) {
          const lower = String(field).toLowerCase();
          for (const [alias, accId] of aliasMap.entries()) {
            if (lower.includes(alias)) { matchedAccId = accId; break; }
          }
          if (matchedAccId) break;
        }
      }

      // 2) Auto-match bracket tag
      if (!matchedAccId && sale.utm_campaign) {
        const tagMatch = String(sale.utm_campaign).match(/\[([^\]]+)\]/);
        if (tagMatch) {
          const saleTag = tagMatch[1].toLowerCase();
          const accId = tagToAccount.get(saleTag);
          if (accId) matchedAccId = accId;
        }
      }

      // 3) Fallback: cross-reference utm_campaign with traffic_data campaign_name
      if (!matchedAccId && sale.utm_campaign) {
        const utmLower = String(sale.utm_campaign).toLowerCase().trim();
        const accId = campaignNameToAccount.get(utmLower);
        if (accId) matchedAccId = accId;
      }

      if (matchedAccId) {
        revenueByAccount.set(matchedAccId, (revenueByAccount.get(matchedAccId) || 0) + Number(sale.revenue));
        salesByAccount.set(matchedAccId, (salesByAccount.get(matchedAccId) || 0) + 1);
        if (!hasUtm) salesWithoutUtmByAccount.set(matchedAccId, (salesWithoutUtmByAccount.get(matchedAccId) || 0) + 1);
        const saleDate = new Date((sale as any).created_at || (sale as any).occurred_at || sale.date);
        const prev = lastSaleByAccount.get(matchedAccId);
        if (!prev || saleDate > prev) lastSaleByAccount.set(matchedAccId, saleDate);
      } else {
        unattributedRevenue += Number(sale.revenue);
        if (!hasUtm) {
          // count as unattributed without UTM
        }
      }
    }

    // NÃO redistribuir receita órfã proporcional ao spend: isso inflava a
    // receita por conta sem aumentar a contagem de vendas, quebrando a relação
    // Receita ≈ saleCount × ticket médio. Receita órfã fica visível apenas em
    // diagnostics/recommendations (campo `unattributedRevenue`).

    const totalSpend = Array.from(spendByAccount.values()).reduce((s, v) => s + v, 0);

    // Status counts — fonte é o status vindo da API Meta salvo em account_status.
    // is_active só significa que a conta está configurada no sistema.
    const statusCounts = { active: 0, restricted: 0, inactive: 0, apiNoPermission: 0, own: 0, rented: 0, unknown: 0 };
    for (const acc of accounts) {
      const rawS = (acc as any).account_status;
      // Antes: null/undefined virava 1 (Ativa) → inflava "Ativas" com contas
      // recém-criadas cujo sync-campaign-status ainda não populou o status.
      // Agora: null/undefined vai pra "unknown" e não conta em nenhum dos 3.
      const s = rawS === null || rawS === undefined ? -1 : Number(rawS);
      const reason = String((acc as any).disable_reason || "");
      const cat = (acc as any).category || "own";
      const isApiPermissionOnly = reason.includes("Sem acesso via API (200)") || reason.includes("Sem permissão API (200)");
      // Status real conforme Meta: 1=Ativa, 2=Desabilitada, 3=Restrita/Pendente, 101=Fechada.
      // "Sem API" é uma condição de operabilidade (token não enxerga), NÃO substitui o status real:
      // a conta continua contando no bucket real dela; apiNoPermission é apenas um overlay diagnóstico.
      if (s === 1) statusCounts.active++;
      else if (s === 3 || s === 7 || s === 9 || s === 100) statusCounts.restricted++;
      else if (s === 2 || s === 101) statusCounts.inactive++;
      else if (s === -1) statusCounts.unknown++;
      if (isApiPermissionOnly) statusCounts.apiNoPermission++;
      if (cat === "own") statusCounts.own++;
      else statusCounts.rented++;
    }


    // Build rows with diagnostics
    const rows = accounts.map((acc: any) => {
      const accId = acc.account_id;
      const spend = spendByAccount.get(accId) || 0;
      const revenue = revenueByAccount.get(accId) || 0;
      const saleCount = salesByAccount.get(accId) || 0;
      const noUtmCount = salesWithoutUtmByAccount.get(accId) || 0;
      const lastSale = lastSaleByAccount.get(accId) || null;
      const roas = spend > 0 ? revenue / spend : 0;
      const noUtmPct = saleCount > 0 ? (noUtmCount / saleCount) * 100 : 0;
      const activeCampaigns = activeCampaignsByAccount.get(accId)?.size || 0;
      const project = projectByAccount.get(accId) || null;

      // Tracking health
      let trackingHealth: TrackingHealth = "OK";
      let trackingReason = "";

      if (spend > 50 && revenue === 0) {
        trackingHealth = "Crítico";
        trackingReason = `Gasto ${fmt(spend, "currency")} sem receita`;
      } else if (spend > 20 && roas === 0) {
        trackingHealth = "Crítico";
        trackingReason = "ROAS zerado com investimento";
      } else if (noUtmPct > 30) {
        trackingHealth = "Atenção";
        trackingReason = `${noUtmPct.toFixed(0)}% vendas sem UTM`;
      } else if (lastSale && (Date.now() - lastSale.getTime()) > 45 * 60 * 1000 && spend > 30 && isToday) {
        trackingHealth = "Atenção";
        trackingReason = `Sem vendas há ${timeAgo(lastSale)}`;
      }

      return {
        accountId: accId,
        accountName: acc.account_name || accId,
        currency: acc.currency || "BRL",
        // -1 = status ainda não sincronizado (conta nova). Não pode virar 1,
        // senão infla "Ativas" com contas que a Meta nunca confirmou.
        accountStatus: acc.account_status ?? -1,
        disableReason: acc.disable_reason || "",
        category: acc.category || "own",
        activeCampaigns, project,
        spend, revenue, roas,
        profit: revenue - spend,
        saleCount, noUtmPct,
        lastSale, trackingHealth, trackingReason,
        spendFallback: spendFallbackAccounts.has(accId),
        bmId: (acc as any).bm_id || null,
      };
    });

    const totalRevenue = rows.reduce((s: number, r: any) => s + r.revenue, 0);
    const totalActiveCampaigns = Array.from(activeCampaignsByAccount.values()).reduce((s, set) => s + set.size, 0);
    const trackingOk = rows.filter((r: any) => r.trackingHealth === "OK").length;
    const trackingFail = rows.filter((r: any) => r.trackingHealth !== "OK").length;

    // Structure totals
    const stTotals: Record<CampaignStructure, number> = {
      TESTE: activeCampaignsByStructure.TESTE.size,
      "PRÉ ESCALA": activeCampaignsByStructure["PRÉ ESCALA"].size,
      ESCALA: activeCampaignsByStructure.ESCALA.size,
      OUTRO: activeCampaignsByStructure.OUTRO.size,
    };

    // ─── Recommendations ──────────────────────────────────────────────
    const recs: { priority: "P0" | "P1" | "P2"; message: string; detail: string; impact: string }[] = [];

    const criticalTracking = rows.filter((r: any) => r.trackingHealth === "Crítico");
    if (criticalTracking.length > 0) {
      recs.push({
        priority: "P0",
        message: `Tracking crítico: receita zerada com spend alto em ${criticalTracking.length} conta${criticalTracking.length > 1 ? "s" : ""}.`,
        detail: "Validar UTM + RedTrack postback + webhook de vendas.",
        impact: "Perda de dados de atribuição e decisões baseadas em dados incompletos.",
      });
    }

    const noSaleAccounts = rows.filter((r: any) => r.spend > 30 && r.saleCount === 0 && r.accountStatus === 1);
    for (const acc of noSaleAccounts.slice(0, 3)) {
      if (acc.lastSale && isToday) {
        const minsSinceLastSale = Math.floor((Date.now() - acc.lastSale.getTime()) / 60000);
        if (minsSinceLastSale > 45) {
          recs.push({
            priority: "P0",
            message: `${acc.accountName} sem vendas há ${minsSinceLastSale}min com ${fmt(acc.spend, "currency")} investido.`,
            detail: "Verificar aprovação, saldo, billing e limitações da conta.",
            impact: "Gasto contínuo sem retorno de receita.",
          });
        }
      }
    }

    const highNoUtm = rows.filter((r: any) => r.noUtmPct > 30 && r.saleCount > 2);
    if (highNoUtm.length > 0) {
      recs.push({
        priority: "P1",
        message: `${highNoUtm.length} conta${highNoUtm.length > 1 ? "s" : ""} com >30% vendas sem UTM.`,
        detail: "Forçar captura de UTM e validar parâmetros de URL nos anúncios.",
        impact: "Atribuição incorreta de vendas e métricas distorcidas.",
      });
    }

    const topRoasAccounts = rows.filter((r: any) => r.roas > 2 && r.spend > 50 && r.accountStatus === 1);
    if (topRoasAccounts.length > 0) {
      recs.push({
        priority: "P2",
        message: `${topRoasAccounts.length} conta${topRoasAccounts.length > 1 ? "s" : ""} com ROAS > 2.0x.`,
        detail: "Avaliar aumento gradual de budget nas campanhas mais rentáveis.",
        impact: "Potencial para escalar receita mantendo margens saudáveis.",
      });
    }

    const restrictedAccounts = rows.filter((r: any) => r.accountStatus !== 1 && r.accountStatus !== 2 && r.accountStatus !== 101 && r.accountStatus !== -1);
    if (restrictedAccounts.length > 0) {
      recs.push({
        priority: "P1",
        message: `${restrictedAccounts.length} conta${restrictedAccounts.length > 1 ? "s" : ""} com restrição ou em revisão.`,
        detail: "Verificar compliance e regras de anúncio nas contas afetadas.",
        impact: "Limitação de entrega e risco de desabilitação.",
      });
    }

    // ─── Device Analytics ─────────────────────────────────────────────
    const devices = redtrackDeviceData || [];
    const osCounts = new Map<string, { count: number; revenue: number }>();
    const browserCounts = new Map<string, { count: number; revenue: number }>();
    const deviceCounts = new Map<string, { count: number; revenue: number }>();
    const countryCounts = new Map<string, { count: number; revenue: number }>();

    for (const d of devices) {
      const os = d.os || "Desconhecido";
      const browser = d.browser || "Desconhecido";
      const device = d.device || "Desconhecido";
      const country = d.country || "Desconhecido";
      const amount = Number(d.amount) || 0;

      if (!osCounts.has(os)) osCounts.set(os, { count: 0, revenue: 0 });
      osCounts.get(os)!.count++;
      osCounts.get(os)!.revenue += amount;

      if (!browserCounts.has(browser)) browserCounts.set(browser, { count: 0, revenue: 0 });
      browserCounts.get(browser)!.count++;
      browserCounts.get(browser)!.revenue += amount;

      if (!deviceCounts.has(device)) deviceCounts.set(device, { count: 0, revenue: 0 });
      deviceCounts.get(device)!.count++;
      deviceCounts.get(device)!.revenue += amount;

      if (!countryCounts.has(country)) countryCounts.set(country, { count: 0, revenue: 0 });
      countryCounts.get(country)!.count++;
      countryCounts.get(country)!.revenue += amount;
    }

    const sortMap = (m: Map<string, { count: number; revenue: number }>) =>
      [...m.entries()].sort((a, b) => b[1].count - a[1].count);

    return {
      accountRows: rows,
      totals: {
        spend: totalSpend,
        revenue: totalRevenue,
        roas: totalSpend > 0 ? totalRevenue / totalSpend : 0,
        accounts: accounts.length,
        activeCampaigns: totalActiveCampaigns,
        trackingOk,
        trackingFail,
        alertCount: criticalTracking.length + highNoUtm.length + restrictedAccounts.length,
      },
      structureTotals: stTotals,
      accountStatusCounts: statusCounts,
      diagnostics: rows,
      recommendations: recs,
      deviceAnalytics: {
        os: sortMap(osCounts),
        browser: sortMap(browserCounts),
        device: sortMap(deviceCounts),
        country: sortMap(countryCounts),
        total: devices.length,
      },
    };
  }, [spendByAccountData, salesDataRaw, redTrackSalesRaw, campaignStatuses, accountStatuses, utmAliases, redtrackDeviceData, isToday]);

  // ─── Filtered accounts ──────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    let rows = [...accountRows];
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      rows = rows.filter((r: any) => r.accountName.toLowerCase().includes(q) || r.accountId.includes(q));
    }
    if (statusFilter !== "all") {
      const isApiOnly = (r: any) => String(r.disableReason || "").includes("Sem acesso via API (200)") || String(r.disableReason || "").includes("Sem permissão API (200)");
      if (statusFilter === "active") rows = rows.filter((r: any) => r.accountStatus === 1 && !isApiOnly(r));
      else if (statusFilter === "restricted") rows = rows.filter((r: any) => r.accountStatus !== 1 && r.accountStatus !== 2 && r.accountStatus !== 101 && r.accountStatus !== -1);
      else if (statusFilter === "api") rows = rows.filter(isApiOnly);
      else if (statusFilter === "inactive") rows = rows.filter((r: any) => (r.accountStatus === 2 || r.accountStatus === 101) && !isApiOnly(r));
      else if (statusFilter === "unknown") rows = rows.filter((r: any) => r.accountStatus === -1);
    }
    if (currencyFilter !== "all") rows = rows.filter((r: any) => r.currency === currencyFilter);
    if (projectFilter !== "all") rows = rows.filter((r: any) => (r.project || "") === projectFilter);
    // Sort
    rows.sort((a: any, b: any) => {
      const diff = (b[tableSortKey] || 0) - (a[tableSortKey] || 0);
      return tableSortDir === "desc" ? diff : -diff;
    });
    return rows;
  }, [accountRows, searchText, statusFilter, currencyFilter, projectFilter, tableSortKey, tableSortDir]);
  

  // ─── Side Panel Data ────────────────────────────────────────────────
  const selectedAccountData = useMemo(() => {
    if (!selectedAccount) return null;
    const acc = accountRows.find((r: any) => r.accountId === selectedAccount);
    if (!acc) return null;

    const campaigns = campaignStatuses || [];

    // Get active campaigns for this account with budget info
    const activeCamps = campaigns
      .filter((c: any) => c.account_id === selectedAccount && c.effective_status === "ACTIVE")
      .map((c: any) => c.campaign_name);

    // Use daily_budget from campaign statuses as spend proxy for top campaigns
    const campBudget = new Map<string, number>();
    for (const c of campaigns) {
      if ((c as any).account_id !== selectedAccount) continue;
      const name = (c as any).campaign_name || "";
      const budget = Number((c as any).daily_budget || 0);
      campBudget.set(name, (campBudget.get(name) || 0) + budget);
    }

    const topBySpend = [...campBudget.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topByRevenue: [string, number][] = [];

    return { ...acc, topBySpend, topByRevenue, activeCamps };
  }, [selectedAccount, accountRows, campaignStatuses]);

  async function handleSyncNow() {
    setSyncing(true);
    try {
      await syncNow();
      toast.success("Contas e campanhas atualizadas");
    } catch {
      toast.error("Erro ao sincronizar");
    } finally {
      setSyncing(false);
    }
  }

  const lastSyncLabel = lastSyncTime
    ? lastSyncTime.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : null;

  const priorityColors = {
    P0: "border-destructive/30 bg-destructive/5 text-destructive",
    P1: "border-amber-400/30 bg-amber-400/5 text-amber-400",
    P2: "border-blue-400/30 bg-blue-400/5 text-blue-400",
  };

  const totalStructure = Object.values(structureTotals).reduce((s, v) => s + v, 0);

  return (
    <div className="space-y-8 full-width-page w-full">
      {/* ══════════════════════════════════════════════════════════════
          HEADER
          ══════════════════════════════════════════════════════════════ */}
      <div className="space-y-4">
        {/* Row 1: Title + Search + Sync */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Central de Contingência</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Monitoramento de contas e campanhas em tempo real • {periodLabel}
              {lastSyncLabel && (
                <span className="ml-1 inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {lastSyncLabel}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <AccountSelector />
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                placeholder="Buscar conta..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="h-8 w-[180px] pl-8 text-xs border-border bg-secondary/50"
              />
              {searchText && (
                <button onClick={() => setSearchText("")} className="absolute right-2 top-1/2 -translate-y-1/2">
                  <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={handleSyncNow} disabled={syncing}>
              {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Sincronizar
            </Button>
          </div>
        </div>

        {/* Row 2: Inline chip filters */}
        <div className="flex items-center gap-6 flex-wrap">
          {/* Status chips */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mr-1">Status</span>
            {([
              { value: "all", label: "Todas", count: accountRows.length },
              { value: "active", label: "Ativas", count: accountStatusCounts.active, color: "text-wr-positive" },
              { value: "restricted", label: "Restritas", count: accountStatusCounts.restricted, color: "text-destructive" },
              { value: "api", label: "Sem API", count: accountStatusCounts.apiNoPermission, color: "text-amber-400" },
              { value: "inactive", label: "Inativas", count: accountStatusCounts.inactive, color: "text-muted-foreground" },
              { value: "unknown", label: "Sem status", count: accountStatusCounts.unknown, color: "text-muted-foreground" },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setStatusFilter(opt.value === statusFilter ? "all" : opt.value)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-all ${
                  statusFilter === opt.value
                    ? "bg-primary/15 border-primary/40 text-primary"
                    : "bg-secondary/30 border-border text-muted-foreground hover:text-foreground hover:border-foreground/20"
                }`}
              >
                {opt.label}
                <span className={`ml-1 text-[9px] font-data ${statusFilter === opt.value ? "text-primary" : (opt as any).color || "text-muted-foreground"}`}>
                  {opt.count}
                </span>
              </button>
            ))}
          </div>

          {/* Currency chips */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mr-1">Moeda</span>
            {(["all", "BRL", "USD"] as const).map((cur) => (
              <button
                key={cur}
                onClick={() => setCurrencyFilter(cur === currencyFilter ? "all" : cur)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-all ${
                  currencyFilter === cur
                    ? "bg-primary/15 border-primary/40 text-primary"
                    : "bg-secondary/30 border-border text-muted-foreground hover:text-foreground hover:border-foreground/20"
                }`}
              >
                {cur === "all" ? "Todas" : cur}
              </button>
            ))}
          </div>

          {/* Project chips */}
          {(() => {
            const projects = [...new Set(accountRows.map((r: any) => r.project).filter(Boolean))].sort();
            if (projects.length === 0) return null;
            return (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mr-1">Projeto</span>
                <button
                  onClick={() => setProjectFilter("all")}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-all ${
                    projectFilter === "all"
                      ? "bg-primary/15 border-primary/40 text-primary"
                      : "bg-secondary/30 border-border text-muted-foreground hover:text-foreground hover:border-foreground/20"
                  }`}
                >
                  Todos
                </button>
                {projects.map((proj: string) => (
                  <button
                    key={proj}
                    onClick={() => setProjectFilter(proj === projectFilter ? "all" : proj)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-all ${
                      projectFilter === proj
                        ? "bg-primary/15 border-primary/40 text-primary"
                        : "bg-secondary/30 border-border text-muted-foreground hover:text-foreground hover:border-foreground/20"
                    }`}
                  >
                    {proj}
                  </button>
                ))}
              </div>
            );
          })()}

          {/* Active filter count + clear */}
          {(statusFilter !== "all" || currencyFilter !== "all" || projectFilter !== "all" || searchText) && (
            <button
              onClick={() => { setStatusFilter("all"); setCurrencyFilter("all"); setProjectFilter("all"); setSearchText(""); }}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-destructive hover:bg-destructive/10 transition-colors"
            >
              <X className="h-3 w-3" />
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          BLOCO 1 — RESUMO OPERACIONAL (30 SEGUNDOS)
          ══════════════════════════════════════════════════════════════ */}
      <div>
        <SectionHeader title="Resumo Operacional" icon={Shield} right="30 segundos" />
        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <StatusHoverCard
            accounts={diagnostics.filter((r: any) => r.accountStatus === 1 && !String(r.disableReason || "").includes("Sem permissão API (200)") && !String(r.disableReason || "").includes("Sem acesso via API (200)"))}
            label="Ativas"
          >
            <Card className="bg-card border border-border cursor-default">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-wr-positive/10 flex items-center justify-center">
                  <ShieldCheck className="h-4 w-4 text-wr-positive" />
                </div>
                <div>
                  <p className="text-2xl font-semibold font-data">{accountStatusCounts.active}</p>
                  <p className="text-[10px] text-muted-foreground">Ativas</p>
                </div>
              </CardContent>
            </Card>
          </StatusHoverCard>
          <StatusHoverCard
            accounts={diagnostics.filter((r: any) => r.accountStatus !== 1 && r.accountStatus !== 2 && r.accountStatus !== 101 && r.accountStatus !== -1)}
            label="Restritas"
          >
            <Card className="bg-card border border-border cursor-default">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-destructive/10 flex items-center justify-center">
                  <ShieldAlert className="h-4 w-4 text-destructive" />
                </div>
                <div>
                  <p className="text-2xl font-semibold font-data">{accountStatusCounts.restricted}</p>
                  <p className="text-[10px] text-muted-foreground">Restritas</p>
                </div>
              </CardContent>
            </Card>
          </StatusHoverCard>
          <StatusHoverCard
            accounts={diagnostics.filter((r: any) => r.accountStatus === 2 || r.accountStatus === 101)}
            label="Desabilitadas"
          >
            <Card className="bg-card border border-border cursor-default">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-muted/50 flex items-center justify-center">
                  <ShieldOff className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-semibold font-data">{accountStatusCounts.inactive}</p>
                  <p className="text-[10px] text-muted-foreground">Desabilitadas</p>
                </div>
              </CardContent>
            </Card>
          </StatusHoverCard>
          {accountStatusCounts.unknown > 0 && (
            <StatusHoverCard
              accounts={diagnostics.filter((r: any) => r.accountStatus === -1)}
              label="Sem status"
            >
              <Card className="bg-card border border-amber-400/30 cursor-default">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-amber-400/10 flex items-center justify-center">
                    <ShieldOff className="h-4 w-4 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-semibold font-data">{accountStatusCounts.unknown}</p>
                    <p className="text-[10px] text-muted-foreground">Sem status (sincronizar)</p>
                  </div>
                </CardContent>
              </Card>
            </StatusHoverCard>
          )}
          <Card className="bg-card border border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Wifi className="h-3.5 w-3.5 text-wr-positive" />
                <span className="text-[10px] text-muted-foreground">Tracking</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-semibold font-data text-wr-positive">{totals.trackingOk}</span>
                <span className="text-[10px] text-muted-foreground">OK</span>
                {totals.trackingFail > 0 && (
                  <>
                    <span className="text-lg font-semibold font-data text-destructive">{totals.trackingFail}</span>
                    <span className="text-[10px] text-muted-foreground">falha</span>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border border-border">
            <CardContent className="p-4">
              <p className="text-[10px] text-muted-foreground uppercase mb-1">Tipo</p>
              <div className="flex items-baseline gap-3">
                <div>
                  <span className="text-lg font-semibold font-data">{accountStatusCounts.own}</span>
                  <span className="text-[9px] text-muted-foreground ml-1">Próprias</span>
                </div>
                <div>
                  <span className="text-lg font-semibold font-data">{accountStatusCounts.rented}</span>
                  <span className="text-[9px] text-muted-foreground ml-1">Alugadas</span>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="h-4 w-4 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-semibold font-data text-destructive">{totals.alertCount}</p>
                <p className="text-[10px] text-muted-foreground">Alertas</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* KPIs financeiros — usa dados autoritativos do dashboard-totals */}
        {(() => {
          const skySpend = skyTotals?.totalSpend ?? totals.spend;
          const skyRevenue = skyTotals?.totalRevenue ?? totals.revenue;
          const skyRoas = skySpend > 0 ? skyRevenue / skySpend : 0;
          return (
            <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="bg-card border border-border">
                <CardContent className="p-4">
                  <p className="text-[10px] text-muted-foreground uppercase mb-1">Investimento</p>
                  <p className="text-xl font-semibold font-data">{fmt(skySpend, "currency")}</p>
                </CardContent>
              </Card>
              <Card className="bg-card border border-border">
                <CardContent className="p-4">
                  <p className="text-[10px] text-muted-foreground uppercase mb-1">Receita</p>
                  <p className="text-xl font-semibold font-data text-wr-positive">{fmt(skyRevenue, "currency")}</p>
                </CardContent>
              </Card>
              <Card className="bg-card border border-border">
                <CardContent className="p-4">
                  <p className="text-[10px] text-muted-foreground uppercase mb-1">ROAS Consolidado</p>
                  <p className={`text-xl font-semibold font-data ${skyRoas >= 1.2 ? "text-wr-positive" : skyRoas >= 1 ? "text-foreground" : "text-destructive"}`}>
                    {fmt(skyRoas, "roas")}
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-card border border-border">
                <CardContent className="p-4">
                  <p className="text-[10px] text-muted-foreground uppercase mb-1">Campanhas Ativas</p>
                  <p className="text-xl font-semibold font-data">{totals.activeCampaigns}</p>
                </CardContent>
              </Card>
            </div>
          );
        })()}
      </div>

      {/* ══════════════════════════════════════════════════════════════
          INFRAESTRUTURA DE CONTAS
          ══════════════════════════════════════════════════════════════ */}
      <AccountInfraPanel />




      {/* ══════════════════════════════════════════════════════════════
          DISTRIBUIÇÃO POR PROJETO (compacto, filtra pipeline abaixo)
          ══════════════════════════════════════════════════════════════ */}
      <ProjectDistributionPanel
        selectedProject={pipelineFilter?.kind === "project" ? pipelineFilter.key : null}
        onSelectProject={handleSelectProject}
      />

      {/* ══════════════════════════════════════════════════════════════
          DISTRIBUIÇÃO POR FUSO HORÁRIO (compacto, filtra pipeline abaixo)
          ══════════════════════════════════════════════════════════════ */}
      <TimezoneDistributionPanel
        selectedTimezone={pipelineFilter?.kind === "timezone" ? pipelineFilter.key : null}
        onSelectTimezone={handleSelectTimezone}
      />

      {/* ══════════════════════════════════════════════════════════════
          PIPELINE DE FARM (ESTEIRA DE AQUECIMENTO)
          ══════════════════════════════════════════════════════════════ */}
      <AccountFarmPipeline
        externalAccountIds={pipelineFilter?.accountIds ?? null}
        externalFilterLabel={pipelineFilter ? `${pipelineFilter.kind === "project" ? "Projeto" : "Fuso"}: ${pipelineFilter.label}` : null}
        onClearExternalFilter={clearPipelineFilter}
      />

      {/* ══════════════════════════════════════════════════════════════
          INTELIGÊNCIA DE CONTINGÊNCIA
          ══════════════════════════════════════════════════════════════ */}
      <ContingencyIntelligence />


      {/* ══════════════════════════════════════════════════════════════
          BLOCO 2 — DIAGNÓSTICO DO TRACKING
          ══════════════════════════════════════════════════════════════ */}
      {diagnostics.some((d: any) => d.trackingHealth !== "OK") && (
        <div>
          <SectionHeader title="Diagnóstico do Tracking" icon={Wifi} right={`${diagnostics.filter((d: any) => d.trackingHealth !== "OK").length} problemas`} />
          <Card className="mt-3 bg-card border border-border">
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-card z-10">
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Conta</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-center">Moeda</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-right">Investimento</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-right">Receita</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-right">ROAS</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-right">% Sem UTM</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-right">Última Venda</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-center">Status</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Motivo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {diagnostics.filter((d: any) => d.trackingHealth !== "OK").map((d: any) => (
                      <TableRow key={d.accountId} className="border-border">
                        <TableCell className="text-xs font-medium">{d.accountName}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="text-[9px]">{d.currency}</Badge>
                        </TableCell>
                        <TableCell className="text-xs font-data text-right">{fmt(d.spend, "currency")}</TableCell>
                        <TableCell className="text-xs font-data text-right">{fmt(d.revenue, "currency")}</TableCell>
                        <TableCell className={`text-xs font-data text-right font-medium ${d.roas >= 1 ? "text-wr-positive" : "text-destructive"}`}>
                          {fmt(d.roas, "roas")}
                        </TableCell>
                        <TableCell className={`text-xs font-data text-right ${d.noUtmPct > 30 ? "text-amber-400" : ""}`}>
                          {fmt(d.noUtmPct, "percent")}
                        </TableCell>
                        <TableCell className="text-xs font-data text-right">{timeAgo(d.lastSale)}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={`text-[8px] px-1.5 py-0 ${healthColors[d.trackingHealth as TrackingHealth]}`}>
                            {d.trackingHealth}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-[10px] text-muted-foreground max-w-[200px] truncate">{d.trackingReason}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          BLOCO 3 — RECOMENDAÇÕES AUTOMÁTICAS (PLAYBOOK)
          ══════════════════════════════════════════════════════════════ */}
      {recommendations.length > 0 && (
        <div>
          <SectionHeader title="Ações Recomendadas Agora" icon={Brain} right={`${recommendations.length} ações`} />
          <div className="mt-3 space-y-2">
            {recommendations.map((rec, i) => {
              if (dismissedAlerts.has(i)) return null;
              return (
                <div key={i} className={`flex items-start gap-3 p-4 rounded-lg border ${priorityColors[rec.priority]}`}>
                  <Badge variant="outline" className={`text-[9px] font-bold px-2 shrink-0 mt-0.5 ${priorityColors[rec.priority]}`}>
                    {rec.priority}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium">{rec.message}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{rec.detail}</p>
                    <p className="text-[10px] mt-1 opacity-70">💡 Impacto: {rec.impact}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 shrink-0"
                    onClick={() => setDismissedAlerts(prev => new Set([...prev, i]))}
                    title="Silenciar"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          BLOCO 4 — ESTRUTURAS
          ══════════════════════════════════════════════════════════════ */}
      <div>
        <SectionHeader title="Campanhas Ativas por Estrutura" icon={Layers} right="real-time" />
        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
          {(["TESTE", "PRÉ ESCALA", "ESCALA", "OUTRO"] as CampaignStructure[]).map((key) => {
            const count = structureTotals[key];
            const pct = totalStructure > 0 ? (count / totalStructure) * 100 : 0;
            const Icon = key === "TESTE" ? FlaskConical : key === "PRÉ ESCALA" ? TrendingUp : key === "ESCALA" ? Rocket : Layers;
            return (
              <Card key={key} className="bg-card border border-border">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="outline" className={`text-[9px] font-medium ${structureColors[key]}`}>
                      {structureLabels[key]}
                    </Badge>
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="text-2xl font-semibold font-data">{count}</p>
                  <div className="mt-2">
                    <Progress value={pct} className="h-1.5" />
                    <p className="text-[10px] text-muted-foreground mt-1">{pct.toFixed(0)}% do total</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          BLOCO 5 — TABELA PRINCIPAL (CONTA → PERFORMANCE)
          ══════════════════════════════════════════════════════════════ */}
      <div>
        <SectionHeader title="Detalhamento por Conta" icon={BarChart3} right={`${filteredRows.length} contas`} />
        <Card className="mt-3 bg-card border border-border">
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Conta</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-center">Moeda</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-center">Projeto</TableHead>
                    <TableHead
                      className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-right cursor-pointer select-none hover:text-foreground transition-colors"
                      onClick={() => handleTableSort("spend")}
                    >
                      <span className="inline-flex items-center gap-1 justify-end">
                        Investimento
                        {tableSortKey === "spend" ? (tableSortDir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />) : <ArrowUpDown className="h-2.5 w-2.5 opacity-40" />}
                      </span>
                    </TableHead>
                    <TableHead
                      className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-right cursor-pointer select-none hover:text-foreground transition-colors"
                      onClick={() => handleTableSort("revenue")}
                    >
                      <span className="inline-flex items-center gap-1 justify-end">
                        Receita
                        {tableSortKey === "revenue" ? (tableSortDir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />) : <ArrowUpDown className="h-2.5 w-2.5 opacity-40" />}
                      </span>
                    </TableHead>
                    <TableHead
                      className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-right cursor-pointer select-none hover:text-foreground transition-colors"
                      onClick={() => handleTableSort("profit")}
                    >
                      <span className="inline-flex items-center gap-1 justify-end">
                        Lucro
                        {tableSortKey === "profit" ? (tableSortDir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />) : <ArrowUpDown className="h-2.5 w-2.5 opacity-40" />}
                      </span>
                    </TableHead>
                    <TableHead
                      className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-right cursor-pointer select-none hover:text-foreground transition-colors"
                      onClick={() => handleTableSort("roas")}
                    >
                      <span className="inline-flex items-center gap-1 justify-end">
                        ROAS
                        {tableSortKey === "roas" ? (tableSortDir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />) : <ArrowUpDown className="h-2.5 w-2.5 opacity-40" />}
                      </span>
                    </TableHead>
                    <TableHead
                      className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-right cursor-pointer select-none hover:text-foreground transition-colors"
                      onClick={() => handleTableSort("saleCount")}
                    >
                      <span className="inline-flex items-center gap-1 justify-end">
                        Conv.
                        {tableSortKey === "saleCount" ? (tableSortDir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />) : <ArrowUpDown className="h-2.5 w-2.5 opacity-40" />}
                      </span>
                    </TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-right">Última Venda</TableHead>
                    <TableHead
                      className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-right cursor-pointer select-none hover:text-foreground transition-colors"
                      onClick={() => handleTableSort("activeCampaigns")}
                    >
                      <span className="inline-flex items-center gap-1 justify-end">
                        Tráfego
                        {tableSortKey === "activeCampaigns" ? (tableSortDir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />) : <ArrowUpDown className="h-2.5 w-2.5 opacity-40" />}
                      </span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-xs text-muted-foreground py-8">
                        Nenhuma conta encontrada
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRows.map((a: any) => (
                      <TableRow
                        key={a.accountId}
                        className="border-border cursor-pointer hover:bg-secondary/30"
                        onClick={() => setSelectedAccount(a.accountId)}
                      >
                        <TableCell className="text-xs font-medium">
                          <span className="inline-flex items-center gap-1.5">
                            {a.accountName}
                            {a.spendFallback && (
                              <Badge
                                variant="outline"
                                style={{ borderColor: "hsl(var(--wr-warning) / 0.4)", color: "hsl(var(--wr-warning))" }}
                                className="text-[9px] font-medium"
                                title="Sem dados horários BRT hoje — investimento veio do total diário da conta (sync horário pendente)"
                              >
                                sync horário pendente
                              </Badge>
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={`text-[9px] font-medium ${a.currency === "USD" ? "border-destructive/30 text-destructive" : ""}`}>
                            {a.currency}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {a.project ? (
                            <span
                              className={`inline-flex items-center rounded border px-1.5 py-0 font-mono text-[9px] font-semibold leading-4 ${
                                a.project === "NDM" ? "border-primary/30 text-primary bg-primary/5" :
                                a.project === "NDR" ? "border-blue-500/30 text-blue-500 bg-blue-500/5" :
                                a.project === "LDR" ? "border-cyan-500/30 text-cyan-500 bg-cyan-500/5" :
                                a.project === "NDB" ? "border-purple-500/30 text-purple-500 bg-purple-500/5" :
                                "border-muted-foreground/30 text-muted-foreground"
                              }`}
                            >
                              {a.project}
                            </span>
                          ) : (
                            <span className="text-[9px] text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs font-data text-right">{fmt(a.spend, "currency")}</TableCell>
                        <TableCell className="text-xs font-data text-right text-wr-positive">{fmt(a.revenue, "currency")}</TableCell>
                        <TableCell className={`text-xs font-data text-right font-medium ${a.profit >= 0 ? "text-wr-positive" : "text-destructive"}`}>
                          {fmt(a.profit, "currency")}
                        </TableCell>
                        <TableCell className={`text-xs font-data text-right font-medium ${a.roas >= 1.2 ? "text-wr-positive" : a.roas >= 1 ? "text-foreground" : "text-destructive"}`}>
                          {fmt(a.roas, "roas")}
                        </TableCell>
                        <TableCell className="text-xs font-data text-right">{a.saleCount}</TableCell>
                        <TableCell className="text-xs font-data text-right">{timeAgo(a.lastSale)}</TableCell>
                        <TableCell className="text-xs font-data text-right">
                          <span className={a.activeCampaigns > 0 ? "text-foreground" : "text-muted-foreground"}>
                            {a.activeCampaigns} camp.
                          </span>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
                {filteredRows.length > 0 && (() => {
                  const totSpend = filteredRows.reduce((s: number, r: any) => s + (r.spend || 0), 0);
                  const totRevenue = filteredRows.reduce((s: number, r: any) => s + (r.revenue || 0), 0);
                  const totProfit = totRevenue - totSpend;
                  const totRoas = totSpend > 0 ? totRevenue / totSpend : 0;
                  const totConv = filteredRows.reduce((s: number, r: any) => s + (r.saleCount || 0), 0);
                  return (
                    <tfoot className="sticky bottom-0 bg-card border-t-2 border-primary/30">
                      <tr>
                        <td className="px-4 py-2.5 text-xs font-bold uppercase tracking-wide" colSpan={3}>Total ({filteredRows.length} contas)</td>
                        <td className="px-4 py-2.5 text-xs font-bold font-data text-right">{fmt(totSpend, "currency")}</td>
                        <td className="px-4 py-2.5 text-xs font-bold font-data text-right text-wr-positive">{fmt(totRevenue, "currency")}</td>
                        <td className={`px-4 py-2.5 text-xs font-bold font-data text-right ${totProfit >= 0 ? "text-wr-positive" : "text-destructive"}`}>{fmt(totProfit, "currency")}</td>
                        <td className={`px-4 py-2.5 text-xs font-bold font-data text-right ${totRoas >= 1.2 ? "text-wr-positive" : totRoas >= 1 ? "text-foreground" : "text-destructive"}`}>{fmt(totRoas, "roas")}</td>
                        <td className="px-4 py-2.5 text-xs font-bold font-data text-right">{totConv}</td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  );
                })()}
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          BLOCO 6 — DISPOSITIVOS & ORIGEM (REDTRACK)
          ══════════════════════════════════════════════════════════════ */}
      {deviceAnalytics.total > 0 && (
        <div>
          <SectionHeader title="Dispositivos & Origem (RedTrack)" icon={Monitor} right={`${deviceAnalytics.total} conversões`} />
          <Card className="mt-3 bg-card border border-border">
            <CardContent className="p-5">
              <Tabs defaultValue="os" className="space-y-4">
                <TabsList className="bg-secondary/50">
                  <TabsTrigger value="os" className="text-xs gap-1"><Smartphone className="h-3 w-3" />OS</TabsTrigger>
                  <TabsTrigger value="browser" className="text-xs gap-1"><Globe className="h-3 w-3" />Browser</TabsTrigger>
                  <TabsTrigger value="device" className="text-xs gap-1"><Monitor className="h-3 w-3" />Device</TabsTrigger>
                  <TabsTrigger value="country" className="text-xs gap-1"><Globe className="h-3 w-3" />País</TabsTrigger>
                </TabsList>

                {(["os", "browser", "device", "country"] as const).map((key) => (
                  <TabsContent key={key} value={key}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Top 3 Highlights */}
                      <div className="space-y-3">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Top 3</p>
                        {deviceAnalytics[key].slice(0, 3).map(([name, data], i) => {
                          const maxCount = deviceAnalytics[key][0]?.[1]?.count || 1;
                          const barWidth = Math.max((data.count / maxCount) * 100, 8);
                          return (
                            <div key={name} className="space-y-1">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-primary w-4 text-center">{i + 1}</span>
                                  <span className="text-xs font-medium">{name}</span>
                                </div>
                                <span className="text-xs font-data">{data.count} vendas</span>
                              </div>
                              <div className="h-1.5 bg-secondary/30 rounded-full overflow-hidden">
                                <div className="h-full bg-primary/40 rounded-full" style={{ width: `${barWidth}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Full table */}
                      <div className="max-h-[200px] overflow-y-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="border-border hover:bg-transparent">
                              <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{key === "country" ? "País" : key === "os" ? "Sistema" : key === "browser" ? "Navegador" : "Dispositivo"}</TableHead>
                              <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-right">Vendas</TableHead>
                              <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-right">Receita</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {deviceAnalytics[key].map(([name, data]) => (
                              <TableRow key={name} className="border-border">
                                <TableCell className="text-xs">{name}</TableCell>
                                <TableCell className="text-xs font-data text-right">{data.count}</TableCell>
                                <TableCell className="text-xs font-data text-right">{fmt(data.revenue, "currency")}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          BLOCO 7 — REGRAS DE MAPEAMENTO (ADMIN)
          ══════════════════════════════════════════════════════════════ */}
      <div>
        <SectionHeader title="Regras de Mapeamento" icon={Settings2} right="admin" />
        <div className="mt-3">
          <MappingRulesPanel />
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          ══════════════════════════════════════════════════════════════ */}
      <Sheet open={!!selectedAccount} onOpenChange={(open) => { if (!open) setSelectedAccount(null); }}>
        <SheetContent className="w-[420px] sm:w-[480px] overflow-y-auto">
          {selectedAccountData && (
            <>
              <SheetHeader>
                <SheetTitle className="text-sm font-semibold">{selectedAccountData.accountName}</SheetTitle>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className={`text-[9px] ${selectedAccountData.currency === "USD" ? "border-destructive/30 text-destructive" : ""}`}>
                    {selectedAccountData.currency}
                  </Badge>
                  <Badge variant="outline" className={`text-[8px] ${getAccountStatusColor(selectedAccountData.accountStatus)}`}>
                    {getAccountStatusLabel(selectedAccountData.accountStatus)}
                  </Badge>
                  <Badge variant="outline" className="text-[8px]">
                    {selectedAccountData.category === "own" ? "Própria" : "Alugada"}
                  </Badge>
                  <Badge variant="outline" className={`text-[8px] ${healthColors[selectedAccountData.trackingHealth as TrackingHealth]}`}>
                    {selectedAccountData.trackingHealth}
                  </Badge>
                </div>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                {/* KPIs */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-secondary/30 border border-border">
                    <p className="text-[10px] text-muted-foreground uppercase">Investimento</p>
                    <p className="text-lg font-semibold font-data mt-1">{fmt(selectedAccountData.spend, "currency")}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/30 border border-border">
                    <p className="text-[10px] text-muted-foreground uppercase">Receita</p>
                    <p className="text-lg font-semibold font-data mt-1 text-wr-positive">{fmt(selectedAccountData.revenue, "currency")}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/30 border border-border">
                    <p className="text-[10px] text-muted-foreground uppercase">Lucro</p>
                    <p className={`text-lg font-semibold font-data mt-1 ${selectedAccountData.profit >= 0 ? "text-wr-positive" : "text-destructive"}`}>
                      {fmt(selectedAccountData.profit, "currency")}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/30 border border-border">
                    <p className="text-[10px] text-muted-foreground uppercase">ROAS</p>
                    <p className={`text-lg font-semibold font-data mt-1 ${selectedAccountData.roas >= 1 ? "text-wr-positive" : "text-destructive"}`}>
                      {fmt(selectedAccountData.roas, "roas")}
                    </p>
                  </div>
                </div>

                {/* Diagnóstico */}
                {selectedAccountData.trackingReason && (
                  <div className={`p-3 rounded-lg border ${healthColors[selectedAccountData.trackingHealth as TrackingHealth]}`}>
                    <p className="text-xs font-medium">⚠ {selectedAccountData.trackingReason}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {selectedAccountData.noUtmPct > 0 && `${fmt(selectedAccountData.noUtmPct, "percent")} vendas sem UTM • `}
                      Última venda: {timeAgo(selectedAccountData.lastSale)}
                    </p>
                  </div>
                )}

                {/* Top campanhas por gasto */}
                {selectedAccountData.topBySpend.length > 0 && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium mb-2">Top 5 por Gasto</p>
                    <div className="space-y-2">
                      {selectedAccountData.topBySpend.map(([name, spend]: [string, number], i: number) => (
                        <div key={i} className="flex items-center justify-between gap-2">
                          <span className="text-xs truncate" title={name}>{formatCampaignName(name)}</span>
                          <span className="text-xs font-data shrink-0">{fmt(spend, "currency")}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Campanhas ativas */}
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium mb-2">
                    Campanhas Ativas ({selectedAccountData.activeCamps?.length || 0})
                  </p>
                  <div className="space-y-1 max-h-[200px] overflow-y-auto">
                    {(selectedAccountData.activeCamps || []).slice(0, 15).map((name: string, i: number) => (
                      <div key={i} className="flex items-center gap-2">
                        <Badge variant="outline" className={`text-[8px] shrink-0 ${structureColors[detectStructure(name)]}`}>
                          {structureLabels[detectStructure(name)]}
                        </Badge>
                        <span className="text-[10px] truncate text-muted-foreground" title={name}>{formatCampaignName(name)}</span>
                      </div>
                    ))}
                    {(selectedAccountData.activeCamps || []).length === 0 && (
                      <p className="text-[10px] text-muted-foreground italic">Nenhuma campanha ativa</p>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
