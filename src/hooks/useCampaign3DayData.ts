import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getClickbankExcludeDates, getRedTrackExcludeDates } from "@/lib/salesMerge";
import { useExchangeRate } from "@/hooks/useExchangeRate";
import { buildReceiptAmountMap, resolveRedtrackRevenueBrl } from "@/lib/redtrackRevenue";

export interface CampaignDayRow {
  campaign_name: string;
  date: string;
  spend: number;
  clicks: number;
  impressions: number;
}

export interface SalesDay {
  campaign: string;
  date: string;
  count: number;
  revenue: number;
}

/** Strip zero-width spaces and other invisible chars that break string comparison */
function cleanCampaignName(name: string): string {
  return name.replace(/[\u200B\u200C\u200D\uFEFF\u00A0]/g, "").trim();
}

export function useCampaign3DayData() {
  const usdToBrl = useExchangeRate();
  const now = new Date();
  const dates: string[] = [];
  for (let i = 0; i < 3; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dates.push(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d));
  }

  const trafficQuery = useQuery({
    queryKey: ["campaign-3day-traffic", dates[0]],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_traffic_by_campaign_day", {
        p_start_date: dates[dates.length - 1],
        p_end_date: dates[0],
      });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        campaign_name: r.campaign_name,
        date: r.date,
        spend: Number(r.spend),
        clicks: Number(r.clicks),
        impressions: Number(r.impressions),
      })) as CampaignDayRow[];
    },
    staleTime: 60_000,
  });

  const salesQuery = useQuery({
    queryKey: ["campaign-3day-sales-merged", dates[0], usdToBrl],
    queryFn: async () => {
      const [cartpandaResult, redtrackResult, clickbankAuditResult] = await Promise.all([
        supabase
          .from("sales_data")
          .select("utm_campaign, date, revenue, status, store, order_id")
          .gte("date", dates[dates.length - 1])
          .lte("date", dates[0])
          .eq("status", "approved"),
        supabase
          .from("redtrack_events")
          .select("utm_campaign, occurred_at, amount, currency, event_type, raw_payload")
          .gte("occurred_at", `${dates[dates.length - 1]}T00:00:00`)
          .lte("occurred_at", `${dates[0]}T23:59:59`)
          .eq("event_type", "purchase"),
        supabase
          .from("clickbank_audit")
          .select("receipt, amount_brl")
          .gte("date", dates[dates.length - 1])
          .lte("date", dates[0])
          .eq("transaction_type", "SALE")
          .gte("amount_usd", 200)
          .lte("amount_usd", 260),
      ]);

      if (cartpandaResult.error) throw cartpandaResult.error;
      if (redtrackResult.error) throw redtrackResult.error;
      if (clickbankAuditResult.error) throw clickbankAuditResult.error;

      const receiptAmountMap = buildReceiptAmountMap(clickbankAuditResult.data as any[]);

      // Build RedTrack purchases with dates for comparison
      const rtWithDates = (redtrackResult.data ?? []).map((row: any) => {
        const amountBrl = resolveRedtrackRevenueBrl(row, usdToBrl, receiptAmountMap);
        return {
          ...row,
          date: new Intl.DateTimeFormat("en-CA", {
            timeZone: "America/Sao_Paulo",
            year: "numeric", month: "2-digit", day: "2-digit",
          }).format(new Date(row.occurred_at)),
          revenue: amountBrl,
          amount: amountBrl,
        };
      });

      // Determine which source wins per date
      const excludeCBDates = getClickbankExcludeDates(cartpandaResult.data ?? [], rtWithDates);
      const excludeRTDates = getRedTrackExcludeDates(cartpandaResult.data ?? [], rtWithDates);

      // DEDUP: CartPanda is primary source of truth.
      // For each campaign+date combo, only add RedTrack sales that exceed CP count.
      const map = new Map<string, SalesDay>();

      // 1) CartPanda sales (primary) — exclude clickbank entries
      const cpCountByKey = new Map<string, number>();
      for (const row of cartpandaResult.data ?? []) {
        const utm = row.utm_campaign ?? "";
        if (!utm) continue;
        const isClickbank = row.store === "clickbank" ||
          ((row as any).order_id || "").toLowerCase().includes("clickbank");
        if (isClickbank && excludeCBDates.has(row.date)) continue;

        const key = `${utm}||${row.date}`;
        const existing = map.get(key);
        if (existing) {
          existing.count++;
          existing.revenue += row.revenue ?? 0;
        } else {
          map.set(key, { campaign: utm, date: row.date, count: 1, revenue: row.revenue ?? 0 });
        }
        // Track CP count per campaign+date for dedup
        const dedupKey = `${utm.toLowerCase()}||${row.date}`;
        cpCountByKey.set(dedupKey, (cpCountByKey.get(dedupKey) || 0) + 1);
      }

      // 2) RedTrack purchase events — only add EXCESS beyond CP count (backup)
      const rtUsed = new Map<string, number>();
      for (const row of rtWithDates) {
        if (excludeRTDates.has(row.date)) continue;
        const utm = row.utm_campaign ?? "";
        if (!utm) continue;

        const dedupKey = `${utm.toLowerCase()}||${row.date}`;
        const cpCount = cpCountByKey.get(dedupKey) || 0;
        const usedSoFar = rtUsed.get(dedupKey) || 0;
        rtUsed.set(dedupKey, usedSoFar + 1);

        // Skip this RT sale if CP already covers it
        if (usedSoFar + 1 <= cpCount) continue;

        const key = `${utm}||${row.date}`;
        const existing = map.get(key);
        if (existing) {
          existing.count++;
          existing.revenue += Number(row.amount ?? 0);
        } else {
          map.set(key, { campaign: utm, date: row.date, count: 1, revenue: Number(row.amount ?? 0) });
        }
      }

      return Array.from(map.values());
    },
    staleTime: 60_000,
  });

  return {
    trafficByDay: trafficQuery.data ?? [],
    salesByDay: salesQuery.data ?? [],
    dates,
    isLoading: trafficQuery.isLoading || salesQuery.isLoading,
  };
}

