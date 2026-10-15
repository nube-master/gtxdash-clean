/**
 * Hook: Creative Weekly Report
 * Gera o panorama semanal de criativos para reunião de criação.
 * 1-50-1 = TESTE | 1-100-1 = PRÉ-ESCALA (validado) | 1-250-1 = ESCALA
 */
import { useMemo } from "react";
import { useCampaignStatuses } from "@/hooks/useCampaignStatuses";
import { resolveCreativeId } from "@/lib/creativeUtils";
import type { CreativeRow } from "@/lib/creativeUtils";

/** Extrai data DD.MM do nome da campanha, ex: [19.02] */
function extractCampaignDate(name: string): string | null {
  const m = name.match(/\[(\d{2}\.\d{2})\]/);
  return m ? m[1] : null;
}

/** Detecta estrutura de campanha */
function detectStructure(name: string): "1-50-1" | "1-100-1" | "1-250-1" | null {
  if (name.includes("1-50-1")) return "1-50-1";
  if (name.includes("1-100-1")) return "1-100-1";
  if (name.includes("1-250-1")) return "1-250-1";
  return null;
}

function toDate(str: string): Date {
  return new Date(str);
}

export interface WeeklyCreativeSummary {
  creativeId: string;
  launchedAt: Date;
  structure: "1-50-1" | "1-100-1" | "1-250-1" | null;
  isActive: boolean;
  campaignCount: number;
  campaignDateTag: string | null;
  spend: number;
  revenue: number;
  sales: number;
  roi: number;
  hookRate: number;
  holdRate: number;
  creativeScore: number;
  tier: string;
  diagnostic: string;
}

export interface WeeklyReportData {
  /** Testes lançados dentro do período selecionado (1-50-1) */
  testLaunchedInPeriod: WeeklyCreativeSummary[];
  /** Criativos em teste ATIVOS hoje (1-50-1 + effective_status ACTIVE) */
  testActiveToday: WeeklyCreativeSummary[];
  /** Criativos validados (passaram para 1-100-1) dentro do período */
  validatedInPeriod: WeeklyCreativeSummary[];
  /** Criativos em escala (1-250-1) ativos */
  inScale: WeeklyCreativeSummary[];
  /** Total de IDs únicos testados ALL TIME (1-50-1, independente de período) */
  allTimeUniqueTestIds: Set<string>;
  /** IDs únicos no período selecionado */
  periodUniqueTestIds: Set<string>;
}

export function useCreativeWeeklyReport(
  creatives: CreativeRow[],
  /** Cutoff date — apenas campanhas APÓS esta data entram em testLaunchedInPeriod. null = sem corte (all-time) */
  cutoff: Date | null,
): WeeklyReportData {
  const { data: campaignStatuses } = useCampaignStatuses();

  const perfMap = useMemo(() => {
    const m = new Map<string, CreativeRow>();
    for (const c of creatives) m.set(c.creativeId, c);
    return m;
  }, [creatives]);

  return useMemo(() => {
    const campaigns = campaignStatuses || [];

    type CampaignEntry = {
      creativeId: string;
      structure: "1-50-1" | "1-100-1" | "1-250-1" | null;
      launchedAt: Date;
      isActive: boolean;
      campaignCount: number;
      campaignDateTag: string | null;
    };

    const byCreativeStructure = new Map<string, CampaignEntry>();

    for (const c of campaigns) {
      const creativeId = resolveCreativeId(c.campaign_name);
      if (creativeId === "SEM_ID") continue;

      const structure = detectStructure(c.campaign_name);
      if (!structure) continue;

      const key = `${creativeId}__${structure}`;
      const launchedAt = toDate((c as any).created_at ?? c.updated_at);
      const isActive = c.effective_status === "ACTIVE";
      const campaignDateTag = extractCampaignDate(c.campaign_name);

      if (!byCreativeStructure.has(key)) {
        byCreativeStructure.set(key, {
          creativeId, structure, launchedAt, isActive,
          campaignCount: 1, campaignDateTag,
        });
      } else {
        const existing = byCreativeStructure.get(key)!;
        existing.campaignCount++;
        if (launchedAt < existing.launchedAt) existing.launchedAt = launchedAt;
        if (isActive) existing.isActive = true;
        if (!existing.campaignDateTag && campaignDateTag) existing.campaignDateTag = campaignDateTag;
      }
    }

    const buildSummary = (entry: CampaignEntry): WeeklyCreativeSummary => {
      const perf = perfMap.get(entry.creativeId);
      return {
        ...entry,
        spend: perf?.spend ?? 0,
        revenue: perf?.revenue ?? 0,
        sales: perf?.sales ?? 0,
        roi: perf?.roi ?? 0,
        hookRate: perf?.hookRate ?? 0,
        holdRate: perf?.holdRate ?? 0,
        creativeScore: perf?.creativeScore ?? 0,
        tier: perf?.tier.tier ?? "TESTE",
        diagnostic: perf?.diagnostic ?? "—",
      };
    };

    const allEntries = Array.from(byCreativeStructure.values());

    // All-time unique test IDs (1-50-1, sem corte de data)
    const allTimeUniqueTestIds = new Set(
      allEntries.filter((e) => e.structure === "1-50-1").map((e) => e.creativeId)
    );

    // Testes lançados no período selecionado
    const testLaunchedInPeriod = allEntries
      .filter((e) => e.structure === "1-50-1" && (cutoff === null || e.launchedAt >= cutoff))
      .map(buildSummary)
      .sort((a, b) => b.launchedAt.getTime() - a.launchedAt.getTime());

    // Testes ativos hoje
    const testActiveToday = allEntries
      .filter((e) => e.structure === "1-50-1" && e.isActive)
      .map(buildSummary)
      .sort((a, b) => b.creativeScore - a.creativeScore);

    // Validados (1-100-1) no período selecionado
    const validatedInPeriod = allEntries
      .filter((e) => e.structure === "1-100-1" && (cutoff === null || e.launchedAt >= cutoff))
      .map(buildSummary)
      .sort((a, b) => b.roi - a.roi);

    // Em escala
    const inScale = allEntries
      .filter((e) => e.structure === "1-250-1" && e.isActive)
      .map(buildSummary)
      .sort((a, b) => b.roi - a.roi);

    const periodUniqueTestIds = new Set(testLaunchedInPeriod.map((e) => e.creativeId));

    return {
      testLaunchedInPeriod,
      testActiveToday,
      validatedInPeriod,
      inScale,
      allTimeUniqueTestIds,
      periodUniqueTestIds,
    };
  }, [campaignStatuses, cutoff, perfMap]);
}
