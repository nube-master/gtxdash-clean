import { useQuery } from "@tanstack/react-query";
import { useOperationId } from "@/contexts/OperationContext";
import { supabase } from "@/integrations/supabase/client";
import { useDateRange } from "@/contexts/DateRangeContext";
import { mergeAllSales } from "@/lib/salesMerge";
import { useTrafficData } from "@/hooks/useTrafficData";
import { useRealSales } from "@/hooks/useRealSales";
import { useRedTrackSales } from "@/hooks/useRedTrackSales";
import { useCampaignStatuses } from "@/hooks/useCampaignStatuses";
import { useAccountStatuses } from "@/hooks/useAccountStatuses";
import { useCampaign3DayData, classifyCampaigns, type CampaignDecision } from "@/hooks/useCampaign3DayData";
import { detectStructure, formatCampaignName, type CampaignStructure } from "@/lib/formatNames";
import { extractProjectCode } from "@/lib/projectUtils";
import { resolveCreativeIdWithAd } from "@/lib/creativeUtils";
import { useMemo } from "react";
import { useGtxThresholds } from "./useGtxThresholds";

// ─── GTX Decision types ────────────────────────────────────────────────
export type GtxDecision = "ESCALAR" | "PROMOVER" | "MANTER" | "OBSERVAR" | "CORTAR";

export interface GtxCampaignRow {
  // Identification
  fullName: string;
  displayName: string;
  accountId: string;
  accountName: string;
  accountStatus: number;
  creativeId: string;
  project: string;
  phase: CampaignStructure;
  status: "ACTIVE" | "PAUSED" | "MIXED";
  createdDate: string;

  // Meta performance
  budget: number;
  spend: number;
  impressions: number;
  cpm: number;
  ctr: number;
  clicks: number;
  cpc: number;
  ic: number;
  cpaPaid: number;
  purchasesMeta: number;

  // Real performance (cross data)
  revenue: number;
  roas: number;
  profit: number;
  roi: number;
  margin: number;
  salesConfirmed: number;

  // GTX Intelligence — 3D aggregates
  sales3D: number[];
  profit3D: number[];
  spend3D: number[];
  revenue3D: number[];
  profit3DTotal: number;
  spend3DTotal: number;
  revenue3DTotal: number;
  roas3D: number;
  roi3D: number;
  margin3D: number;
  cpa3D: number;
  daysWithSale: number;
  consistency3D: string;
  scoreGtx: number;
  decision3D: CampaignDecision | null;

  // AI Decision (filled after analysis)
  gtxDecision: GtxDecision | null;
  gtxReason: string | null;
  gtxAction: string | null;

  // Modules: Scale Opportunity & Pain Index
  scaleOpportunity: boolean;
  painIndex: number;       // gasto sem venda / CPA esperado
  painLevel: "saudável" | "atenção" | "risco" | "cortar";
}

// ─── Decision color config ─────────────────────────────────────────────
export const GTX_DECISION_CONFIG: Record<GtxDecision, { label: string; emoji: string; color: string; bg: string }> = {
  ESCALAR:       { label: "Escalar",       emoji: "🟢", color: "text-emerald-400",      bg: "bg-emerald-400/10 border-emerald-400/30" },
  PROMOVER:      { label: "Promover",      emoji: "🚀", color: "text-sky-400",          bg: "bg-sky-400/10 border-sky-400/30" },
  MANTER:        { label: "Manter",        emoji: "🔵", color: "text-blue-400",         bg: "bg-blue-400/10 border-blue-400/30" },
  OBSERVAR:      { label: "Observar",      emoji: "🟡", color: "text-yellow-400",       bg: "bg-yellow-400/10 border-yellow-400/30" },
  CORTAR:        { label: "Cortar",        emoji: "🔴", color: "text-destructive",      bg: "bg-destructive/10 border-destructive/30" },
};

