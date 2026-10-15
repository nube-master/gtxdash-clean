import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperationId } from "@/contexts/OperationContext";

export interface SalesUtmRow {
  utm_value: string;
  utm_field: string;
  revenue: number;
  sales: number;
  avg_ticket: number;
  spend: number;
  roas: number | null;
}

export function useVslSalesUtm(
  startDate?: string,
  endDate?: string,
  groupBy: string = "utm_campaign"
) {
  const opId = useOperationId();
  return useQuery({
    queryKey: ["vsl-sales-utm", opId, startDate, endDate, groupBy],
    queryFn: async (): Promise<SalesUtmRow[]> => {

      const PAGE_SIZE = 1000;

      // Fetch all sales rows with pagination
      const salesRows: any[] = [];
      let from = 0;
      let hasMore = true;
      while (hasMore) {
        let q = supabase
          .from("sales_data")
          .select("utm_campaign, utm_source, utm_content, utm_term, revenue, status")
          .eq("status", "approved")
          .range(from, from + PAGE_SIZE - 1);
        if (opId) q = q.eq("operation_id", opId);
        if (startDate) q = q.gte("date", startDate);
        if (endDate) q = q.lte("date", endDate);
        const { data, error } = await q;
        if (error) throw error;
        salesRows.push(...(data || []));
        hasMore = (data?.length || 0) === PAGE_SIZE;
        from += PAGE_SIZE;
      }

      // Fetch traffic spend (only meaningful when grouping by utm_campaign → matches campaign_name)
      const spendMap = new Map<string, number>();
      if (groupBy === "utm_campaign") {
        let tFrom = 0;
        let tHasMore = true;
        while (tHasMore) {
          let tq = supabase
            .from("traffic_data")
            .select("campaign_name, spend:spend_brl")
            .range(tFrom, tFrom + PAGE_SIZE - 1);
          if (opId) tq = tq.eq("operation_id", opId);
          if (startDate) tq = tq.gte("date", startDate);
          if (endDate) tq = tq.lte("date", endDate);

          const { data: tData, error: tError } = await tq;
          if (tError) throw tError;
          for (const row of tData || []) {
            const key = (row.campaign_name as string) || "(sem UTM)";
            spendMap.set(key, (spendMap.get(key) || 0) + Number(row.spend || 0));
          }
          tHasMore = (tData?.length || 0) === PAGE_SIZE;
          tFrom += PAGE_SIZE;
        }
      }

      // Aggregate sales by selected UTM field
      const salesMap = new Map<string, { revenue: number; sales: number }>();
      for (const row of salesRows) {
        const key = (row[groupBy] as string) || "(sem UTM)";
        const existing = salesMap.get(key) || { revenue: 0, sales: 0 };
        salesMap.set(key, {
          revenue: existing.revenue + Number(row.revenue || 0),
          sales: existing.sales + 1,
        });
      }

      return Array.from(salesMap.entries())
        .map(([utm_value, { revenue, sales }]) => {
          const spend = spendMap.get(utm_value) || 0;
          const roas = spend > 0 ? revenue / spend : null;
          return {
            utm_value,
            utm_field: groupBy,
            revenue,
            sales,
            avg_ticket: sales > 0 ? revenue / sales : 0,
            spend,
            roas,
          };
        })
        .sort((a, b) => b.revenue - a.revenue);
    },
    enabled: true,
    staleTime: 5 * 60 * 1000,
  });
}
