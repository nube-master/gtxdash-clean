import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useOperationId } from "@/contexts/OperationContext";
import { supabase } from "@/integrations/supabase/client";
import { useRealSales } from "@/hooks/useRealSales";
import { useRedTrackSales } from "@/hooks/useRedTrackSales";
import { mergeAllSales } from "@/lib/salesMerge";
import { resolveCreativeId } from "@/lib/creativeUtils";
import { extractProjectCodeFromNaming, resolveProjectCodeWithFallback } from "@/lib/projectUtils";

interface CbDailySaleRow {
  date: string;
  campaign_name: string;
  revenue_brl: number;
  receipt: string;
}

async function fetchCbDailyCreativeSales(
  start: string,
  end: string,
  operationId: string | null | undefined,
): Promise<CbDailySaleRow[]> {
  const PAGE = 1000;
  let all: any[] = [];
  let from = 0;
  let hasMore = true;
  const params: any = { p_start_date: start, p_end_date: end };
  if (operationId) params.p_operation_id = operationId;

  while (hasMore) {
    const { data, error } = await supabase
      .rpc("get_cb_creative_sales_daily" as any, params)
      .range(from, from + PAGE - 1);
    if (error) {
      console.warn("[useCreativeLifecycle] CB RPC error:", error.message);
      return [];
    }
    const rows = (data as any[]) || [];
    all = all.concat(rows);
    hasMore = rows.length === PAGE;
    from += PAGE;
  }
  return all.map((r) => ({
    date: r.date,
    campaign_name: r.campaign_name,
    revenue_brl: Number(r.revenue_brl) || 0,
    receipt: r.receipt,
  }));
}

export interface LifecycleDayPoint {
  date: string;
  spend: number;
  revenue: number;
  sales: number;
  clicks: number;
  impressions: number;
  inlineLinkClicks: number;
  roas: number;
  ctr: number;
  cpc: number;
  profit: number;
  cpa: number;
}

export interface LifecycleWeekBucket {
  weekIndex: number;
  startDate: string;
  endDate: string;
  days: number;
  spend: number;
  revenue: number;
  sales: number;
  profit: number;
  roas: number;
  cpa: number;
  ctr: number;
  cpc: number;
}

export interface LifecycleDeclineInsight {
  reason: string;
  roasDropPct: number;     // queda % do ROAS médio dos últimos 3d vs pico
  cpaChangePct: number;    // variação % do CPA médio dos últimos 3d vs pico
  profitDelta: number;     // variação absoluta de lucro/dia (R$)
  scaleAvgSpend: number;   // gasto médio diário considerado escala
  recentRoas: number;
  peakRoas: number;
}

export interface LifecycleAnalysis {
  series: LifecycleDayPoint[];
  peakIdx: number | null;
  declineStartIdx: number | null;
  ageDays: number;
  hasEnoughData: boolean;
  weekly: LifecycleWeekBucket[];
  declineInsight: LifecycleDeclineInsight | null;
  scaleRoasThreshold: number;
}

const SCALE_ROAS_THRESHOLD = 1.30;

interface UseCreativeLifecycleInput {
  creativeId: string | null;
  enabled: boolean;
  adNames?: string[];
  campaignNames?: string[];
  projectCode?: string | null;
}

const EMPTY_ANALYSIS: LifecycleAnalysis = {
  series: [],
  peakIdx: null,
  declineStartIdx: null,
  ageDays: 0,
  hasEnoughData: false,
  weekly: [],
  declineInsight: null,
  scaleRoasThreshold: SCALE_ROAS_THRESHOLD,
};


