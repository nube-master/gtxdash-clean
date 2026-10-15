import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDateRange } from "@/contexts/DateRangeContext";
import { resolveCreativeIdWithAd } from "@/lib/creativeUtils";
import { extractStructure, extractProjectCode } from "@/lib/projectUtils";
import { getClickbankExcludeDates, getRedTrackExcludeDates } from "@/lib/salesMerge";
export type StructurePhase = "TESTE" | "PRE_ESCALA" | "ESCALA" | "OUTROS";

// ─── Types ──────────────────────────────────────────────────────────────

export type RecentCampaignStatus = "ACELERANDO" | "EM_VALIDACAO" | "SEM_TRACAO" | "ALTO_GASTO_SEM_VENDA";
export type RecentCreativeLabel = "PROMISSOR" | "EM_TESTE" | "FRACO";

export interface RecentCampaign {
  campaignName: string;
  phase: StructurePhase;
  project: string;
  accountId: string;
  lifetimeHours: number;
  spend: number;
  sales: number;
  revenue: number;
  profit: number;
  roas: number;
  ctr: number;
  cpa: number;
  cpc: number;
  hookRate: number;
  status: RecentCampaignStatus;
  firstSpendDate: string;
  launchDate: string | null;
}

export interface RecentCreative {
  creativeId: string;
  project: string;
  activeCampaigns: number;
  spend: number;
  sales: number;
  revenue: number;
  profit: number;
  roas: number;
  ctr: number;
  cpa: number;
  cpc: number;
  hookRate: number;
  scoreInitial: number;
  label: RecentCreativeLabel;
  firstSaleWithin24h: boolean;
  firstImpressionDate: string;
}

// ─── Date extraction from campaign name ─────────────────────────────────

function extractLaunchDateFromName(campaignName: string): string | null {
  const patterns = [
    /\[(\d{1,2})[./](\d{1,2})\]/,
    /(?:^|\s|_|-|·)(\d{1,2})[./](\d{1,2})(?:\s|_|-|·|$)/,
  ];

  for (const pattern of patterns) {
    const match = campaignName.match(pattern);
    if (match) {
      const day = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        const year = new Date().getFullYear();
        const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const parsed = new Date(dateStr + "T12:00:00");
        if (!isNaN(parsed.getTime())) return dateStr;
      }
    }
  }
  return null;
}

// ─── Date helpers ───────────────────────────────────────────────────────

function getAllDatesInRange(start: string, end: string): string[] {
  const endDate = new Date(end + "T12:00:00");
  const startDate = new Date(start + "T12:00:00");
  const dates: string[] = [];
  const current = new Date(endDate);
  while (current >= startDate) {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(current);
    dates.push(fmt);
    current.setDate(current.getDate() - 1);
  }
  return dates;
}

// ─── Hook ───────────────────────────────────────────────────────────────

