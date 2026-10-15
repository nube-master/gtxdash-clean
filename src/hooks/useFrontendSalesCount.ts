import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useHotmartCategories } from "./useHotmartCategories";

/**
 * Retorna a quantidade de COMPRADORES ÚNICOS de produtos FRONT-END (Hotmart)
 * no período, usando as categorias configuradas em app_settings.hotmart_config.
 *
 * IMPORTANTE: espera as categorias carregarem antes de rodar — caso contrário
 * roleOf() devolveria "ignore" pra tudo e a contagem travaria em 0.
 */
export function useFrontendSalesCount(
  operationId: string,
  startDate: string,
  endDate: string,
) {
  const { roleOf, categories, loading: categoriesLoading } = useHotmartCategories(operationId || null);

  // Assinatura estável das categorias pra invalidar cache quando mudar.
  const categoriesKey = Object.entries(categories)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join("|");
  const hasCategories = Object.keys(categories).length > 0;

  const { data = 0, isLoading } = useQuery({
    queryKey: ["frontend-sales-count", operationId, startDate, endDate, categoriesKey],
    enabled: !!operationId && !!startDate && !!endDate && !categoriesLoading && hasCategories,
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async () => {
      const PAGE = 1000;
      let all: any[] = [];
      let from = 0;
      // Pagina até esgotar (evita cap silencioso do PostgREST).
      // Bug de abril/26: usar page > 1000 truncava vendas.
      while (true) {
        const { data, error } = await supabase
          .from("clickbank_audit")
          .select("product_name, item_name, buyer_email_hash, buyer_email, id")
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

      const uniqueBuyers = new Set<string>();
      for (const r of all) {
        let role = roleOf((r as any).product_name, (r as any).item_name);
        
        // Manual fallback for EDD
        if (operationId === "1dd606e3-dac2-4064-b863-9784307c9e98" && role === "ignore") {
          const name = ((r as any).product_name || (r as any).item_name || "").toString().toLowerCase();
          if (name.includes("fast dólar") || name.includes("fast dolar")) role = "frontend";
        }

        if (role !== "frontend") continue;
        const key =
          (r as any).buyer_email_hash ||
          (r as any).buyer_email ||
          `txn:${(r as any).id}`;
        uniqueBuyers.add(String(key));
      }
      return uniqueBuyers.size;
    },
  });

  return { frontendCount: data, loading: isLoading || categoriesLoading };
}