async function fetchCreativeLifecycleTraffic({
  start,
  end,
  creativeId,
  projectCode,
  operationId,
}: {
  start: string;
  end: string;
  creativeId: string;
  projectCode?: string | null;
  operationId?: string | null;
}) {
  // Query traffic_data directly grouped by date.
  // The previous RPC (get_creative_traffic_normalized_sp) aggregates the WHOLE
  // period in a single row per (campaign, ad) and has NO `date` column, which
  // silently zeroed out the lifecycle curve (every traffic row was discarded
  // by the `typeof traffic.date !== "string"` guard downstream).
  const PAGE_SIZE = 1000;
  let from = 0;
  let hasMore = true;
  const allRows: any[] = [];

  while (hasMore) {
    let query = supabase
      .from("traffic_data")
      .select("date, campaign_name, ad_name, spend:spend_brl, clicks, impressions, inline_link_clicks")
      .gte("date", start)
      .lte("date", end)
      .range(from, from + PAGE_SIZE - 1);

    if (operationId) query = query.eq("operation_id", operationId);

    const { data, error } = await query;
    if (error) throw error;
    const rows = (data as any[]) || [];
    allRows.push(...rows);
    hasMore = rows.length === PAGE_SIZE;
    from += PAGE_SIZE;
  }

  // Strict creative match — narrow client-side.
  const filtered = allRows.filter((row: any) => {
    if (
      resolveCreativeId(row.campaign_name) !== creativeId &&
      resolveCreativeId(row.ad_name) !== creativeId
    )
      return false;

    if (projectCode && projectCode !== "OUTROS") {
      const rowProject = resolveProjectCodeWithFallback(row.campaign_name, row.ad_name);
      if (rowProject !== projectCode) return false;
    }
    return true;
  });

  // Aggregate by date (same creative can run across multiple ads/accounts/day).
  const byDate = new Map<string, any>();
  for (const r of filtered) {
    const key = String(r.date);
    if (!byDate.has(key)) {
      byDate.set(key, {
        date: key,
        campaign_name: r.campaign_name,
        ad_name: r.ad_name,
        spend: 0,
        clicks: 0,
        impressions: 0,
        inline_link_clicks: 0,
      });
    }
    const acc = byDate.get(key)!;
    acc.spend += Number(r.spend) || 0;
    acc.clicks += Number(r.clicks) || 0;
    acc.impressions += Number(r.impressions) || 0;
    acc.inline_link_clicks += Number(r.inline_link_clicks) || 0;
  }

  return Array.from(byDate.values());
}

