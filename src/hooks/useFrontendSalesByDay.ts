import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useHotmartCategories } from "./useHotmartCategories";

/**
 * Mapa date -> quantidade de COMPRADORES ÚNICOS de produtos FRONT-END (Hotmart).
 * Mesma lógica do useFrontendSalesCount (usado no dashboard), só que quebrada por dia.
 */
export function useFrontendSalesByDay(
  operationId: string,
  startDate: string,
  endDate: string,
) {
  const { roleOf, categories, loading: categoriesLoading } = useHotmartCategories(operationId || null);

  const categoriesKey = Object.entries(categories)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join("|");
  const hasCategories = Object.keys(categories).length > 0;

  const { data, isLoading } = useQuery({
    queryKey: ["frontend-sales-by-day", operationId, startDate, endDate, categoriesKey],
    enabled: !!operationId && !!startDate && !!endDate && !categoriesLoading && hasCategories,
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async () => {
      const PAGE = 1000;
      let all: any[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("clickbank_audit")
          .select("product_name, item_name, buyer_email_hash, buyer_email, id, date, receipt, amount_brl, amount_usd, created_at")
          .eq("operation_id", operationId)
          .eq("vendor", "hotmart")
          .eq("transaction_type", "SALE")
          .gte("date", startDate)
          .lte("date", endDate)
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const batch = data || [];
        all = all.concat(batch);
        if (batch.length < PAGE) break;
        from += PAGE;
      }

      const perDay = new Map<string, Set<string>>();
      const salesPerDay = new Map<string, Set<string>>();
      const revenuePerDay = new Map<string, number>();
      const isEDD = operationId === "1dd606e3-dac2-4064-b863-9784307c9e98";
      for (const r of all as any[]) {
        const day = String(r.date || "");
        if (!day) continue;
        
        // Filtro autoritativo de comissão front-end para Escola do Dólar
        if (isEDD) {
          const usd = Number(r.amount_usd || 0);
          if (usd < 200 || usd > 260) continue;
        }

        // Totais autoritativos do dia (mesma base da auditoria do dashboard)
        if (!salesPerDay.has(day)) salesPerDay.set(day, new Set());
        salesPerDay.get(day)!.add(String(r.receipt || `txn:${r.id}`));
        revenuePerDay.set(day, (revenuePerDay.get(day) || 0) + Number(r.amount_brl || 0));

        if (roleOf(r.product_name, r.item_name) !== "frontend") continue;
        if (!perDay.has(day)) perDay.set(day, new Set());
        perDay.get(day)!.add(String(r.buyer_email_hash || r.buyer_email || `txn:${r.id}`));
      }

      const out: Record<string, number> = {};
      for (const [day, set] of perDay) out[day] = set.size;
      const totals: Record<string, number> = {};
      for (const [day, set] of salesPerDay) totals[day] = set.size;
      const revenue: Record<string, number> = {};
      for (const [day, v] of revenuePerDay) revenue[day] = v;
      return { front: out, totals, revenue };
    },
  });

  return {
    frontendByDay: data?.front ?? {},
    totalSalesByDay: data?.totals ?? {},
    revenueByDay: data?.revenue ?? {},
    loading: isLoading || categoriesLoading,
  };
}
