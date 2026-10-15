import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useMobilePerformance, activePolling } from "@/hooks/useMobilePerformance";
import { useOperationId } from "@/contexts/OperationContext";

async function fetchRedTrackEvents(start: string, end: string, opId?: string | null) {
  const PAGE_SIZE = 1000;
  let allData: any[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from("redtrack_events")
      .select("*")
      .gte("occurred_at", `${start}T03:00:00Z`)
      .lt("occurred_at", `${end}T03:00:00Z`); // This was missing the +1 day logic in some calls
    
    if (opId) query = query.eq("operation_id", opId);
    
    const { data, error } = await query
      .order("occurred_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.warn("[useRedTrackData] Query error:", error.message);
      return [];
    }

    allData = allData.concat(data || []);
    hasMore = (data?.length || 0) === PAGE_SIZE;
    from += PAGE_SIZE;
  }

  return allData;
}


export function useRedTrackData() {
  const { dateRange } = useDateRange();
  const [start, end] = dateRange;
  const perf = useMobilePerformance();
  const opId = useOperationId();

  const endPlusOne = (() => {
    const d = new Date(end + "T12:00:00");
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  })();

  return useQuery({
    queryKey: ["redtrack-events", start, end, opId],
    queryFn: () => fetchRedTrackEvents(start, endPlusOne, opId),
    refetchInterval: activePolling(perf.primaryPollingMs, perf.isTabActive),
    staleTime: perf.staleTimeMs,
  });
}

export function useRedTrackMetrics() {
  const { data: events = [], isLoading } = useRedTrackData();

  const allConversions = events.filter((e: any) => e.event_type === "purchase" || e.event_type === "upsell");
  const purchases = events.filter((e: any) => e.event_type === "purchase");
  const upsells = events.filter((e: any) => e.event_type === "upsell");
  const ics = events.filter((e: any) => e.event_type === "initiate_checkout");
  const vslViews = events.filter((e: any) => e.event_type === "vsl_view").length;
  const presellViews = events.filter((e: any) => e.event_type === "presell_view").length;

  const totalRevenue = allConversions.reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0);
  const frontRevenue = purchases.reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0);
  const totalSales = purchases.length;
  const upsellCount = upsells.length;
  const totalICs = ics.length;
  const paidSales = purchases.filter((e: any) => Number(e.amount || 0) > 0);
  const ticketMedio = paidSales.length > 0 ? frontRevenue / paidSales.length : 0;
  const icToSaleRate = totalICs > 0 ? (totalSales / totalICs) * 100 : 0;

  const lastSale = purchases.length > 0
    ? new Date(purchases[0].occurred_at)
    : null;
  const lastSaleMinutes = lastSale
    ? Math.round((Date.now() - lastSale.getTime()) / 60000)
    : null;

  const now = Date.now();
  const salesLast10 = purchases.filter((e: any) => now - new Date(e.occurred_at).getTime() < 10 * 60000).length;
  const salesLast30 = purchases.filter((e: any) => now - new Date(e.occurred_at).getTime() < 30 * 60000).length;
  const salesLast60 = purchases.filter((e: any) => now - new Date(e.occurred_at).getTime() < 60 * 60000).length;

  const byCampaign = new Map<string, { revenue: number; sales: number; ics: number }>();
  for (const e of events) {
    const key = e.utm_campaign || "(sem campanha)";
    if (!byCampaign.has(key)) byCampaign.set(key, { revenue: 0, sales: 0, ics: 0 });
    const entry = byCampaign.get(key)!;
    if (e.event_type === "purchase") {
      entry.revenue += Number(e.amount || 0);
      entry.sales++;
    } else if (e.event_type === "initiate_checkout") {
      entry.ics++;
    }
  }

  const byCreative = new Map<string, { revenue: number; sales: number; ics: number }>();
  for (const e of events) {
    const key = e.utm_content || "(sem criativo)";
    if (!byCreative.has(key)) byCreative.set(key, { revenue: 0, sales: 0, ics: 0 });
    const entry = byCreative.get(key)!;
    if (e.event_type === "purchase") {
      entry.revenue += Number(e.amount || 0);
      entry.sales++;
    } else if (e.event_type === "initiate_checkout") {
      entry.ics++;
    }
  }

  return {
    events,
    isLoading,
    totalRevenue,
    frontRevenue,
    totalSales,
    upsellCount,
    totalICs,
    vslViews,
    presellViews,
    ticketMedio,
    icToSaleRate,
    lastSaleMinutes,
    salesLast10,
    salesLast30,
    salesLast60,
    byCampaign: Array.from(byCampaign.entries())
      .map(([name, d]) => ({ name, ...d }))
      .sort((a, b) => b.revenue - a.revenue),
    byCreative: Array.from(byCreative.entries())
      .map(([name, d]) => ({ name, ...d }))
      .sort((a, b) => b.revenue - a.revenue),
  };
}
