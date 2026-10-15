import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useOperationId } from "@/contexts/OperationContext";

export interface DailyPerformanceRow {
  date: string;
  revenue: number;
  sales: number;
  spend: number;
  cpa: number;
  margin: number;
}

function getTodaySP(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const d = new Date(`${start}T12:00:00Z`);
  const e = new Date(`${end}T12:00:00Z`);
  while (d <= e) {
    dates.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dates;
}

async function fetchDailyPerformance(start: string, end: string, opId: string | null): Promise<DailyPerformanceRow[]> {
  const todaySP = getTodaySP();
  const allDates = dateRange(start, end);

  const pastDates = allDates.filter(d => d < todaySP);
  const liveDates = allDates.filter(d => d >= todaySP);

  const results: DailyPerformanceRow[] = [];

  if (pastDates.length > 0) {
    const PAGE = 1000;
    let allSnapshots: any[] = [];
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      let q = supabase
        .from("daily_totals_snapshot")
        .select("date, total_revenue, total_conversions, total_spend")
        .gte("date", pastDates[0])
        .lte("date", pastDates[pastDates.length - 1])
        .order("date")
        .range(from, from + PAGE - 1);
      if (opId) q = q.eq("operation_id", opId);

      const { data, error } = await q;
      if (error) { console.error("[useDailyPerformanceData] snapshot error:", error); break; }
      allSnapshots = allSnapshots.concat(data || []);
      hasMore = (data?.length || 0) === PAGE;
      from += PAGE;
    }

    for (const s of allSnapshots) {
      const revenue = Number(s.total_revenue || 0);
      const spend = Number(s.total_spend || 0);
      const sales = Number(s.total_conversions || 0);
      results.push({ date: s.date, revenue, sales, spend, cpa: sales > 0 ? spend / sales : 0, margin: revenue > 0 ? ((revenue - spend) / revenue) * 100 : 0 });
    }

    // NOTE: Past days without snapshots are intentionally skipped.
    // Previously we fired one dashboard-totals call per missing day (e.g. 24 calls
    // for a 24-day window), which overwhelmed the edge runtime and produced
    // "503 SUPABASE_EDGE_RUNTIME_ERROR" responses. The snapshot job is the
    // authoritative backfill mechanism — if a day is missing, that should be
    // fixed there, not by hammering the edge function from the client.
    const snapshotDates = new Set(allSnapshots.map((s: any) => s.date));
    const missingPastDates = pastDates.filter(d => !snapshotDates.has(d));
    if (missingPastDates.length > 0) {
      console.warn(`[useDailyPerformanceData] ${missingPastDates.length} past day(s) without snapshot — skipped to avoid edge runtime overload. Days: ${missingPastDates.slice(0, 5).join(", ")}${missingPastDates.length > 5 ? "…" : ""}`);
    }
  }

  for (const day of liveDates) {
    try {
      const baseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      let url = `${baseUrl}/functions/v1/dashboard-totals?start=${day}&end=${day}`;
      if (opId) url += `&operation_id=${opId}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25_000);
      const res = await fetch(url, { headers: { Authorization: `Bearer ${anonKey}`, apikey: anonKey }, signal: controller.signal });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        const revenue = Number(data.totalRevenue || 0);
        const spend = Number(data.totalSpend || 0);
        const sales = Number(data.totalConversions || 0);
        results.push({ date: day, revenue, sales, spend, cpa: sales > 0 ? spend / sales : 0, margin: revenue > 0 ? ((revenue - spend) / revenue) * 100 : 0 });
      }
    } catch (err) { console.error(`[useDailyPerformanceData] live fetch error for ${day}:`, err); }
  }

  return results.sort((a, b) => a.date.localeCompare(b.date));
}

export function useDailyPerformanceData() {
  const { dateRange: dr } = useDateRange();
  const [start, end] = dr;
  const opId = useOperationId();

  return useQuery<DailyPerformanceRow[]>({
    queryKey: ["daily-performance-data", start, end, opId],
    queryFn: () => fetchDailyPerformance(start, end, opId),
    staleTime: 5 * 60_000,
    placeholderData: (prev) => prev ?? [],
    retry: 1,
  });
}