function buildLifecycleAnalysis(trafficRows: any[], salesRows: any[]): LifecycleAnalysis {
  const byDay = new Map<string, LifecycleDayPoint>();

  const ensureDay = (date: string) => {
    if (!byDay.has(date)) {
      byDay.set(date, {
        date,
        spend: 0,
        revenue: 0,
        sales: 0,
        clicks: 0,
        impressions: 0,
        inlineLinkClicks: 0,
        roas: 0,
        ctr: 0,
        cpc: 0,
        profit: 0,
        cpa: 0,
      });
    }
    return byDay.get(date)!;
  };

  for (const traffic of trafficRows) {
    if (typeof traffic.date !== "string") continue;
    const point = ensureDay(traffic.date);
    point.spend += Number(traffic.spend) || 0;
    point.clicks += Number(traffic.clicks) || 0;
    point.impressions += Number(traffic.impressions) || 0;
    point.inlineLinkClicks += Number(traffic.inline_link_clicks) || 0;
  }

  for (const sale of salesRows) {
    if (typeof sale.date !== "string") continue;
    const point = ensureDay(sale.date);
    point.revenue += Number(sale.revenue) || 0;
    if (sale.event_type !== "upsell") point.sales += 1;
  }

  const series = Array.from(byDay.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((point) => {
      const effectiveClicks = point.inlineLinkClicks > 0 ? point.inlineLinkClicks : point.clicks;
      return {
        ...point,
        roas: point.spend > 0 ? point.revenue / point.spend : 0,
        ctr: point.impressions > 0 ? (effectiveClicks / point.impressions) * 100 : 0,
        cpc: effectiveClicks > 0 ? point.spend / effectiveClicks : 0,
        profit: point.revenue - point.spend,
        cpa: point.sales > 0 ? point.spend / point.sales : 0,
      };
    });

  // ============================================================
  // Detecção de PICO de performance em escala
  // ============================================================
  const spendsSorted = series
    .map((point) => point.spend)
    .filter((value) => value > 0)
    .sort((a, b) => a - b);
  const medianSpend = spendsSorted.length ? spendsSorted[Math.floor(spendsSorted.length / 2)] : 0;
  const scaleMinSpend = medianSpend * 0.5;

  let peakIdx: number | null = null;
  let peakRoas = 0;
  series.forEach((point, index) => {
    if (point.spend >= scaleMinSpend && point.roas > peakRoas) {
      peakRoas = point.roas;
      peakIdx = index;
    }
  });

  // ============================================================
  // Detecção de QUEDA EM ESCALA — ROAS sustentado < 1.30
  // ============================================================
  let declineStartIdx: number | null = null;
  if (peakIdx !== null && series.length - peakIdx >= 4) {
    for (let index = peakIdx + 1; index <= series.length - 3; index += 1) {
      const window = series.slice(index, index + 3);
      const allInScale = window.every((point) => point.spend >= scaleMinSpend);
      if (!allInScale) continue;
      const avgRoas = window.reduce((sum, point) => sum + point.roas, 0) / window.length;
      const sustainedUnhealthy = window.every(
        (point) => point.roas > 0 && point.roas < SCALE_ROAS_THRESHOLD,
      );
      if (avgRoas < SCALE_ROAS_THRESHOLD && sustainedUnhealthy) {
        declineStartIdx = index;
        break;
      }
    }
  }

  // ============================================================
  // Insight automático para anotação no marcador de queda
  // ============================================================
  let declineInsight: LifecycleDeclineInsight | null = null;
  if (declineStartIdx !== null && peakIdx !== null) {
    const recent = series.slice(-Math.min(3, series.length));
    const peak = series[peakIdx];
    const recentRoas = recent.reduce((sum, p) => sum + p.roas, 0) / recent.length;
    const recentCpa = recent.reduce((sum, p) => sum + p.cpa, 0) / recent.length;
    const recentProfit = recent.reduce((sum, p) => sum + p.profit, 0) / recent.length;
    const recentSpend = recent.reduce((sum, p) => sum + p.spend, 0) / recent.length;
    const roasDropPct = peak.roas > 0 ? ((recentRoas - peak.roas) / peak.roas) * 100 : 0;
    const cpaChangePct = peak.cpa > 0 ? ((recentCpa - peak.cpa) / peak.cpa) * 100 : 0;
    const profitDelta = recentProfit - peak.profit;
    declineInsight = {
      reason:
        `ROAS médio dos últimos ${recent.length}d caiu para ${recentRoas.toFixed(2)}x ` +
        `(abaixo do limite saudável de ${SCALE_ROAS_THRESHOLD.toFixed(2)}x em escala). ` +
        `Queda de ${Math.abs(roasDropPct).toFixed(0)}% vs pico` +
        (cpaChangePct > 5 ? ` e CPA subiu ${cpaChangePct.toFixed(0)}%` : "") +
        (profitDelta < 0 ? `, lucro/dia caiu ${fmtBRLShort(Math.abs(profitDelta))}` : "") +
        ".",
      roasDropPct,
      cpaChangePct,
      profitDelta,
      scaleAvgSpend: recentSpend,
      recentRoas,
      peakRoas: peak.roas,
    };
  }

  // ============================================================
  // Buckets semanais (semana 1, 2, 3...) a partir do 1º dia da série
  // ============================================================
  const weekly: LifecycleWeekBucket[] = [];
  if (series.length) {
    const first = new Date(`${series[0].date}T00:00:00`);
    const buckets = new Map<number, LifecycleDayPoint[]>();
    for (const point of series) {
      const d = new Date(`${point.date}T00:00:00`);
      const diffDays = Math.floor((d.getTime() - first.getTime()) / 86_400_000);
      const wIdx = Math.floor(diffDays / 7);
      if (!buckets.has(wIdx)) buckets.set(wIdx, []);
      buckets.get(wIdx)!.push(point);
    }
    Array.from(buckets.entries())
      .sort((a, b) => a[0] - b[0])
      .forEach(([weekIndex, points]) => {
        const spend = points.reduce((s, p) => s + p.spend, 0);
        const revenue = points.reduce((s, p) => s + p.revenue, 0);
        const sales = points.reduce((s, p) => s + p.sales, 0);
        const impressions = points.reduce((s, p) => s + p.impressions, 0);
        const clicks = points.reduce(
          (s, p) => s + (p.inlineLinkClicks > 0 ? p.inlineLinkClicks : p.clicks),
          0,
        );
        weekly.push({
          weekIndex: weekIndex + 1,
          startDate: points[0].date,
          endDate: points[points.length - 1].date,
          days: points.length,
          spend,
          revenue,
          sales,
          profit: revenue - spend,
          roas: spend > 0 ? revenue / spend : 0,
          cpa: sales > 0 ? spend / sales : 0,
          ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
          cpc: clicks > 0 ? spend / clicks : 0,
        });
      });
  }

  return {
    series,
    peakIdx,
    declineStartIdx,
    ageDays: series.length,
    hasEnoughData: series.length >= 2,
    weekly,
    declineInsight,
    scaleRoasThreshold: SCALE_ROAS_THRESHOLD,
  };
}

function fmtBRLShort(v: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(v);
}

export function useCreativeLifecycle({ creativeId, enabled, projectCode }: UseCreativeLifecycleInput) {
  const { dateRange } = useDateRange();
  const [start, end] = dateRange;
  const operationId = useOperationId();
  const realSalesQuery = useRealSales();
  const redTrackSalesQuery = useRedTrackSales();
  // Note: adNames/campaignNames from the input are intentionally ignored for
  // the traffic query — they reflect the *current* period's aggregation and
  // would zero out spend when the user switches to a previous period in which
  // the creative ran in different campaigns. Filtering is done by creativeId.

  const trafficQuery = useQuery({
    queryKey: [
      "creative-lifecycle-traffic",
      "v5-daily-from-traffic-data", // bump: RPC sem coluna `date` zerava o gasto da curva
      start,
      end,
      operationId,
      creativeId,
      projectCode || "OUTROS",
    ],
    enabled: enabled && !!creativeId,
    queryFn: () =>
      fetchCreativeLifecycleTraffic({
        start,
        end,
        creativeId: creativeId!,
        projectCode,
        operationId,
      }),
    staleTime: 5 * 60_000, // 5 min — curve doesn't need to refetch on every drawer open
    gcTime: 15 * 60_000,    // keep cached even after drawer closes
  });

  // ClickBank daily sales — primary revenue source for IMG-style creatives.
  // RedTrack often reports CB purchases with amount=0; CB audit (aff_sub2 → campaign_id)
  // is the authoritative path for per-day revenue and sale count attribution.
  const cbDailyQuery = useQuery({
    queryKey: ["creative-lifecycle-cb-daily", start, end, operationId],
    enabled: enabled && !!creativeId,
    queryFn: () => fetchCbDailyCreativeSales(start, end, operationId),
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
  });

  const data = useMemo(() => {
    if (!enabled || !creativeId) return EMPTY_ANALYSIS;

    // 1) Filter CB daily sales (authoritative for ClickBank revenue)
    const cbSales = (cbDailyQuery.data || [])
      .filter((row) => {
        if (resolveCreativeId(row.campaign_name) !== creativeId) return false;
        if (projectCode && projectCode !== "OUTROS") {
          const rowProject = extractProjectCodeFromNaming(row.campaign_name);
          if (rowProject !== projectCode) return false;
        }
        return true;
      })
      .map((row) => ({
        date: row.date,
        revenue: row.revenue_brl,
        status: "approved",
        event_type: "purchase" as const,
        _receipt: row.receipt,
      }));
    const cbReceipts = new Set(cbSales.map((s) => s._receipt).filter(Boolean));

    // 2) Add CartPanda + RedTrack sales for this creative — but skip rows whose
    //    receipt was already counted via CB audit (avoids double counting).
    const mergedSales = mergeAllSales(realSalesQuery.data || [], redTrackSalesQuery.data || []);
    const otherSales = mergedSales.filter((row: any) => {
      if (row.status !== "approved") return false;
      if (row.store === "clickbank_ref") return false;
      if (resolveCreativeId(row.utm_campaign) !== creativeId) return false;

      if (projectCode && projectCode !== "OUTROS") {
        const rowProject = extractProjectCodeFromNaming(row.utm_campaign);
        if (rowProject !== projectCode) return false;
      }

      // Dedup vs CB audit: skip if receipt/order already in cbReceipts
      const receipt = String(row.order_id || row.id || "").toUpperCase();
      if (receipt && cbReceipts.has(receipt)) return false;
      return true;
    });

    return buildLifecycleAnalysis(trafficQuery.data || [], [...cbSales, ...otherSales]);
  }, [
    enabled,
    creativeId,
    projectCode,
    trafficQuery.data,
    cbDailyQuery.data,
    realSalesQuery.data,
    redTrackSalesQuery.data,
  ]);

  return {
    ...data,
    isLoading: enabled && !!creativeId && (trafficQuery.isLoading || cbDailyQuery.isLoading),
  };
}