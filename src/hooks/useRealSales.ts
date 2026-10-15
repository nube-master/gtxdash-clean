import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useMobilePerformance, activePolling } from "@/hooks/useMobilePerformance";
import { useRef, useCallback, useEffect } from "react";
import { useOperationId } from "@/contexts/OperationContext";
import { extractProjectCode } from "@/lib/projectUtils";
import { resolveCreativeId } from "@/lib/creativeUtils";

async function fetchAllSales(start: string, end: string, opId: string | null) {
  const PAGE_SIZE = 1000;

  // ... rest of the original fetchAllSales code

  let allData: any[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    let q = supabase
      .from("sales_data")
      .select("*")
      .gte("created_at", start + "T03:00:00Z")
      .lte("created_at", new Date(new Date(end).getTime() + 86400000).toISOString().split('T')[0] + "T03:00:00Z")
      .or("store.neq.clickbank_ref,store.is.null")
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (opId) q = q.eq("operation_id", opId);
    const { data, error } = await q;
    if (error) throw error;
    allData = allData.concat(data || []);
    hasMore = (data?.length || 0) === PAGE_SIZE;
    from += PAGE_SIZE;
  }

  return allData;
}

/** Delta fetch: only records created after lastTs */
async function fetchDeltaSales(start: string, end: string, lastTs: string, opId: string | null) {
  const PAGE_SIZE = 1000;
  let allData: any[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    let q = supabase
      .from("sales_data")
      .select("*")
      .gte("created_at", start + "T03:00:00Z")
      .lte("created_at", new Date(new Date(end).getTime() + 86400000).toISOString().split('T')[0] + "T03:00:00Z")
      .or("store.neq.clickbank_ref,store.is.null")
      .gt("created_at", lastTs)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (opId) q = q.eq("operation_id", opId);
    const { data, error } = await q;
    if (error) throw error;
    allData = allData.concat(data || []);
    hasMore = (data?.length || 0) === PAGE_SIZE;
    from += PAGE_SIZE;
  }

  return allData;
}

function mergeDelta(existing: any[], delta: any[]): any[] {
  if (delta.length === 0) return existing;
  const idSet = new Set(delta.map((d) => d.id));
  const filtered = existing.filter((e) => !idSet.has(e.id));
  return [...delta, ...filtered]; // newest first
}

export function useRealSales() {
  const { dateRange } = useDateRange();
  const [start, end] = dateRange;
  const perf = useMobilePerformance();
  const queryClient = useQueryClient();
  const lastFetchTs = useRef<string | null>(null);
  const opId = useOperationId();
  // Force cache invalidation when range changes to ensure BRT window fix applies
  useEffect(() => {
    console.log("[useRealSales] Resetting lastFetchTs due to range/opId change", { start, end, opId });
    lastFetchTs.current = null;
    queryClient.invalidateQueries({ queryKey: ["real-sales", start, end, opId] });
  }, [start, end, opId, queryClient]);

  const queryFn = useCallback(async () => {
    console.log("[useRealSales] queryFn trigger", { start, end, opId, isMobile: perf.isMobile });
    // Invalidate cache when cross-timezone dates like 22/08 are selected
    const cached = queryClient.getQueryData<any[]>(["real-sales", start, end, opId]);

    if (cached && cached.length > 0 && lastFetchTs.current && perf.isMobile) {
      console.log("[useRealSales] Delta fetch attempt", { lastFetchTs: lastFetchTs.current });
      const delta = await fetchDeltaSales(start, end, lastFetchTs.current, opId);
      const deltaWithProject = delta.map(s => {
        // Normalize project_slug if it contains brackets
        let rawProject = s.project_slug;
        if (rawProject && rawProject.startsWith("[") && rawProject.endsWith("]")) {
          rawProject = rawProject.substring(1, rawProject.length - 1);
        }
        
        const cid = resolveCreativeId(
          s.utm_campaign,
          null,
          null,
          s.utm_content,
          s.meta_ad_name,
          s.raw_payload?.rt_ad || s.raw_payload?.sub6_ad_name || s.raw_payload?.ad_id,
          s.raw_payload?.sub4
        );
        
        return {
          ...s,
          creative_id: cid,
          project: rawProject && rawProject !== "OUTROS" 
            ? rawProject 
            : extractProjectCode(s.utm_campaign, s.store, s.offer_name, s.product_name, null, null, s.project_slug)
        };
      });
      lastFetchTs.current = new Date().toISOString();
      if (delta.length === 0) return cached;
      return mergeDelta(cached, deltaWithProject);
    }

    console.log("[useRealSales] Full fetch triggered", { start, end });
    const data = (await fetchAllSales(start, end, opId)).map(s => {
      let rawProject = s.project_slug;
      if (rawProject && rawProject.startsWith("[") && rawProject.endsWith("]")) {
        rawProject = rawProject.substring(1, rawProject.length - 1);
      }
      
      const cid = resolveCreativeId(
        s.utm_campaign,
        null,
        null,
        s.utm_content,
        s.meta_ad_name,
        s.raw_payload?.rt_ad || s.raw_payload?.sub6_ad_name || s.raw_payload?.ad_id,
        s.raw_payload?.sub4
      );
      
      return {
        ...s,
        creative_id: cid,
        project: rawProject && rawProject !== "OUTROS" 
          ? rawProject 
          : extractProjectCode(s.utm_campaign, s.store, s.offer_name, s.product_name, null, null, s.project_slug)
      };
    });
    console.log("[useRealSales] Full fetch result count:", data.length);
    lastFetchTs.current = new Date().toISOString();
    return data;
  }, [start, end, queryClient, perf.isMobile, opId]);

  return useQuery({
    queryKey: ["real-sales", start, end, opId],
    queryFn,
    refetchInterval: 15_000,
    staleTime: 5_000,
  });
}
