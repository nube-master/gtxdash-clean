import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useOperationId } from "@/contexts/OperationContext";
import { useMobilePerformance, activePolling } from "@/hooks/useMobilePerformance";
import { extractProjectCodeFromNaming } from "@/lib/projectUtils";
import { fetchAllPaginated } from "@/lib/fetchAllPaginated";

export interface ProjectConversions {
  project: string;
  sales: number;
  revenue: number;
  spend: number;
}

const VENDOR_TO_PROJECT: Record<string, string> = {
  neurodyne: "NDM",
  crstrenght: "CRT",
  corestrength: "CRT",
  synaboost: "NDB",
  leandrop: "LDR",
};

export function useVslProjectConversions() {
  const { dateRange } = useDateRange();
  const [start, end] = dateRange;
  const opId = useOperationId();
  const perf = useMobilePerformance();

  return useQuery({
    queryKey: ["vsl-project-conversions", start, end, opId],
    queryFn: async (): Promise<Map<string, ProjectConversions>> => {
      const map = new Map<string, ProjectConversions>();

      const ensure = (project: string) => {
        if (!map.has(project)) map.set(project, { project, sales: 0, revenue: 0, spend: 0 });
        return map.get(project)!;
      };

      // 1) ClickBank audit — primary sales source (front-end only: $200-260 USD)
      const cbFilters = (q: any) => {
        q = q.gte("date", start).lte("date", end)
          .eq("transaction_type", "SALE")
          .gte("amount_usd", 200)
          .lte("amount_usd", 260);
        if (opId) q = q.eq("operation_id", opId);
        return q;
      };
      const cbData = await fetchAllPaginated("clickbank_audit", "vendor, amount_brl, amount_usd", cbFilters);

      for (const row of cbData) {
        const vendorKey = (row.vendor || "").toLowerCase().trim();
        const project = VENDOR_TO_PROJECT[vendorKey] || "OUTROS";
        const entry = ensure(project);
        entry.sales += 1;
        entry.revenue += Number(row.amount_brl || 0);
      }

      // 2) sales_data fallback (CartPanda, etc.)
      const salesFilters = (q: any) => {
        q = q.gte("date", start).lte("date", end).or("store.neq.clickbank_ref,store.is.null");
        if (opId) q = q.eq("operation_id", opId);
        return q;
      };
      const salesData = await fetchAllPaginated("sales_data", "utm_campaign, revenue", salesFilters);

      for (const sale of salesData) {
        const project = extractProjectCodeFromNaming(sale.utm_campaign || "") || "OUTROS";
        const entry = ensure(project);
        entry.sales += 1;
        entry.revenue += Number(sale.revenue || 0);
      }

      // 3) Spend from traffic_data
      const trafficFilters = (q: any) => {
        q = q.gte("date", start).lte("date", end);
        if (opId) q = q.eq("operation_id", opId);
        return q;
      };
      const trafficData = await fetchAllPaginated("traffic_data", "campaign_name, spend", trafficFilters);

      for (const row of trafficData) {
        const project = extractProjectCodeFromNaming(row.campaign_name || "") || "OUTROS";
        ensure(project).spend += Number(row.spend || 0);
      }

      return map;
    },
    refetchInterval: activePolling(perf.secondaryPollingMs, perf.isTabActive),
    staleTime: perf.staleTimeMs,
  });
}