export interface CampaignDecision {
  campaignName: string;
  score: "Escalar" | "Manter" | "Observar" | "Cortar";
  reason: string;
  avgRoas: number;
  totalSpend: number;
  totalRevenue: number;
  totalSales: number;
  dailyRoas: number[];
  daysActive: number;
  daysSinceLastSale: number;
}

export function classifyCampaigns(
  trafficByDay: CampaignDayRow[],
  salesByDay: SalesDay[],
  dates: string[]
): CampaignDecision[] {
  // Group traffic by campaign (clean names)
  const campaignMap = new Map<string, Map<string, { spend: number; clicks: number; impressions: number }>>();
  // Map cleaned name -> original name
  const cleanToOriginal = new Map<string, string>();

  for (const row of trafficByDay) {
    const cleaned = cleanCampaignName(row.campaign_name);
    if (!cleanToOriginal.has(cleaned)) cleanToOriginal.set(cleaned, row.campaign_name);

    if (!campaignMap.has(cleaned)) campaignMap.set(cleaned, new Map());
    const dateMap = campaignMap.get(cleaned)!;
    const existing = dateMap.get(row.date);
    if (existing) {
      existing.spend += row.spend;
      existing.clicks += row.clicks;
      existing.impressions += row.impressions;
    } else {
      dateMap.set(row.date, { spend: row.spend, clicks: row.clicks, impressions: row.impressions });
    }
  }

  // Build sorted list of cleaned campaign names for matching
  const cleanedCampNames = Array.from(campaignMap.keys());

  // Longest common prefix + suffix length (in chars). Tolera renomeação
  // no meio do nome (ex: trocar [1-250-1] por [E-LUCRO] no Meta hoje
  // enquanto traffic_data ainda tem o nome antigo e utm veio com o novo).
  const commonAffixLen = (a: string, b: string): number => {
    let p = 0;
    const max = Math.min(a.length, b.length);
    while (p < max && a.charCodeAt(p) === b.charCodeAt(p)) p++;
    let s = 0;
    while (
      s < max - p &&
      a.charCodeAt(a.length - 1 - s) === b.charCodeAt(b.length - 1 - s)
    )
      s++;
    return p + s;
  };

  // Group sales by campaign + date using fuzzy matching
  const salesMap = new Map<string, Map<string, { count: number; revenue: number }>>();
  for (const row of salesByDay) {
    // Extract name before pipe (for sales_data format "name|id")
    const utmRaw = row.campaign.split("|")[0];
    const utmClean = cleanCampaignName(utmRaw);
    if (!utmClean) continue;

    // Find matching traffic campaign
    let matchedCamp: string | null = null;

    // 1) Exact match
    if (campaignMap.has(utmClean)) {
      matchedCamp = utmClean;
    } else {
      // 2) startsWith match (sufixos pequenos tipo " - T1 top")
      for (const campClean of cleanedCampNames) {
        if (utmClean.startsWith(campClean) || campClean.startsWith(utmClean)) {
          matchedCamp = campClean;
          break;
        }
      }

      // 3) Prefix+suffix overlap fallback — tolera 1 tag renomeada no meio.
      //    Exige ≥80% do nome mais curto sobreposto e ≥40 chars absolutos
      //    para evitar falso-positivo entre campanhas distintas.
      if (!matchedCamp) {
        let bestCamp: string | null = null;
        let bestScore = 0;
        for (const campClean of cleanedCampNames) {
          const overlap = commonAffixLen(utmClean, campClean);
          const minLen = Math.min(utmClean.length, campClean.length);
          if (overlap >= 40 && overlap / minLen >= 0.8 && overlap > bestScore) {
            bestScore = overlap;
            bestCamp = campClean;
          }
        }
        matchedCamp = bestCamp;
      }
    }

    if (!matchedCamp) continue;

    if (!salesMap.has(matchedCamp)) salesMap.set(matchedCamp, new Map());
    const dateMap = salesMap.get(matchedCamp)!;
    const existing = dateMap.get(row.date);
    if (existing) {
      existing.count += row.count;
      existing.revenue += row.revenue;
    } else {
      dateMap.set(row.date, { count: row.count, revenue: row.revenue });
    }
  }

  const results: CampaignDecision[] = [];
  const sortedDates = [...dates].sort();

  for (const [cleanedName, dateMap] of campaignMap) {
    const totalSpend = Array.from(dateMap.values()).reduce((s, d) => s + d.spend, 0);
    if (totalSpend <= 0) continue;

    const salesDateMap = salesMap.get(cleanedName) ?? new Map();
    const totalRevenue = Array.from(salesDateMap.values()).reduce((s, d) => s + d.revenue, 0);
    const totalSales = Array.from(salesDateMap.values()).reduce((s, d) => s + d.count, 0);
    const avgRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

    const dailyRoas = sortedDates.map((dt) => {
      const spend = dateMap.get(dt)?.spend ?? 0;
      const rev = salesDateMap.get(dt)?.revenue ?? 0;
      return spend > 0 ? rev / spend : 0;
    });

    const daysActive = sortedDates.filter((dt) => (dateMap.get(dt)?.spend ?? 0) > 0).length;

    let daysSinceLastSale = 99;
    for (let i = sortedDates.length - 1; i >= 0; i--) {
      const sales = salesDateMap.get(sortedDates[i])?.count ?? 0;
      if (sales > 0) {
        daysSinceLastSale = sortedDates.length - 1 - i;
        break;
      }
    }

    // Classification
    let score: CampaignDecision["score"];
    let reason: string;

    const activeDailyRoas = sortedDates
      .map((dt, i) => ({ spend: dateMap.get(dt)?.spend ?? 0, roas: dailyRoas[i] }))
      .filter((d) => d.spend > 0);
    const allDaysAbove15 = activeDailyRoas.length >= 2 && activeDailyRoas.every((d) => d.roas >= 1.5);

    if (allDaysAbove15 && totalSales >= 2) {
      score = "Escalar";
      reason = `ROI ≥ 1.5x constante (${activeDailyRoas.map((d) => d.roas.toFixed(1) + "x").join(", ")})`;
    } else if (avgRoas >= 1.0 && totalSales > 0) {
      score = "Manter";
      reason = `Lucrativa no período (${avgRoas.toFixed(1)}x ROI, ${totalSales} vendas)`;
    } else if (totalSales > 0 && daysSinceLastSale >= 2) {
      score = "Observar";
      reason = `Vendeu mas sem vendas há ${daysSinceLastSale} dias`;
    } else if (totalSales > 0 && avgRoas < 1.0 && avgRoas > 0) {
      score = "Observar";
      reason = `ROI ${avgRoas.toFixed(1)}x — perdendo margem`;
    } else if (daysActive >= 2 && totalSales === 0 && totalSpend > 30) {
      score = "Cortar";
      reason = `R$ ${totalSpend.toFixed(0)} investido em ${daysActive} dias sem vendas`;
    } else if (activeDailyRoas.length >= 2 && activeDailyRoas.every((d) => d.roas < 0.5)) {
      score = "Cortar";
      reason = `Negativa em ${activeDailyRoas.length} dias consecutivos`;
    } else if (totalSales === 0 && totalSpend > 50) {
      score = "Cortar";
      reason = `Gasto R$ ${totalSpend.toFixed(0)} sem conversões`;
    } else {
      score = "Observar";
      reason = totalSales === 0 ? `Sem vendas — aguardando dados` : `Dados insuficientes para decisão`;
    }

    // Use original name for display
    const displayName = cleanToOriginal.get(cleanedName) ?? cleanedName;

    results.push({
      campaignName: displayName,
      score,
      reason,
      avgRoas,
      totalSpend,
      totalRevenue,
      totalSales,
      dailyRoas,
      daysActive,
      daysSinceLastSale,
    });
  }

  const order = { Escalar: 0, Manter: 1, Observar: 2, Cortar: 3 };
  results.sort((a, b) => {
    const o = order[a.score] - order[b.score];
    if (o !== 0) return o;
    return b.avgRoas - a.avgRoas;
  });

  return results;
}
