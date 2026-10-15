import { useMemo, useState, useCallback } from "react";
import { mergeAllSales } from "@/lib/salesMerge";
import { useCreativeTrafficData } from "@/hooks/useCreativeTrafficData";
import { useRealSales } from "@/hooks/useRealSales";
import { useRedTrackSales } from "@/hooks/useRedTrackSales";
import { useAccountStatuses } from "@/hooks/useAccountStatuses";
import { useCampaignStatuses } from "@/hooks/useCampaignStatuses";
import { useMetaAdStatus } from "@/hooks/useMetaAdStatus";
import { useCreative3DayPerformance } from "@/hooks/useCreative3DayPerformance";
import { useClickbankCreativeSales } from "@/hooks/useClickbankCreativeSales";
import { useRedTrackICs } from "@/hooks/useRedTrackICs";
import { useHotmartCategories } from "@/hooks/useHotmartCategories";
import { useExchangeRate } from "@/hooks/useExchangeRate";
import { useQueryClient } from "@tanstack/react-query";
import { useOperationId, useOperation } from "@/contexts/OperationContext";
import {
  resolveCreativeId,
  classifyCreative,
  generateDiagnostic,
  calculateCreativeScore,
  shouldAlertBudget,
  detectProject,
  validateCreativeIntegrity,
  isTestStructureCampaign,
  isPreScaleCampaign,
  isScaleCampaign,
  detectTeamFromCampaign,
  type CreativeRow,
  type CreativeSortKey,
} from "@/lib/creativeUtils";
import { useCreativeTeamOverrideIndex, applyTeamOverride } from "@/hooks/useCreativeTeamOverrides";
import { useOfferProjects } from "@/hooks/useOfferProjects";
import {
  extractProjectCodeFromNaming,
  getCreativeIdFromCompositeKey,
  resolveProjectCodeWithFallback,
  toCreativeCompositeKey,
} from "@/lib/projectUtils";


export type CreativeGroupBy = "creative" | "ad";

const ESCOLA_DO_DOLAR_OP = "1dd606e3-dac2-4064-b863-9784307c9e98";

interface UseCreativeDataOptions {
  search: string;
  sortBy: CreativeSortKey;
  filterAccount: string;
  filterStatus: string;
  filterProject: string;
  filterTestMode: "off" | "testing_no_sales" | "scale" | "f1";
  filterPerson: string;
  groupBy?: CreativeGroupBy;
}

function normalizeAdKey(raw: string | null | undefined): string {
  const s = String(raw ?? "").trim();
  if (!s) return "SEM_AD";
  return s.replace(/\s+/g, " ").toLowerCase();
}

function extractEscolaAdCode(...texts: (string | null | undefined)[]): string | null {
  for (const text of texts) {
    if (!text) continue;
    const match = text.match(/\[(AD\s*0*\d{1,3}|VSL\s*0*\d{1,3}|TXT\s*0*\d{1,3})\]/i);
    if (!match) continue;
    const compact = match[1].replace(/\s+/g, "").toUpperCase();
    const parts = compact.match(/^(AD|VSL|TXT)0*(\d{1,3})$/i);
    if (parts) return `${parts[1].toUpperCase()}${parts[2].padStart(2, "0")}`;
    return compact;
  }
  return null;
}

function toEscolaAdGroupId(campaignName: string | null | undefined, adName: string | null | undefined): string {
  const cid = extractEscolaAdCode(adName, campaignName) ?? resolveCreativeId(campaignName, null, adName);
  return cid !== "SEM_ID" ? `AD_CODE:${cid}` : `AD:${normalizeAdKey(adName)}`;
}

export interface DebugInfo {
  trafficRows: number;
  salesRows: number;
  salesWithId: number;
  salesWithoutId: number;
  unmatchedUtmSamples: string[];
  uniqueCreativeIds: number;
  totalSpendRawBrl: number;
  totalSpendRawUsd: number;
  totalSpendConverted: number;
}

