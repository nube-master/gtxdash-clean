import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useMobilePerformance, activePolling } from "@/hooks/useMobilePerformance";
import { useOperationId } from "@/contexts/OperationContext";
import { resolveCreativeId } from "@/lib/creativeUtils";
import { extractProjectCodeFromNaming, toCreativeCompositeKey } from "@/lib/projectUtils";

/**
 * Fetches Initiate Checkout events from RedTrack and groups them by creative composite key.
 * Returns a Map<compositeKey, icCount>.
 */
export function useRedTrackICs() {
  const { dateRange } = useDateRange();
  const [start, end] = dateRange;
  const perf = useMobilePerformance();
  const opId = useOperationId();

  return useQuery({
    queryKey: ["redtrack-ics-by-creative", start, end, opId],
    queryFn: async () => {
      const PAGE_SIZE = 1000;
      let allData: any[] = [];
      let from = 0;
      let hasMore = true;

      const startUtc = `${start}T03:00:00Z`;
      const endDate = new Date(`${end}T12:00:00Z`);
      endDate.setDate(endDate.getDate() + 1);
      const endUtc = `${endDate.toISOString().slice(0, 10)}T03:00:00Z`;

      while (hasMore) {
        let q = supabase
          .from("redtrack_events")
          .select("utm_campaign")
          .eq("event_type", "initiate_checkout")
          .gte("occurred_at", startUtc)
          .lt("occurred_at", endUtc)
          .range(from, from + PAGE_SIZE - 1);
        if (opId) q = q.eq("operation_id", opId);

        const { data, error } = await q;
        if (error) {
          console.warn("[useRedTrackICs] Query error:", error.message);
          return new Map<string, number>();
        }
        allData = allData.concat(data || []);
        hasMore = (data?.length || 0) === PAGE_SIZE;
        from += PAGE_SIZE;
      }

      const icMap = new Map<string, number>();
      for (const e of allData) {
        const cid = resolveCreativeId(e.utm_campaign);
        if (!cid || cid === "SEM_ID") continue;
        const project = extractProjectCodeFromNaming(e.utm_campaign);
        const compositeKey = toCreativeCompositeKey(cid, project);
        // Store under BOTH composite key (H01B14::MMP) and bare creative ID (H01B14)
        // so that lookups work even when project resolution differs between hooks
        // (e.g. useOfferProjects timing vs cached query results).
        icMap.set(compositeKey, (icMap.get(compositeKey) || 0) + 1);
        if (compositeKey !== cid) {
          icMap.set(cid, (icMap.get(cid) || 0) + 1);
        }
      }
      return icMap;
    },
    refetchInterval: activePolling(perf.primaryPollingMs, perf.isTabActive),
    staleTime: perf.staleTimeMs,
  });
}