// ─── Pain Index Calculator ─────────────────────────────────────────────
export function computePainIndex(
  row: GtxCampaignRow,
  cfg?: { painCortarIndex?: number; defaultCpaThreshold?: number }
): { painIndex: number; painLevel: "saudável" | "atenção" | "risco" | "cortar" } {
  const cortar = cfg?.painCortarIndex ?? 2.0;
  const defCpa = cfg?.defaultCpaThreshold ?? 150;
  const cpaExpected = row.cpaPaid > 0 ? row.cpaPaid : defCpa;
  const totalSales3D = row.sales3D.reduce((a, b) => a + b, 0);
  const spendWithoutSale = totalSales3D === 0 ? (row.spend3DTotal > 0 ? row.spend3DTotal : row.spend) : 0;
  const painIndex = cpaExpected > 0 ? spendWithoutSale / cpaExpected : 0;
  const painLevel =
    painIndex >= cortar ? "cortar"
    : painIndex >= cortar * 0.75 ? "risco"
    : painIndex >= cortar * 0.5 ? "atenção"
    : "saudável";
  return { painIndex, painLevel };
}

// ─── Scale Opportunity Detector ───────────────────────────────────────
export function detectScaleOpportunity(
  row: GtxCampaignRow,
  cfg?: { scaleOpportunityRoi?: number; scaleOpportunitySpend?: number }
): boolean {
  const minRoi = cfg?.scaleOpportunityRoi ?? 1.30;
  const minSpend = cfg?.scaleOpportunitySpend ?? 300;
  const roi3D = row.spend3DTotal > 0 ? ((row.revenue3DTotal - row.spend3DTotal) / row.spend3DTotal) : 0;
  const profitableDays = row.profit3D.filter(p => p > 0).length;
  const highSpend = row.spend3DTotal >= minSpend;
  return roi3D >= minRoi && row.profit3DTotal > 0 && profitableDays >= 2 && row.daysWithSale >= 2 && highSpend;
}