export function useRecentLaunches() {
  const { dateRange } = useDateRange();
  const [rangeStart, rangeEnd] = dateRange;

  // All dates within the selected range
  const dates = getAllDatesInRange(rangeStart, rangeEnd);
  const sortedDates = [...dates].sort();
  const startDate = sortedDates[0];
  const endDate = sortedDates[sortedDates.length - 1];
  const now = new Date();

  const query = useQuery({
    queryKey: ["recent-launches", rangeStart, rangeEnd],
    queryFn: async () => {
      // ── Paginated fetch helper ─────────────────────────
      async function fetchAll<T>(table: string, select: string, filters: (q: any) => any): Promise<T[]> {
        const PAGE = 1000;
        let all: T[] = [];
        let from = 0;
        let hasMore = true;
        while (hasMore) {
          let q = supabase.from(table as any).select(select).range(from, from + PAGE - 1);
          q = filters(q);
          const { data, error } = await q;
          if (error) throw error;
          all = all.concat((data ?? []) as T[]);
          hasMore = (data?.length ?? 0) === PAGE;
          from += PAGE;
        }
        return all;
      }

      // Fetch traffic in window — PAGINATED
      const traffic = await fetchAll<any>(
        "traffic_data",
        "campaign_name, ad_name, account_id, date, spend, clicks, impressions, ctr, cpc, video_3s_views, created_at",
        (q: any) => q.gte("date", startDate).lte("date", endDate),
      );

      // Fetch sales — PAGINATED
      const salesData = await fetchAll<any>(
        "sales_data",
        "utm_campaign, date, revenue, status, store, order_id, created_at",
        (q: any) => q.gte("date", startDate).lte("date", endDate).eq("status", "approved"),
      );

      // Fetch RedTrack — PAGINATED
      const rtData = await fetchAll<any>(
        "redtrack_events",
        "utm_campaign, occurred_at, amount, event_type",
        (q: any) => q.gte("occurred_at", `${startDate}T00:00:00`).lte("occurred_at", `${endDate}T23:59:59`).eq("event_type", "purchase"),
      );

      const fmtBR = (d: Date) =>
        new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

      const rtWithDates = (rtData ?? []).map((row: any) => ({
        ...row,
        date: fmtBR(new Date(row.occurred_at)),
        revenue: Number(row.amount || 0),
      }));

      const excludeCBDates = getClickbankExcludeDates(salesData ?? [], rtWithDates);
      const excludeRTDates = getRedTrackExcludeDates(salesData ?? [], rtWithDates);

      // ─── Build sales by creative ID ────────────────────────────────
      const salesByCreativeId = new Map<string, { count: number; revenue: number; firstSaleDate: string }>();

      for (const row of salesData ?? []) {
        const utm = row.utm_campaign ?? "";
        if (!utm) continue;
        const isClickbank = row.store === "clickbank" || ((row as any).order_id || "").toLowerCase().includes("clickbank");
        if (isClickbank && excludeCBDates.has(row.date)) continue;
        const cid = resolveCreativeIdWithAd(utm);
        if (cid === "SEM_ID") continue;
        const existing = salesByCreativeId.get(cid) ?? { count: 0, revenue: 0, firstSaleDate: row.date };
        existing.count++;
        existing.revenue += row.revenue ?? 0;
        if (row.date < existing.firstSaleDate) existing.firstSaleDate = row.date;
        salesByCreativeId.set(cid, existing);
      }

      for (const row of rtWithDates) {
        if (excludeRTDates.has(row.date)) continue;
        const utm = row.utm_campaign ?? "";
        if (!utm) continue;
        const cid = resolveCreativeIdWithAd(utm);
        if (cid === "SEM_ID") continue;
        const existing = salesByCreativeId.get(cid) ?? { count: 0, revenue: 0, firstSaleDate: row.date };
        existing.count++;
        existing.revenue += Number(row.amount ?? 0);
        if (row.date < existing.firstSaleDate) existing.firstSaleDate = row.date;
        salesByCreativeId.set(cid, existing);
      }

      // Build campaign-level metrics
      const campMap = new Map<string, {
        accountId: string;
        project: string;
        phase: StructurePhase;
        creativeId: string;
        spend: number;
        clicks: number;
        impressions: number;
        video3sViews: number;
        sales: number;
        revenue: number;
        firstSpendDate: string;
        firstSaleDate: string | null;
        firstImpressionDate: string;
        dates: Set<string>;
      }>();

      for (const row of traffic ?? []) {
        const name = row.campaign_name;
        if (!name) continue;
        const cid = resolveCreativeIdWithAd(name, row.ad_name);
        const existing = campMap.get(name) ?? {
          accountId: row.account_id,
          project: extractProjectCode(name),
          phase: extractStructure(name) as StructurePhase,
          creativeId: cid,
          spend: 0, clicks: 0, impressions: 0, video3sViews: 0, sales: 0, revenue: 0,
          firstSpendDate: row.date,
          firstSaleDate: null,
          firstImpressionDate: row.date,
          dates: new Set(),
        };
        existing.spend += Number(row.spend || 0);
        existing.clicks += Number(row.clicks || 0);
        existing.impressions += Number(row.impressions || 0);
        existing.video3sViews += Number(row.video_3s_views || 0);
        if (row.date < existing.firstSpendDate) existing.firstSpendDate = row.date;
        if (row.date < existing.firstImpressionDate) existing.firstImpressionDate = row.date;
        existing.dates.add(row.date);
        campMap.set(name, existing);
      }

      // Distribute sales to campaigns by creative ID
      const campsByCreative = new Map<string, string[]>();
      for (const [name, camp] of campMap) {
        if (camp.creativeId === "SEM_ID") continue;
        const list = campsByCreative.get(camp.creativeId) ?? [];
        list.push(name);
        campsByCreative.set(camp.creativeId, list);
      }

      for (const [cid, salesInfo] of salesByCreativeId) {
        const campaignNames = campsByCreative.get(cid);
        if (!campaignNames || campaignNames.length === 0) continue;

        const totalSpend = campaignNames.reduce((s, n) => s + (campMap.get(n)?.spend ?? 0), 0);
        
        for (const name of campaignNames) {
          const camp = campMap.get(name)!;
          const weight = totalSpend > 0 ? camp.spend / totalSpend : 1 / campaignNames.length;
          camp.sales += Math.round(salesInfo.count * weight);
          camp.revenue += salesInfo.revenue * weight;
          camp.firstSaleDate = salesInfo.firstSaleDate;
        }
      }

      // Average CTR for comparison
      let totalClicksAll = 0, totalImpsAll = 0;
      for (const camp of campMap.values()) {
        totalClicksAll += camp.clicks;
        totalImpsAll += camp.impressions;
      }
      const avgCtrAll = totalImpsAll > 0 ? (totalClicksAll / totalImpsAll) * 100 : 0;

      // CPA goal
      const { data: planningData } = await supabase
        .from("planning_goals")
        .select("cpa_goal")
        .order("created_at", { ascending: false })
        .limit(1);
      const cpaGoal = planningData?.[0]?.cpa_goal ?? 100;

      // ─── Only campaigns with known structure (1-50-1 / 1-100-1 / 1-250-1) ──
      const recentCampaigns: RecentCampaign[] = [];
      const recentCampaignNames = new Set<string>();

      for (const [name, camp] of campMap) {
        if (camp.spend <= 0) continue;
        // Skip campaigns without a recognized structure phase
        if (camp.phase === "OUTROS") continue;

        const roas = camp.spend > 0 ? camp.revenue / camp.spend : 0;
        const ctr = camp.impressions > 0 ? (camp.clicks / camp.impressions) * 100 : 0;
        const profit = camp.revenue - camp.spend;
        const cpa = camp.sales > 0 ? camp.spend / camp.sales : 0;
        const cpc = camp.clicks > 0 ? camp.spend / camp.clicks : 0;
        const hookRate = camp.impressions > 0 ? (camp.video3sViews / camp.impressions) * 100 : 0;
        const lifetimeMs = now.getTime() - new Date(camp.firstSpendDate + "T00:00:00-03:00").getTime();
        const lifetimeHours = Math.max(1, Math.round(lifetimeMs / 3600000));

        const launchDate = extractLaunchDateFromName(name);

        // Smart status
        let status: RecentCampaignStatus;
        if (camp.sales >= 2 && roas > 1.3) {
          status = "ACELERANDO";
        } else if (camp.sales >= 1) {
          status = "EM_VALIDACAO";
        } else if (camp.spend > cpaGoal && camp.sales === 0) {
          status = "ALTO_GASTO_SEM_VENDA";
        } else {
          status = ctr < avgCtrAll ? "SEM_TRACAO" : "EM_VALIDACAO";
        }

        recentCampaigns.push({
          campaignName: name,
          phase: camp.phase,
          project: camp.project,
          accountId: camp.accountId,
          lifetimeHours,
          spend: camp.spend,
          sales: camp.sales,
          revenue: camp.revenue,
          profit,
          roas,
          ctr,
          cpa,
          cpc,
          hookRate,
          status,
          firstSpendDate: camp.firstSpendDate,
          launchDate,
        });
        recentCampaignNames.add(name);
      }

      // Sort
      const statusOrder: Record<RecentCampaignStatus, number> = { ACELERANDO: 0, EM_VALIDACAO: 1, ALTO_GASTO_SEM_VENDA: 2, SEM_TRACAO: 3 };
      recentCampaigns.sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || b.roas - a.roas);

      // ─── Criativos ────────────────────────────────────────────────
      const creativeMap = new Map<string, {
        project: string;
        campaigns: Set<string>;
        spend: number;
        clicks: number;
        impressions: number;
        video3sViews: number;
        sales: number;
        revenue: number;
        firstImpressionDate: string;
      }>();

      for (const [campName, camp] of campMap) {
        const creativeId = resolveCreativeIdWithAd(campName);
        if (creativeId === "SEM_ID") continue;

        const existing = creativeMap.get(creativeId) ?? {
          project: camp.project,
          campaigns: new Set(),
          spend: 0, clicks: 0, impressions: 0, video3sViews: 0, sales: 0, revenue: 0,
          firstImpressionDate: camp.firstImpressionDate,
        };
        existing.campaigns.add(campName);
        existing.spend += camp.spend;
        existing.clicks += camp.clicks;
        existing.impressions += camp.impressions;
        existing.video3sViews += camp.video3sViews;
        existing.sales += camp.sales;
        existing.revenue += camp.revenue;
        if (camp.firstImpressionDate < existing.firstImpressionDate) {
          existing.firstImpressionDate = camp.firstImpressionDate;
        }
        creativeMap.set(creativeId, existing);
      }

      const recentCreatives: RecentCreative[] = [];
      for (const [id, entry] of creativeMap) {
        if (entry.spend <= 0) continue;
        const ctr = entry.impressions > 0 ? (entry.clicks / entry.impressions) * 100 : 0;
        const roas = entry.spend > 0 ? entry.revenue / entry.spend : 0;
        const profit = entry.revenue - entry.spend;
        const cpa = entry.sales > 0 ? entry.spend / entry.sales : 0;
        const cpc = entry.clicks > 0 ? entry.spend / entry.clicks : 0;
        const hookRate = entry.impressions > 0 ? (entry.video3sViews / entry.impressions) * 100 : 0;

        // Score initial
        let score = 0;
        if (entry.sales > 0) score += 1;
        if (roas > 1.5) score += 1;
        if (ctr > avgCtrAll) score += 1;
        if (entry.spend > cpaGoal && entry.sales === 0) score -= 1;

        let label: RecentCreativeLabel;
        if (score >= 2) label = "PROMISSOR";
        else if (score >= 0) label = "EM_TESTE";
        else label = "FRACO";

        recentCreatives.push({
          creativeId: id,
          project: entry.project,
          activeCampaigns: entry.campaigns.size,
          spend: entry.spend,
          sales: entry.sales,
          revenue: entry.revenue,
          profit,
          roas,
          ctr,
          cpa,
          cpc,
          hookRate,
          scoreInitial: score,
          label,
          firstSaleWithin24h: entry.sales > 0,
          firstImpressionDate: entry.firstImpressionDate,
        });
      }

      recentCreatives.sort((a, b) => b.scoreInitial - a.scoreInitial || b.roas - a.roas);

      return {
        recentCampaigns,
        recentCreatives,
        avgCtr: avgCtrAll,
        cpaGoal,
        periodStart: startDate,
        periodEnd: endDate,
      };
    },
    staleTime: 60_000,
  });

  return {
    campaigns: query.data?.recentCampaigns ?? [],
    creatives: query.data?.recentCreatives ?? [],
    avgCtr: query.data?.avgCtr ?? 0,
    cpaGoal: query.data?.cpaGoal ?? 100,
    periodStart: query.data?.periodStart ?? startDate,
    periodEnd: query.data?.periodEnd ?? endDate,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