export function useCreativeData(opts: UseCreativeDataOptions) {
  const { data: trafficData, isLoading: loadingTraffic } = useCreativeTrafficData();
  const { data: salesDataRaw, isLoading: loadingSales } = useRealSales();
  const { data: redTrackSalesRaw } = useRedTrackSales();
  const { data: accounts } = useAccountStatuses();
  const { data: campaignStatuses } = useCampaignStatuses();
  const { data: adStatuses } = useMetaAdStatus();
  const { data: cbCreativeSales } = useClickbankCreativeSales(opts.groupBy ?? "creative");
  const { data: icByCreative } = useRedTrackICs();
  const exchangeRate = useExchangeRate();
  const performance3d = useCreative3DayPerformance();
  const teamOverrideIndex = useCreativeTeamOverrideIndex();
  const opId = useOperationId();
  const { operation } = useOperation();
  // Só a Escola do Dólar usa Meta IC como fallback (não tem RedTrack).
  const allowMetaIcFallback = operation?.slug === "escola-do-dolar";
  // Garante que apelidos dinâmicos (GHP, GH-MC1, NPP-JAPA, etc.) estejam
  // registrados em TAG_TO_PROJECT ANTES da resolução de project tags abaixo.
  const { offers: dynamicOffers } = useOfferProjects();
  const queryClient = useQueryClient();
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [syncing, setSyncing] = useState(false);

  // No spend correction — use raw Meta data only, no proportional scaling

  // Build currency map from accounts
  const currencyMap = useMemo(() => {
    const map = new Map<string, string>();
    (accounts || []).forEach((a) => map.set(a.account_id, a.currency));
    return map;
  }, [accounts]);

  const activeCampaignNames = useMemo(() => {
    const set = new Set<string>();
    (campaignStatuses || []).forEach((c) => {
      if (c.effective_status === "ACTIVE") set.add(c.campaign_name);
    });
    return set;
  }, [campaignStatuses]);

  // === CAC front-end-only (Escola do Dólar) ===
  // Faturamento/ROI continuam com TODAS as vendas do criativo; o CAC usa só front.
  const isEscolaDolar = opId === ESCOLA_DO_DOLAR_OP;
  const { roleOf: hotmartRoleOf, categories: hotmartCategories } = useHotmartCategories(
    isEscolaDolar ? opId : null,
  );
  const hotmartCategoriesKey = Object.entries(hotmartCategories)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join("|");
  const isFrontSale = useCallback(
    (sale: any): boolean => {
      if (!isEscolaDolar) return true;
      // Sem categorias configuradas ainda → não trava o CAC em zero.
      if (Object.keys(hotmartCategories).length === 0) return true;
      return hotmartRoleOf(sale?.product_name, sale?.item_name ?? sale?.product) === "frontend";
    },
    [isEscolaDolar, hotmartCategories, hotmartRoleOf],
  );

  const { allCreatives, debugInfo } = useMemo(() => {
    const traffic = trafficData || [];

    // Smart merge: only exclude clickbank from sales_data for dates covered by RedTrack
    const rawSales = salesDataRaw || [];
    const sales = mergeAllSales(rawSales, redTrackSalesRaw || []);

    // Meta Ad Names mapping (via meta_ad_status)
    const adStatusMap = new Map<string, string>();
    (adStatuses || []).forEach(ad => {
      if (ad.ad_id && ad.name) adStatusMap.set(ad.ad_id, ad.name);
    });
    
    // Enrich traffic with real names if missing
    const enrichedTraffic = traffic.map(t => {
      if ((t.ad_name === "[OVERVIEW]" || !t.ad_name) && t.ad_id && adStatusMap.has(t.ad_id)) {
        return { ...t, ad_name: adStatusMap.get(t.ad_id) };
      }
      return t;
    });

    if (enrichedTraffic.length > 0 && enrichedTraffic[0].ad_name === "[OVERVIEW]") {
      console.log("[DEBUG] enrichedTraffic[0]:", enrichedTraffic[0]);
    }


    // Group traffic by creative_id — HIERARCHICAL MATCH
    const creativeMap = new Map<
      string,
      {
        adNames: Set<string>;
        accountIds: Set<string>;
        campaignNames: Set<string>;
        spend: number;
        impressions: number;
        clicks: number;
        linkClicks: number;
        plays: number;
        video3s: number;
        video25: number;
        video50: number;
        video75: number;
        video100: number;
        metaIc: number;
        spendRawUsd: number;
        spendRawBrl: number;
        hasActive: boolean;
        trafficProjectTags: Set<string>;
        hasF1: boolean;
        hasF3: boolean;
      }
    >();

    const groupBy: CreativeGroupBy = opts.groupBy ?? "creative";
    const useEscolaAdCodeGrouping = groupBy === "ad" && opId === ESCOLA_DO_DOLAR_OP;

    for (const t of enrichedTraffic) {
      // Prioridade: ad_name Real (se for [OVERVIEW], tenta campaign_name)
      const effectiveAdName = t.ad_name && t.ad_name !== "[OVERVIEW]" ? t.ad_name : null;
      
      const cid = resolveCreativeId(
        t.campaign_name, 
        null, 
        effectiveAdName, 
        null, 
        effectiveAdName // enrichedTraffic already has meta name if found
      );

      if (opId === "8707b3f8-ab41-4a63-902c-9ab97fe50c8a" && (t.ad_name === "[OVERVIEW]" || !t.ad_name)) {
         // console.log("[DEBUG] FAHTO Overview Match:", { campaign: t.campaign_name, ad: t.ad_name, resolved: cid });
      }
      
      // Campaign is MORE RELIABLE for project — use it as primary, ad_name as fallback only.
      const tProjectCode = resolveProjectCodeWithFallback(t.campaign_name, t.ad_name);
      // Chave de agrupamento: 'creative' agrega tudo com mesmo AD##; 'ad' mantém 1 linha por ad_name real.
      const groupId = groupBy === "ad"
        ? useEscolaAdCodeGrouping
          ? toEscolaAdGroupId(t.campaign_name, t.ad_name)
          : `AD:${normalizeAdKey(t.ad_name)}`
        : cid;
      const compositeKey = toCreativeCompositeKey(groupId, useEscolaAdCodeGrouping ? "OUTROS" : tProjectCode);
      if (!creativeMap.has(compositeKey)) {
        creativeMap.set(compositeKey, {
          adNames: new Set(),
          accountIds: new Set(),
          campaignNames: new Set(),
          spend: 0, impressions: 0, clicks: 0, linkClicks: 0, plays: 0,
          video3s: 0, video25: 0, video50: 0, video75: 0, video100: 0,
          metaIc: 0,
          spendRawUsd: 0, spendRawBrl: 0,
          hasActive: false,
          trafficProjectTags: new Set(),
          hasF1: false,
          hasF3: false,
        });
      }
      const g = creativeMap.get(compositeKey)!;
      g.adNames.add(t.ad_name);

      g.accountIds.add(t.account_id);
      g.campaignNames.add(t.campaign_name);

      const rawSpend = Number(t.spend);
      g.spend += rawSpend;
      const currency = currencyMap.get(t.account_id) || "BRL";
      if (currency === "USD") g.spendRawUsd += rawSpend; else g.spendRawBrl += rawSpend;

      g.impressions += Number(t.impressions);
      g.clicks += Number(t.clicks);
      g.linkClicks += Number(t.inline_link_clicks);
      g.plays += Number(t.thruplays);
      g.video3s += Number(t.video_3s_views);
      g.video25 += Number(t.video_25_percent);
      g.video50 += Number(t.video_50_percent);
      g.video75 += Number(t.video_75_percent);
      g.video100 += Number(t.video_100_percent);
      g.metaIc += Number((t as any).initiate_checkout || 0);
      if (activeCampaignNames.has(t.campaign_name)) g.hasActive = true;
      if (/\bF1\b/i.test(t.campaign_name)) g.hasF1 = true;
      if (/\bF3\b/i.test(t.campaign_name)) g.hasF3 = true;

      if (tProjectCode !== "OUTROS") g.trafficProjectTags.add(tProjectCode);
    }

    // Sales by creative_id
    // DUAL-SOURCE PRIMARY MODEL:
    // CartPanda + ClickBank are BOTH primary sources. RedTrack is fallback/double-check.
    // For each creative, we pick the source with the HIGHEST sale count
    // (the most complete tracking for that creative during the period).
    // This handles the mid-month tracking transition correctly.
    const salesByCid = new Map<string, { count: number; front: number; revenue: number; projectTags: Set<string> }>();
    let salesWithId = 0;
    let salesWithoutId = 0;
    const unmatchedSamples: string[] = [];

    // --- SOURCE 1: CartPanda (from merged sales, excluding ClickBank, RedTrack & H&W) ---
    // H&W (Health & Wellness) é plataforma SEPARADA do ClickBank/CartPanda — nunca compartilha
    // receipts, então deve SOMAR ao MAX(cb,cp,rt) em vez de competir por MAX.
    const cpByCid = new Map<string, { count: number; front: number; revenue: number; projectTags: Set<string> }>();
    const hwByCid = new Map<string, { count: number; front: number; revenue: number; projectTags: Set<string> }>();
    for (const sale of sales) {
      const isRedtrack = (sale as any)._source === "redtrack" || (sale as any).store === "redtrack";
      const isUpsell = (sale as any).event_type === "upsell";
      if (isRedtrack || isUpsell) continue;

      const cid = (sale as any).creative_id || resolveCreativeId(
        sale.utm_campaign, 
        null, 
        null, 
        (sale as any).utm_content,
        (sale as any).meta_ad_name,
        (sale as any).raw_payload?.rt_ad || (sale as any).raw_payload?.sub6_ad_name,
        (sale as any).raw_payload?.sub4
      );
      const saleProject = extractProjectCodeFromNaming(sale.utm_campaign);
      const groupId = groupBy === "ad"
        ? useEscolaAdCodeGrouping
          ? toEscolaAdGroupId(sale.utm_campaign, (sale as any).utm_content)
          : `AD:${normalizeAdKey((sale as any).utm_content)}`
        : cid;
      const compositeKey = toCreativeCompositeKey(groupId, useEscolaAdCodeGrouping ? "OUTROS" : saleProject);
      const store = String((sale as any).store || "").toLowerCase();
      const target = store === "h&w" || store === "hw" ? hwByCid : cpByCid;
      if (!target.has(compositeKey)) target.set(compositeKey, { count: 0, front: 0, revenue: 0, projectTags: new Set() });
      const d = target.get(compositeKey)!;
      d.count++;
      if (isFrontSale(sale)) d.front++;
      d.revenue += Number(sale.revenue);
      if (saleProject !== "OUTROS") d.projectTags.add(saleProject);
    }

    const cbByCid = new Map<string, { count: number; front: number; revenue: number }>();
    if (cbCreativeSales && cbCreativeSales.size > 0) {
      for (const [compositeKey, cbData] of cbCreativeSales) {
        cbByCid.set(compositeKey, { count: cbData.count, front: cbData.count, revenue: cbData.revenueBrl });
      }
    }

    const rtByCid = new Map<string, { count: number; front: number; revenue: number; projectTags: Set<string> }>();
    for (const sale of sales) {
      const isRedtrack = (sale as any)._source === "redtrack" || (sale as any).store === "redtrack";
      const isUpsell = (sale as any).event_type === "upsell";
      if (!isRedtrack || isUpsell) continue;
      const rtAd = (sale as any).raw_payload?.rt_ad || (sale as any).raw_payload?.sub6_ad_name || (sale as any).raw_payload?.ad_id;
      const rtSub4 = (sale as any).raw_payload?.sub4;
      
      const cid = (sale as any).creative_id || resolveCreativeId(
        sale.utm_campaign, 
        null, 
        null, 
        (sale as any).utm_content,
        (sale as any).meta_ad_name,
        rtAd,
        rtSub4
      );
      const saleProject = extractProjectCodeFromNaming(sale.utm_campaign);
      const groupId = groupBy === "ad"
        ? useEscolaAdCodeGrouping
          ? toEscolaAdGroupId(sale.utm_campaign, (sale as any).utm_content)
          : `AD:${normalizeAdKey((sale as any).utm_content)}`
        : cid;
      const compositeKey = toCreativeCompositeKey(groupId, useEscolaAdCodeGrouping ? "OUTROS" : saleProject);
      if (!rtByCid.has(compositeKey)) rtByCid.set(compositeKey, { count: 0, front: 0, revenue: 0, projectTags: new Set() });
      const d = rtByCid.get(compositeKey)!;
      d.count++;
      if (isFrontSale(sale)) d.front++;
      d.revenue += Number(sale.revenue);
      if (saleProject !== "OUTROS") d.projectTags.add(saleProject);
    }

    // V7: NO orphan sales merge. Sales without project tag stay as "Sem Tag" entries.

    // V10: TAG INFERENCE (key remap) — applied BEFORE dual-source MAX.
    // When the same creativeId has exactly ONE non-OUTROS project key AND
    // also a bare key (Sem Tag), remap the bare key into the project key
    // ACROSS cb/cp/rt and traffic. This way the same receipt that may live
    // in different sources under different keys (one tagged, one bare)
    // collapses into a single key, and dual-source MAX returns the correct
    // count without inflating sales.
    {
      const keysByCid = new Map<string, { bare: string | null; projects: Set<string> }>();
      const allKeys = new Set<string>([
        ...creativeMap.keys(),
        ...cbByCid.keys(),
        ...cpByCid.keys(),
        ...rtByCid.keys(),
      ]);
      for (const key of allKeys) {
        const baseId = getCreativeIdFromCompositeKey(key);
        if (baseId === "SEM_ID") continue;
        if (!keysByCid.has(baseId)) keysByCid.set(baseId, { bare: null, projects: new Set() });
        const entry = keysByCid.get(baseId)!;
        if (key.includes("::")) entry.projects.add(key);
        else entry.bare = key;
      }

      const remap = new Map<string, string>(); // bareKey → targetKey
      for (const { bare, projects } of keysByCid.values()) {
        if (!bare || projects.size !== 1) continue;
        remap.set(bare, Array.from(projects)[0]);
      }

      const remapCp = (m: Map<string, { count: number; front: number; revenue: number; projectTags: Set<string> }>) => {
        for (const [bare, target] of remap) {
          const src = m.get(bare);
          if (!src) continue;
          const dst = m.get(target);
          if (dst) {
            dst.count += src.count;
            dst.front += src.front;
            dst.revenue += src.revenue;
            for (const t of src.projectTags) dst.projectTags.add(t);
          } else {
            m.set(target, src);
          }
          m.delete(bare);
        }
      };
      const remapCb = (m: Map<string, { count: number; front: number; revenue: number }>) => {
        for (const [bare, target] of remap) {
          const src = m.get(bare);
          if (!src) continue;
          const dst = m.get(target);
          if (dst) {
            dst.count += src.count;
            dst.front += src.front;
            dst.revenue += src.revenue;
          } else {
            m.set(target, src);
          }
          m.delete(bare);
        }
      };

      remapCp(cpByCid);
      remapCp(rtByCid);
      remapCb(cbByCid);

      // Merge traffic creativeMap (full shape)
      for (const [bare, target] of remap) {
        const tSrc = creativeMap.get(bare);
        if (!tSrc) continue;
        const tDst = creativeMap.get(target);
        if (tDst) {
          for (const n of tSrc.adNames) tDst.adNames.add(n);
          for (const a of tSrc.accountIds) tDst.accountIds.add(a);
          for (const c of tSrc.campaignNames) tDst.campaignNames.add(c);
          tDst.spend += tSrc.spend;
          tDst.impressions += tSrc.impressions;
          tDst.clicks += tSrc.clicks;
          tDst.linkClicks += tSrc.linkClicks;
          tDst.plays += tSrc.plays;
          tDst.video3s += tSrc.video3s;
          tDst.video25 += tSrc.video25;
          tDst.video50 += tSrc.video50;
          tDst.video75 += tSrc.video75;
          tDst.video100 += tSrc.video100;
          tDst.metaIc += tSrc.metaIc;
          tDst.spendRawUsd += tSrc.spendRawUsd;
          tDst.spendRawBrl += tSrc.spendRawBrl;
          tDst.hasActive = tDst.hasActive || tSrc.hasActive;
          tDst.hasF1 = tDst.hasF1 || tSrc.hasF1;
          tDst.hasF3 = tDst.hasF3 || tSrc.hasF3;
          for (const t of tSrc.trafficProjectTags) tDst.trafficProjectTags.add(t);
        } else {
          creativeMap.set(target, tSrc);
        }
        creativeMap.delete(bare);
      }
    }

    // Variations are intentionally strict: H01B14, H01B14-HV01 and H01B14-HV02
    // are different creatives. Never distribute/absorb sales or spend between them.

    // --- V7: ClickBank PRIMARY, CartPanda supplement, RedTrack fallback ---
    // H&W soma por cima (plataforma independente, receipts não colidem)
    const allCids = new Set([...cbByCid.keys(), ...cpByCid.keys(), ...rtByCid.keys(), ...hwByCid.keys()]);

    for (const cid of allCids) {
      const cb = cbByCid.get(cid) || { count: 0, front: 0, revenue: 0 };
      const cp = cpByCid.get(cid) || { count: 0, front: 0, revenue: 0, projectTags: new Set<string>() };
      const rt = rtByCid.get(cid) || { count: 0, front: 0, revenue: 0, projectTags: new Set<string>() };
      const hw = hwByCid.get(cid) || { count: 0, front: 0, revenue: 0, projectTags: new Set<string>() };

      // Dual-Source MAX (mesma regra do dashboard-totals):
      // CB audit é batelado/atrasado — RT captura em tempo real. Usar prioridade
      // CB>CP>RT esconde vendas recentes que só estão em RT ainda.
      // Escolher a fonte com MAIOR contagem garante paridade com a dashboard.
      let bestCount = 0;
      let bestFront = 0;
      let bestRevenue = 0;
      let bestProjectTags = new Set<string>();

      if (cb.count >= bestCount) {
        bestCount = cb.count;
        bestFront = cb.front;
        bestRevenue = cb.revenue;
      }
      if (cp.count > bestCount) {
        bestCount = cp.count;
        bestFront = cp.front;
        bestRevenue = cp.revenue;
        bestProjectTags = cp.projectTags;
      }
      if (rt.count > bestCount) {
        bestCount = rt.count;
        bestFront = rt.front;
        bestRevenue = rt.revenue;
        bestProjectTags = rt.projectTags;
      }

      // H&W é plataforma separada — sempre soma por cima
      bestCount += hw.count;
      bestFront += hw.front;
      bestRevenue += hw.revenue;
      for (const t of hw.projectTags) bestProjectTags.add(t);


      if (cid === "SEM_ID" || cid.startsWith("SEM_ID::")) {
        salesWithoutId += bestCount;
        for (const sale of sales) {
          const sid = resolveCreativeId(sale.utm_campaign, null, null, (sale as any).utm_content);
          if (sid === "SEM_ID") {
            const sample = sale.utm_campaign || sale.utm_content || sale.utm_source || "(vazio)";
            if (unmatchedSamples.length < 10 && !unmatchedSamples.includes(sample)) {
              unmatchedSamples.push(sample);
            }
          }
        }
      } else {
        salesWithId += bestCount;
      }

      salesByCid.set(cid, { count: bestCount, front: bestFront, revenue: bestRevenue, projectTags: bestProjectTags });
    }

    // Also create entries for sales-only creative IDs not in traffic
    for (const [compositeKey] of salesByCid) {
      const creativeId = getCreativeIdFromCompositeKey(compositeKey);
      if (creativeId !== "SEM_ID" && !creativeMap.has(compositeKey)) {
        creativeMap.set(compositeKey, {
          adNames: new Set(),
          accountIds: new Set(),
          campaignNames: new Set(),
          spend: 0, impressions: 0, clicks: 0, linkClicks: 0, plays: 0,
          video3s: 0, video25: 0, video50: 0, video75: 0, video100: 0,
          metaIc: 0,
          spendRawUsd: 0, spendRawBrl: 0,
          hasActive: false,
          trafficProjectTags: new Set(),
          hasF1: false,
          hasF3: false,
        });
      }
    }

    // STEP 2: Calculate metrics AFTER summing
    const rows: CreativeRow[] = Array.from(creativeMap.entries()).map(([compositeKey, d]) => {
      const rawCreativeId = getCreativeIdFromCompositeKey(compositeKey);
      
      if (rawCreativeId === "SEM_ID") {
         // Debug point for SEM_ID
         // console.log("[DEBUG] SEM_ID entry:", { compositeKey, adNames: Array.from(d.adNames) });
      }

      // Em modo 'ad', a chave é AD:<ad_name_normalizado> — usar o ad_name real como label.
      let creativeId = rawCreativeId;
      if (rawCreativeId.startsWith("AD:") || rawCreativeId.startsWith("AD_CODE:")) {
        const firstAd = Array.from(d.adNames)[0] || "SEM_AD";
        // Se o ad_name tem [AD##] no início, mantém o label bonitinho; senão usa ad_name inteiro.
        creativeId = firstAd !== "SEM_AD" ? firstAd : rawCreativeId.replace(/^AD_CODE:/, "");
      }
      const sd = salesByCid.get(compositeKey) || { count: 0, front: 0, revenue: 0, projectTags: new Set<string>() };

      // Weighted calculations from sums (NEVER average percentages)
      const effectiveClicks = d.linkClicks > 0 ? d.linkClicks : d.clicks;
      const ctr = d.impressions > 0 ? (effectiveClicks / d.impressions) * 100 : 0;
      const cpm = d.impressions > 0 ? (d.spend / d.impressions) * 1000 : 0;
      const cpc = effectiveClicks > 0 ? d.spend / effectiveClicks : 0;

      // Hook Rate: video_3s_views / impressions (fórmula padrão)
      const isVideo = d.video3s > 0 || d.plays > 0 || d.video25 > 0 || d.video50 > 0 || d.video75 > 0 || d.video100 > 0;
      const rawHookRate = d.impressions > 0 ? (d.video3s / d.impressions) * 100 : 0;
      const hookRate = isVideo ? Math.min(rawHookRate, 100) : 0;

      // Hook sanity check — recalibrado após fix de ingestão (video_3s real, faixa saudável 20-45%)
      let hookSanity: "ok" | "inflated" | "no_data" | "low_volume" = "ok";
      if (!isVideo && d.impressions > 0) {
        hookSanity = "no_data";
      } else if (d.impressions < 100 && d.impressions > 0) {
        hookSanity = "low_volume";
      } else if (d.impressions > 0 && rawHookRate > 60) {
        hookSanity = "inflated";
      }


      const holdRate = d.video3s > 0 ? (d.plays / d.video3s) * 100 : 0;
      const roi = d.spend > 0 ? sd.revenue / d.spend : 0;
      const profit = sd.revenue - d.spend;
      const conversionRate = effectiveClicks > 0 ? sd.count / effectiveClicks : 0;
      const rpm = d.impressions > 0 ? sd.revenue / (d.impressions / 1000) : 0;
      const avgTicket = sd.count > 0 ? sd.revenue / sd.count : 0;

      // V2 Advanced Metrics
      const costPer3sView = d.video3s > 0 ? d.spend / d.video3s : 0;
      const costPerPitch = d.video25 > 0 ? d.spend / d.video25 : 0;
      const conversionPostPitch = d.video25 > 0 ? sd.count / d.video25 : 0;
      const profitPer1000 = d.impressions > 0 ? profit / (d.impressions / 1000) : 0;

      // V3 Intelligence — V6: use composite key for 3D lookup
      const data3d = performance3d.get(compositeKey) || null;
      const creativeScore = calculateCreativeScore(roi, hookRate, holdRate, conversionRate);
      const budgetAlert = shouldAlertBudget(d.spend, roi, hookRate);

      const tier = classifyCreative(roi, hookRate, d.impressions, data3d, isVideo);
      const diagnostic = generateDiagnostic({ hookRate, holdRate, ctr, roi, conversionRate, impressions: d.impressions });

      // V8: Try all campaign names to find project tag, not just the first one
      const allCampaigns = Array.from(d.campaignNames);
      const firstCampaignName = allCampaigns[0] || "";
      const project = detectProject(creativeId, allCampaigns.join(" "), compositeKey);

      // V4 Integrity validation
      const integrity = validateCreativeIntegrity(
        creativeId,
        d.campaignNames,
        sd.projectTags,
        d.trafficProjectTags,
        d.impressions,
        d.video3s,
        d.spend,
        sd.count,
      );

      // Detect campaign structure
      const campaignNamesArr = Array.from(d.campaignNames);
      const isTestStructure = campaignNamesArr.some(isTestStructureCampaign);
      const isPreScaleStructure = campaignNamesArr.some(isPreScaleCampaign);
      const isScaleStructure = campaignNamesArr.some(isScaleCampaign);

      // V5 Team identification (with manual overrides applied on top)
      const detectedTeam = detectTeamFromCampaign(d.campaignNames, d.adNames, creativeId);
      const { copyWriter, editor } = applyTeamOverride(detectedTeam, creativeId, d.campaignNames, teamOverrideIndex);

      // V6 IC metrics — RedTrack é a fonte primária. O fallback pro Meta
      // Initiate Checkout só vale na Escola do Dólar (não usa RedTrack).
      // Nas demais operações (GTX etc.) o IC é 100% RedTrack.
      const rtIc = icByCreative?.get(compositeKey) || icByCreative?.get(creativeId) || 0;
      const metaIc = allowMetaIcFallback ? Math.round(d.metaIc || 0) : 0;
      const icCount = rtIc > 0 ? rtIc : metaIc;
      const icSource: "redtrack" | "meta" | "none" =
        rtIc > 0 ? "redtrack" : metaIc > 0 ? "meta" : "none";

      const costPerIc = icCount > 0 ? d.spend / icCount : 0;
      const checkoutConvRate = icCount > 0 ? (sd.count / icCount) * 100 : 0;
      // CAC = custo por VENDA FRONT-END. Faturamento/ROI seguem com todas as vendas.
      const frontSales = sd.front;
      const cac = frontSales > 0 ? d.spend / frontSales : 0;

      return {
        creativeId,
        project,
        adNames: Array.from(d.adNames),
        accountIds: d.accountIds,
        campaignNames: d.campaignNames,
        spend: d.spend,
        impressions: d.impressions,
        clicks: d.clicks,
        ctr, cpc, cpm,
        video3sViews: d.video3s,
        video25: d.video25,
        video50: d.video50,
        video75: d.video75,
        video100: d.video100,
        hookRate, holdRate, isVideo, hookSanity,
        sales: sd.count,
        frontSales,
        revenue: sd.revenue,
        avgTicket,
        roi, profit,
        conversionRate, rpm,
        costPer3sView, costPerPitch, conversionPostPitch, profitPer1000,
        creativeScore, budgetAlert,
        tier, diagnostic,
        integrity,
        isTestStructure,
        isScaleStructure,
        isF1: d.hasF1,
        isF3: d.hasF3,
        copyWriter,
        editor,
        icCount,
        icSource,
        costPerIc,
        checkoutConvRate,
        cac,
      };
    });

    // Aggregate spend debug info
    let totalSpendRawBrl = 0, totalSpendRawUsd = 0, totalSpendConverted = 0;
    for (const [, d] of creativeMap) {
      totalSpendRawBrl += d.spendRawBrl;
      totalSpendRawUsd += d.spendRawUsd;
      totalSpendConverted += d.spend;
    }

    const debug: DebugInfo = {
      trafficRows: enrichedTraffic.length,
      salesRows: sales.length,
      salesWithId,
      salesWithoutId,
      unmatchedUtmSamples: unmatchedSamples,
      uniqueCreativeIds: creativeMap.size,
      totalSpendRawBrl,
      totalSpendRawUsd,
      totalSpendConverted,
    };

    console.log('CREATIVE ROWS:', rows.map(r => ({ creative_id: r.creativeId, name: r.creativeId, spend: r.spend, sales: r.sales })));
    return { allCreatives: rows, debugInfo: debug };
  }, [trafficData, salesDataRaw, redTrackSalesRaw, adStatuses, activeCampaignNames, currencyMap, performance3d, cbCreativeSales, icByCreative, exchangeRate, teamOverrideIndex, dynamicOffers, opts.groupBy, opId, isFrontSale, hotmartCategoriesKey]);


  // Apply filters
  const filtered = useMemo(() => {
    let data = allCreatives;

    // Só exibe criativos com nomenclatura padrão Meta ([AD##]/[VSL##]/[TXT##] ou H##B##).
    // Anúncios de outros canais (stories orgânico, promoções sem tag, etc.) ficam fora
    // da Creative Intelligence — eles poluem a tabela e não têm como ser cruzados.
    // Adicionamos padrões FAHTO/EDD: VTPAD, EDBAD, e códigos genéricos de AD que tenham H1, H2, etc.
    // Adicionamos padrões FAHTO/EDD: VTPAD, EDBAD, codes genéricos AD##H##, e permitimos IDs numéricos curtos (RedTrack)
    const TAG_RE = /\[(AD|VSL|TXT)\s*0*\d{1,3}\]|H\d{1,3}B\d{1,3}|VTPAD\d+|EDBAD\d+|AD\d+H\d+|\b[A-Z0-9]{8,12}\b/i;
    data = data.filter((c) => {
      if (TAG_RE.test(c.creativeId)) return true;
      const adArr: string[] = Array.isArray(c.adNames) ? c.adNames : Array.from(c.adNames as Set<string>);
      if (adArr.some((n) => TAG_RE.test(n))) return true;
      const campArr: string[] = Array.isArray(c.campaignNames) ? c.campaignNames : Array.from(c.campaignNames as Set<string>);
      if (campArr.some((n) => TAG_RE.test(n))) return true;
      return false;
    });



    if (opts.search) {
      const q = opts.search.toLowerCase();
      data = data.filter(
        (c) =>
          c.creativeId.toLowerCase().includes(q) ||
          c.adNames.some((n) => n.toLowerCase().includes(q)),
      );
    }

    if (opts.filterAccount !== "all") {
      data = data.filter((c) => c.accountIds.has(opts.filterAccount));
    }

    if (opts.filterStatus === "active") {
      data = data.filter((c) => {
        for (const cn of c.campaignNames) {
          if (activeCampaignNames.has(cn)) return true;
        }
        return false;
      });
    } else if (opts.filterStatus === "paused") {
      data = data.filter((c) => {
        for (const cn of c.campaignNames) {
          if (activeCampaignNames.has(cn)) return false;
        }
        return true;
      });
    }

    if (opts.filterProject && opts.filterProject !== "all") {
      data = data.filter((c) => c.project.tag === opts.filterProject);
    }

    // Person filter
    if (opts.filterPerson && opts.filterPerson !== "all") {
      data = data.filter((c) => c.copyWriter === opts.filterPerson || c.editor === opts.filterPerson);
    }

    // Structure-based filters
    if (opts.filterTestMode === "testing_no_sales") {
      data = data.filter((c) => c.sales === 0 && c.spend > 0);
    } else if (opts.filterTestMode === "scale") {
      data = data.filter((c) => c.isScaleStructure);
    } else if (opts.filterTestMode === "f1") {
      data = data.filter((c) => c.isF1);
    }

    // Default sort by Creative Score
    return data.sort((a, b) => {
      const av = a[opts.sortBy] ?? 0;
      const bv = b[opts.sortBy] ?? 0;
      return (bv as number) - (av as number);
    });
  }, [allCreatives, opts, activeCampaignNames]);

  const syncNow = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-campaign-status`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        },
      );
      if (res.ok) {
        await queryClient.invalidateQueries({ queryKey: ["traffic-data"] });
        await queryClient.invalidateQueries({ queryKey: ["real-sales"] });
        await queryClient.invalidateQueries({ queryKey: ["campaign-statuses"] });
        await queryClient.invalidateQueries({ queryKey: ["account-statuses"] });
        setLastSync(new Date());
      }
    } finally {
      setSyncing(false);
    }
  }, [queryClient]);

  const uniqueAccounts = useMemo(() => {
    const map = new Map<string, string>();
    (accounts || []).forEach((a) => map.set(a.account_id, a.account_name));
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [accounts]);

  // Integrity summary
  const integritySummary = useMemo(() => {
    const issues = allCreatives.filter((c) => c.integrity.status !== "ok");
    const crossProject = allCreatives.filter((c) => c.integrity.status === "cross_project_conflict");
    const unreliableHook = allCreatives.filter((c) => !c.integrity.hookRateReliable && c.impressions > 0);
    const testCreatives = allCreatives.filter((c) => c.isTestStructure && c.spend > 0);
    const testNoSales = allCreatives.filter((c) => c.sales === 0 && c.spend > 0);
    
    const scale = allCreatives.filter((c) => c.isScaleStructure);
    const f1Count = allCreatives.filter((c) => c.isF1).length;
    return { issueCount: issues.length, crossProjectCount: crossProject.length, unreliableHookCount: unreliableHook.length, testNoSalesCount: testNoSales.length, scaleCount: scale.length, f1Count, f3Count: allCreatives.filter((c) => c.isF3).length };
  }, [allCreatives]);

  // Unique people (copywriters + editors)
  const uniquePeople = useMemo(() => {
    const map = new Map<string, Set<string>>();
    allCreatives.forEach((c) => {
      if (c.copyWriter) {
        if (!map.has(c.copyWriter)) map.set(c.copyWriter, new Set());
        map.get(c.copyWriter)!.add("Copy");
      }
      if (c.editor) {
        if (!map.has(c.editor)) map.set(c.editor, new Set());
        map.get(c.editor)!.add("Editor");
      }
    });
    return Array.from(map.entries())
      .map(([name, roles]) => ({ name, roles: Array.from(roles) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allCreatives]);

  return {
    creatives: filtered,
    allCount: allCreatives.length,
    isLoading: loadingTraffic || loadingSales,
    lastSync,
    syncing,
    syncNow,
    uniqueAccounts,
    debugInfo,
    integritySummary,
    uniquePeople,
  };
}