// ─── GTX 2.0 Deterministic Decision Engine ───────────────────────────
export type GtxDecisionCfg = Partial<{
  testePromoverRoi: number; testePromoverMinSales: number;
  preEscalaPromoverRoi: number; preEscalaPromoverMinSales: number; preEscalaCortarRoiNeg: number;
  escalaEscalarRoi: number; escalaEscalarMinDays: number; escalaCortarRoiNeg: number;
  painCortarIndex: number; scaleOpportunityRoi: number; scaleOpportunitySpend: number;
  defaultCpaThreshold: number;
}>;
export function computeGtxDecision(
  row: GtxCampaignRow,
  cfg?: GtxDecisionCfg
): { decision: GtxDecision; reason: string; action: string } {
  const c = {
    testePromoverRoi: 1.30, testePromoverMinSales: 2,
    preEscalaPromoverRoi: 1.50, preEscalaPromoverMinSales: 2, preEscalaCortarRoiNeg: -0.50,
    escalaEscalarRoi: 1.30, escalaEscalarMinDays: 2, escalaCortarRoiNeg: -0.50,
    painCortarIndex: 2.0, scaleOpportunityRoi: 1.30, scaleOpportunitySpend: 300,
    defaultCpaThreshold: 150,
    ...cfg,
  };
  const { phase, sales3D, profit3DTotal, spend3DTotal, revenue3DTotal } = row;
  const v0 = sales3D[0] ?? 0;
  const v1 = sales3D[1] ?? 0;
  const totalSales3D = v0 + v1 + (sales3D[2] ?? 0);
  const roi3D = spend3DTotal > 0 ? ((revenue3DTotal - spend3DTotal) / spend3DTotal) : 0;
  const spend = spend3DTotal > 0 ? spend3DTotal : row.spend;
  const hasDataIncomplete = row.revenue === 0 && row.salesConfirmed === 0 && spend === 0;
  const daysWithSale = row.daysWithSale;

  const { painIndex, painLevel } = computePainIndex(row, c);

  if (hasDataIncomplete) {
    return { decision: "OBSERVAR", reason: "Dados incompletos", action: "Aguardar dados" };
  }

  if (painLevel === "cortar" && totalSales3D === 0) {
    return { decision: "CORTAR", reason: `🔥 Queimando dinheiro (índice ${painIndex.toFixed(1)})`, action: "Pausar campanha imediatamente" };
  }

  const isScaleOpp = detectScaleOpportunity(row, c);
  if (isScaleOpp && phase === "ESCALA") {
    return { decision: "ESCALAR", reason: `🚀 Oportunidade de escala (ROI ${(roi3D * 100).toFixed(0)}%)`, action: "Duplicar estrutura" };
  }

  if (phase === "TESTE") {
    if (totalSales3D >= c.testePromoverMinSales && roi3D >= c.testePromoverRoi) {
      return { decision: "PROMOVER", reason: `${totalSales3D} vendas + ROI ${(roi3D * 100).toFixed(0)}%`, action: "Promover para PRÉ-ESCALA" };
    }
    if (totalSales3D >= c.testePromoverMinSales && roi3D > 0) {
      return { decision: "PROMOVER", reason: `${totalSales3D} vendas + ROI positivo`, action: "Promover para PRÉ-ESCALA" };
    }
    const cpaThreshold = row.cpaPaid > 0 ? row.cpaPaid : c.defaultCpaThreshold;
    if (totalSales3D === 0 && spend >= cpaThreshold) {
      return { decision: "CORTAR", reason: `0 vendas + R$ ${Math.round(spend)} gasto (≥ CPA)`, action: "Pausar campanha" };
    }
    return { decision: "OBSERVAR", reason: totalSales3D > 0 ? `${totalSales3D} venda(s), validando criativo` : `Sem vendas, gasto R$ ${Math.round(spend)}`, action: "Aguardar mais dados" };
  }

  if (phase === "PRÉ ESCALA") {
    if (totalSales3D >= c.preEscalaPromoverMinSales && roi3D >= c.preEscalaPromoverRoi) {
      return { decision: "PROMOVER", reason: `${totalSales3D} vendas + ROI ${(roi3D * 100).toFixed(0)}%`, action: "Promover para ESCALA" };
    }
    if (totalSales3D === 0 && spend > 0) {
      return { decision: "CORTAR", reason: `0 vendas + R$ ${Math.round(spend)} gasto`, action: "Pausar campanha" };
    }
    if (totalSales3D > 0 && roi3D < c.preEscalaCortarRoiNeg) {
      return { decision: "CORTAR", reason: `ROI ${(roi3D * 100).toFixed(0)}% muito baixo`, action: "Pausar campanha" };
    }
    return { decision: "OBSERVAR", reason: `${totalSales3D} venda(s), ROI ${(roi3D * 100).toFixed(0)}%`, action: "Acompanhar constância" };
  }

  if (phase === "ESCALA") {
    const profitableDays = row.profit3D.filter(p => p > 0).length;
    if (roi3D >= c.escalaEscalarRoi && profitableDays >= c.escalaEscalarMinDays && profit3DTotal > 0) {
      return { decision: "ESCALAR", reason: `ROI ${(roi3D * 100).toFixed(0)}% + ${profitableDays} dias lucrativos`, action: "Duplicar estrutura" };
    }
    if (roi3D > 0 && daysWithSale >= 2 && profit3DTotal > 0) {
      return { decision: "MANTER", reason: `ROI ${(roi3D * 100).toFixed(0)}% + vendas constantes`, action: "Manter posição" };
    }
    if (v0 === 0 && v1 === 0 && spend > 0) {
      return { decision: "CORTAR", reason: "2 dias seguidos sem venda", action: "Pausar campanha" };
    }
    if (roi3D < c.escalaCortarRoiNeg && totalSales3D === 0) {
      return { decision: "CORTAR", reason: `ROI ${(roi3D * 100).toFixed(0)}% + 0 vendas`, action: "Pausar campanha" };
    }
    const cpaThreshold = row.cpaPaid > 0 ? row.cpaPaid : c.defaultCpaThreshold;
    if (totalSales3D === 0 && spend >= cpaThreshold) {
      return { decision: "CORTAR", reason: `CPA estourado + 0 vendas`, action: "Pausar campanha" };
    }
    if (roi3D > 0 || totalSales3D > 0) {
      return { decision: "OBSERVAR", reason: `ROI ${(roi3D * 100).toFixed(0)}%, vendas oscilando`, action: "Monitorar performance" };
    }
    return { decision: "OBSERVAR", reason: `ROI ${(roi3D * 100).toFixed(0)}%`, action: "Acompanhar" };
  }

  if (totalSales3D > 0 && roi3D > 0) {
    return { decision: "OBSERVAR", reason: "Estrutura não reconhecida", action: "Monitorar" };
  }
  if (totalSales3D === 0 && spend > 50) {
    return { decision: "CORTAR", reason: "Sem vendas", action: "Avaliar pausar" };
  }
  return { decision: "OBSERVAR", reason: "Estrutura não reconhecida", action: "Monitorar" };
}

// ─── Score GTX (0-100) ─────────────────────────────────────────────────
export type GtxScoreCfg = Partial<{
  roasWeight: number; roasTarget: number;
  consistWeight: number;
  profitWeight: number; profitTarget: number;
  volWeight: number; volTarget: number;
}>;
export function computeScoreGtx(row: GtxCampaignRow, cfg?: GtxScoreCfg): number {
  const c = {
    roasWeight: 40, roasTarget: 3,
    consistWeight: 30,
    profitWeight: 20, profitTarget: 1000,
    volWeight: 10, volTarget: 10,
    ...cfg,
  };
  let score = 0;
  const roasNorm = Math.min(row.roas / Math.max(c.roasTarget, 0.01), 1);
  score += roasNorm * c.roasWeight;
  const consistNorm = row.daysWithSale / 3;
  score += consistNorm * c.consistWeight;
  const profitNorm = row.profit > 0 ? Math.min(row.profit / Math.max(c.profitTarget, 1), 1) : 0;
  score += profitNorm * c.profitWeight;
  const volNorm = Math.min(row.salesConfirmed / Math.max(c.volTarget, 1), 1);
  score += volNorm * c.volWeight;
  return Math.round(Math.max(0, Math.min(100, score)));
}

// ─── Main hook ─────────────────────────────────────────────────────────
export function useGtxMetaData() {
  const { score: scoreCfg, decision: decisionCfg } = useGtxThresholds();
  const { dateRange, rangeKey } = useDateRange();
  const opId = useOperationId();
  const isToday = rangeKey === "today";
  const { data: trafficData } = useTrafficData();
  const { data: salesDataRaw } = useRealSales();
  const { data: redTrackSalesRaw } = useRedTrackSales();
  const { data: campaignStatuses, syncNow, dataUpdatedAt } = useCampaignStatuses();
  const { data: activeAccounts } = useAccountStatuses();
  const { trafficByDay, salesByDay, dates: dates3D, isLoading: loading3D } = useCampaign3DayData();

  // Account names
  const accountNamesQuery = useQuery({
    queryKey: ["meta-account-names", opId],
    queryFn: async () => {
      let q = supabase.from("meta_ad_accounts").select("account_id, account_name");
      if (opId) q = q.eq("operation_id", opId);
      const { data } = await q;
      const map = new Map<string, string>();
      for (const r of data ?? []) map.set(r.account_id, r.account_name);
      return map;
    },
    staleTime: 5 * 60_000,
  });

  const accountNames = accountNamesQuery.data ?? new Map<string, string>();

  // Include ALL accounts that have traffic data OR are active (status 1).
  // Restricted/disabled accounts (status 2) still have valid spend data that
  // must be cross-referenced with sales UTMs to avoid orphan-revenue rows.
  const accountsWithTraffic = useMemo(() => {
    const ids = new Set<string>();
    for (const t of trafficData ?? []) ids.add(t.account_id);
    return ids;
  }, [trafficData]);

  const activeAccountIds = useMemo(() => {
    if (!activeAccounts) return new Set<string>();
    const active = new Set(activeAccounts.filter((a) => a.account_status === 1).map((a) => a.account_id));
    // Merge accounts that have traffic data even if restricted
    for (const id of accountsWithTraffic) active.add(id);
    return active;
  }, [activeAccounts, accountsWithTraffic]);

  // Status map
  const statusMap = useMemo(() => {
    const map = new Map<string, "ACTIVE" | "PAUSED">();
    const filtered = campaignStatuses
      ? (activeAccountIds.size > 0
        ? campaignStatuses.filter((cs: any) => activeAccountIds.has(cs.account_id))
        : campaignStatuses)
      : [];
    for (const cs of filtered) {
      const eff = (cs as any).effective_status || (cs as any).status || "UNKNOWN";
      map.set((cs as any).campaign_name, eff === "ACTIVE" ? "ACTIVE" : "PAUSED");
    }
    return map;
  }, [campaignStatuses, activeAccountIds]);

  // 3D decisions map
  const decisions3D = useMemo(() => {
    const decisions = classifyCampaigns(trafficByDay, salesByDay, dates3D);
    const map = new Map<string, CampaignDecision>();
    for (const d of decisions) map.set(d.campaignName, d);
    return map;
  }, [trafficByDay, salesByDay, dates3D]);

  // Build campaign rows
  const campaigns = useMemo<GtxCampaignRow[]>(() => {
    const traffic = trafficData ?? [];
    const sales = mergeAllSales(salesDataRaw ?? [], redTrackSalesRaw ?? []);

    // Pre-build budget map from campaignStatuses for O(1) lookups
    const budgetMap = new Map<string, number>();
    const statusCampaignAccountMap = new Map<string, string>();
    // Campaign ID → Campaign Name map for meta_campaign_id attribution
    const campaignIdToName = new Map<string, string>();
    if (campaignStatuses) {
      for (const cs of campaignStatuses) {
        budgetMap.set(cs.campaign_name, Number((cs as any).daily_budget || 0));
        if (!statusCampaignAccountMap.has(cs.campaign_name)) {
          statusCampaignAccountMap.set(cs.campaign_name, cs.account_id);
        }
        // Map campaign_id → campaign_name for ID-based attribution
        if (cs.campaign_id) {
          campaignIdToName.set(cs.campaign_id, cs.campaign_name);
        }
      }
    }

    // Traffic aggregation by campaign
    const campMap = new Map<string, {
      accountId: string;
      spend: number; impressions: number; clicks: number; linkClicks: number;
      dates: Set<string>;
      firstDate: string;
    }>();

    for (const t of traffic) {
      if (activeAccountIds.size > 0 && !activeAccountIds.has(t.account_id)) continue;
      const name = t.campaign_name;
      if (!campMap.has(name)) {
        campMap.set(name, { accountId: t.account_id, spend: 0, impressions: 0, clicks: 0, linkClicks: 0, dates: new Set(), firstDate: t.date });
      }
      const c = campMap.get(name)!;
      c.spend += Number(t.spend);
      c.impressions += Number(t.impressions);
      c.clicks += Number(t.clicks);
      c.linkClicks += Number((t as any).inline_link_clicks ?? 0);
      c.dates.add(t.date);
      if (t.date < c.firstDate) c.firstDate = t.date;
    }

    // Sales by campaign — enhanced attribution with multi-level matching
    const adsetToCampaign = new Map<string, string>();
    for (const t of traffic) {
      if (!adsetToCampaign.has(t.adset_name)) adsetToCampaign.set(t.adset_name, t.campaign_name);
    }

    // Build set of all known campaign names for precise matching
    const allCampaignNames = new Set<string>([...campMap.keys()]);
    if (campaignStatuses) {
      for (const cs of campaignStatuses) allCampaignNames.add(cs.campaign_name);
    }

    // Today (BRT) string, used to know which 3D slot keeps today's precise attribution
    const todayBRT = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

    // 3D sales map (3 days) attributed per campaign+date using salesByDay (3-day source).
    // Cobre o gap onde useRealSales/useRedTrackSales só trazem o range do dashboard (geralmente "hoje"),
    // deixando ontem e anteontem zerados em revenue3D.
    const sales3DByCampaignByDay = new Map<string, Map<string, { count: number; revenue: number }>>();
    const allCampaignNamesArr = Array.from(allCampaignNames);
    const findCampaignByUtm = (utmRaw: string): string | null => {
      const key = utmRaw.includes("|") ? utmRaw.split("|")[0].trimEnd() : utmRaw;
      if (!key) return null;
      if (allCampaignNames.has(key)) return key;
      // startsWith / endsWith match com tolerância mínima de 20 chars
      let best = "";
      let bestLen = 0;
      for (const cn of allCampaignNamesArr) {
        if (cn.startsWith(key) || key.startsWith(cn)) {
          const overlap = Math.min(cn.length, key.length);
          if (overlap > bestLen && overlap >= 20) {
            bestLen = overlap;
            best = cn;
          }
        }
      }
      return best || null;
    };
    for (const s of salesByDay ?? []) {
      const matched = findCampaignByUtm(String(s.campaign ?? ""));
      if (!matched) continue;
      if (!sales3DByCampaignByDay.has(matched)) sales3DByCampaignByDay.set(matched, new Map());
      const m = sales3DByCampaignByDay.get(matched)!;
      const cur = m.get(s.date) ?? { count: 0, revenue: 0 };
      cur.count += s.count;
      cur.revenue += s.revenue;
      m.set(s.date, cur);
    }

    const salesByCampaign = new Map<string, { count: number; revenue: number }>();
    // Per-day attribution for accurate 3D calculations (each sale attributed to exactly ONE campaign)
    const salesByCampaignByDay = new Map<string, Map<string, { count: number; revenue: number }>>();
    
    function attributeSale(campaignKey: string, revenue: number, isUpsell: boolean, saleDate?: string) {
      if (!salesByCampaign.has(campaignKey)) salesByCampaign.set(campaignKey, { count: 0, revenue: 0 });
      const d = salesByCampaign.get(campaignKey)!;
      if (!isUpsell) d.count++;
      d.revenue += revenue;

      // Track per-day for 3D calculations
      if (saleDate) {
        if (!salesByCampaignByDay.has(campaignKey)) salesByCampaignByDay.set(campaignKey, new Map());
        const dayMap = salesByCampaignByDay.get(campaignKey)!;
        if (!dayMap.has(saleDate)) dayMap.set(saleDate, { count: 0, revenue: 0 });
        const dayEntry = dayMap.get(saleDate)!;
        if (!isUpsell) dayEntry.count++;
        dayEntry.revenue += revenue;
      }
    }


    for (const sale of sales) {
      const isUpsell = (sale as any).event_type === "upsell";
      const revenue = Number(sale.revenue);
      // Resolve sale date in SP timezone
      const saleDate = (sale as any).occurred_at
        ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date((sale as any).occurred_at))
        : (sale as any).date || "";
      let matched = false;

      // Level 1: meta_campaign_id → exact campaign name lookup
      const metaCampaignId = (sale as any).meta_campaign_id;
      if (metaCampaignId && campaignIdToName.has(metaCampaignId)) {
        const resolvedName = campaignIdToName.get(metaCampaignId)!;
        attributeSale(resolvedName, revenue, isUpsell, saleDate);
        matched = true;
        continue;
      }

      // Level 2: utm_campaign exact match
      let raw = (sale as any).utm_campaign || "";
      if (!raw) {
        // Level 3: utm_medium → adset → campaign fallback
        const adsetName = (sale as any).utm_medium || "";
        const resolved = adsetToCampaign.get(adsetName);
        if (resolved) raw = resolved;
      }
      if (!raw) { raw = "Sem UTM"; }
      
      // Clean pipe separator (common format: "campaign_name | extra_info")
      const key = raw.includes("|") ? raw.split("|")[0].trimEnd() : raw;

      // Level 4: Exact match against known campaign names
      if (allCampaignNames.has(key)) {
        attributeSale(key, revenue, isUpsell, saleDate);
        matched = true;
        continue;
      }

      // Level 5: Prefix match (campaign name starts with UTM or vice versa)
      // Use stricter matching: require at least 20 chars overlap to avoid false positives
      let bestMatch = "";
      let bestLen = 0;
      for (const campName of allCampaignNames) {
        if (campName.startsWith(key) || key.startsWith(campName)) {
          const overlapLen = Math.min(campName.length, key.length);
          if (overlapLen > bestLen && overlapLen >= 20) {
            bestLen = overlapLen;
            bestMatch = campName;
          }
        }
      }
      if (bestMatch) {
        attributeSale(bestMatch, revenue, isUpsell, saleDate);
        matched = true;
        continue;
      }

      // Level 6: Fallback — attribute to the UTM key as-is
      attributeSale(key, revenue, isUpsell, saleDate);
    }

    // Build rows for ALL campaigns from active accounts (Facebook/Utmify-like view).
    // No [vendas] tag requirement — show every active campaign that is spending or selling.
    const allKeys = new Set([...campMap.keys(), ...salesByCampaign.keys()]);
    if (campaignStatuses) {
      // Always include ACTIVE campaigns (from active accounts) even with zero spend
      // in the selected range — same rule today and on past ranges.
      for (const cs of campaignStatuses) {
        if (activeAccountIds.size > 0 && !activeAccountIds.has(cs.account_id)) continue;
        const eff = (cs as any).effective_status || (cs as any).status || "UNKNOWN";
        if (eff === "ACTIVE") allKeys.add(cs.campaign_name);
      }
    }

    const rows: GtxCampaignRow[] = [];

    for (const fullName of allKeys) {
      const trafficD = campMap.get(fullName);
      const salesD = salesByCampaign.get(fullName);
      const spend = trafficD?.spend ?? 0;
      const status = (statusMap.get(fullName) ?? "PAUSED") as "ACTIVE" | "PAUSED";

      // Keep row if: ACTIVE in Meta, has spend in the period, or has confirmed sales.
      if (status !== "ACTIVE" && spend === 0 && !salesD) continue;

      const impressions = trafficD?.impressions ?? 0;
      const clicks = trafficD?.clicks ?? 0;
      const linkClicks = trafficD?.linkClicks ?? 0;
      const salesConfirmed = salesD?.count ?? 0;
      const revenue = salesD?.revenue ?? 0;
      const roas = spend > 0 ? revenue / spend : 0;
      const profit = revenue - spend;
      const roi = spend > 0 ? (profit / spend) * 100 : 0;
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

      const decision3D = decisions3D.get(fullName) ?? null;

      // 3D revenue/sales: pra HOJE usa atribuição precisa (meta_campaign_id) do salesByCampaignByDay;
      // pra ontem/anteontem cai pro sales3DByCampaignByDay (que vem do useCampaign3DayData c/ janela
      // de 3 dias completa). Sem isso, profit3D dos dias passados zera porque useRealSales só carrega o range atual.
      const campaignDayMap = salesByCampaignByDay.get(fullName);
      const campaign3DMap = sales3DByCampaignByDay.get(fullName);
      const pickDay = (dt: string) => {
        if (dt === todayBRT) return campaignDayMap?.get(dt) ?? campaign3DMap?.get(dt);
        return campaign3DMap?.get(dt) ?? campaignDayMap?.get(dt);
      };

      const actualSales3D = dates3D.map((dt) => pickDay(dt)?.count ?? 0);

      // ─── LUCRO 3D ─────────────────────────────────────────────────────
      // Janela FIXA dos últimos 3 dias em BRT (hoje, ontem, anteontem),
      // INDEPENDENTE do filtro de data da página. Serve só pra responder:
      // "essa campanha está no azul ou vermelho nos últimos 3 dias?".
      // Fonte de dados:
      //   - spend3D: trafficByDay (RPC get_traffic_by_campaign_day, 3 dias fixos)
      //   - revenue3D: salesByCampaignByDay (HOJE, atribuição por meta_campaign_id)
      //                fallback sales3DByCampaignByDay (ontem/anteontem, por utm)
      // Match tolerante a rename: exato → startsWith → fim do nome.
      const matchSpendName = (target: string): string[] => {
        const exact = trafficByDay.filter((t) => t.campaign_name === target);
        if (exact.length > 0) return [target];
        const matches = new Set<string>();
        for (const t of trafficByDay) {
          const a = t.campaign_name;
          if (!a) continue;
          if (a.startsWith(target) || target.startsWith(a)) {
            const overlap = Math.min(a.length, target.length);
            if (overlap >= 20) matches.add(a);
          }
        }
        return Array.from(matches);
      };
      const spendNameVariants = matchSpendName(fullName);
      const spend3D = dates3D.map((dt) => {
        const dayTraffic = trafficByDay.filter(
          (t) => spendNameVariants.includes(t.campaign_name) && t.date === dt
        );
        return dayTraffic.reduce((s, t) => s + t.spend, 0);
      });
      const revenue3D = dates3D.map((dt) => pickDay(dt)?.revenue ?? 0);
      // Profit 3D BRUTO (revenue − spend). Sem deduções — análise pura de performance.
      const profit3D = dates3D.map((_, i) => revenue3D[i] - spend3D[i]);
      const profit3DTotal = profit3D.reduce((a, b) => a + b, 0);
      const spend3DTotal = spend3D.reduce((a, b) => a + b, 0);
      const revenue3DTotal = revenue3D.reduce((a, b) => a + b, 0);
      const totalSales3DCount = actualSales3D.reduce((a, b) => a + b, 0);
      const roas3DVal = spend3DTotal > 0 ? revenue3DTotal / spend3DTotal : 0;
      const roi3DVal = spend3DTotal > 0 ? ((revenue3DTotal - spend3DTotal) / spend3DTotal) * 100 : 0;
      const margin3DVal = revenue3DTotal > 0 ? ((revenue3DTotal - spend3DTotal) / revenue3DTotal) * 100 : 0;
      const cpa3DVal = totalSales3DCount > 0 ? spend3DTotal / totalSales3DCount : 0;

      const daysWithSale = actualSales3D.filter((s) => s > 0).length;
      const consistency3D = daysWithSale === 3 ? "Forte" : daysWithSale === 2 ? "Parcial" : daysWithSale === 1 ? "Fraca" : "Nenhuma";

      const accountId = trafficD?.accountId ?? statusCampaignAccountMap.get(fullName) ?? "";

      const row: GtxCampaignRow = {
        fullName,
        displayName: formatCampaignName(fullName),
        accountId,
        accountName: accountNames.get(accountId) ?? accountId.slice(-6),
        accountStatus: activeAccounts?.find(a => a.account_id === accountId)?.account_status ?? 1,
        creativeId: resolveCreativeIdWithAd(fullName),
        project: extractProjectCode(fullName),
        phase: detectStructure(fullName),
        status,
        createdDate: trafficD?.firstDate ?? "",

        budget: budgetMap.get(fullName) ?? 0,
        spend,
        impressions,
        cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
        // CTR/CPC usam inline_link_clicks (padrão da operação — mem://logic/meta-ads/cpc-standardization)
        ctr: impressions > 0 ? (linkClicks / impressions) * 100 : 0,
        clicks: linkClicks,
        cpc: linkClicks > 0 ? spend / linkClicks : 0,
        ic: 0,
        cpaPaid: salesConfirmed > 0 ? spend / salesConfirmed : 0,
        purchasesMeta: 0,

        revenue,
        roas,
        profit,
        roi,
        margin,
        salesConfirmed,

        sales3D: actualSales3D,
        profit3D,
        spend3D,
        revenue3D,
        profit3DTotal,
        spend3DTotal,
        revenue3DTotal,
        roas3D: roas3DVal,
        roi3D: roi3DVal,
        margin3D: margin3DVal,
        cpa3D: cpa3DVal,
        daysWithSale,
        consistency3D,
        scoreGtx: 0,
        decision3D,

        gtxDecision: null,
        gtxReason: null,
        gtxAction: null,

        scaleOpportunity: false,
        painIndex: 0,
        painLevel: "saudável" as const,
      };

      row.scoreGtx = computeScoreGtx(row, scoreCfg);

      // Compute modules
      const pain = computePainIndex(row, decisionCfg);
      row.painIndex = pain.painIndex;
      row.painLevel = pain.painLevel;
      row.scaleOpportunity = detectScaleOpportunity(row, decisionCfg);

      const dec = computeGtxDecision(row, decisionCfg);
      row.gtxDecision = dec.decision;
      row.gtxReason = dec.reason;
      row.gtxAction = dec.action;

      rows.push(row);
    }

    rows.sort((a, b) => b.scoreGtx - a.scoreGtx);

    return rows;
  }, [trafficData, salesDataRaw, redTrackSalesRaw, campaignStatuses, activeAccountIds, statusMap, decisions3D, accountNames, trafficByDay, salesByDay, dates3D, isToday, scoreCfg, decisionCfg]);

  const isLoading = !trafficData || !salesDataRaw || loading3D;

  return {
    campaigns,
    isLoading,
    syncNow,
    dataUpdatedAt,
    dates3D,
  };
}
