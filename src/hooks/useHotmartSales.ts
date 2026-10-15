import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useOperationId } from "@/contexts/OperationContext";
import { useHotmartAllowlist } from "@/hooks/useHotmartAllowlist";
import { useHotmartCategories } from "@/hooks/useHotmartCategories";

const norm = (value: string | null | undefined) =>
  String(value || "").trim().toLowerCase();

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function toBrtDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  // BRT Midnight Guard: force date resolution based on the actual UTC instant.
  // We use Brasília time (UTC-3).
  // 00:00:00 - 02:59:59 UTC belongs to the PREVIOUS day in Brasília.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(date);
}

function getHotmartEffectiveDate(row: { date?: string | null; created_at?: string | null }): string | null {
  const storedDate = row.date || null;
  const createdDateBrt = toBrtDate(row.created_at);
  if (!storedDate) return createdDateBrt;
  return createdDateBrt === addDays(storedDate, -1) ? createdDateBrt : storedDate;
}

/**
 * Fetches Hotmart sales from clickbank_audit (vendor=hotmart) and
 * shapes them like sales_data rows so they can be merged into realSales.
 * Filters by the operation's hotmart allowlist (product_name / item_name).
 */
export function useHotmartSales() {
  const { dateRange } = useDateRange();
  const [start, end] = dateRange;
  const operationId = useOperationId();
  const { isAllowed, allowAll, names, loading: allowLoading } = useHotmartAllowlist();
  const { roleOf, categories, loading: categoriesLoading } = useHotmartCategories();
  const categoriesKey = Object.entries(categories)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join("|");

  return useQuery({
    queryKey: ["hotmart-sales-as-realSales", start, end, operationId, allowAll, names.join(","), categoriesKey],
    enabled: !!operationId && !allowLoading && !categoriesLoading,
    staleTime: 5_000,
    refetchInterval: 15_000,
    queryFn: async () => {
      const PAGE_SIZE = 1000;
      let all: any[] = [];
      let from = 0;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase
          .from("clickbank_audit")
          .select("id, receipt, amount_brl, amount_usd, product_name, item_name, created_at, date, utm_campaign, utm_source, utm_medium, utm_content, utm_term, meta_campaign_name, meta_ad_name")
          .eq("vendor", "hotmart")
          .eq("operation_id", operationId!)
          .eq("transaction_type", "SALE")
          .gte("date", addDays(start, -1))
          .lte("date", addDays(end, 1))
          .order("created_at", { ascending: false })
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        all = all.concat(data || []);
        hasMore = (data?.length || 0) === PAGE_SIZE;
        from += PAGE_SIZE;
      }

      // Filter by allowlist AND drop products explicitly marked as "ignore"
      // (out of funnel — não conta em nenhuma métrica: funil, faturamento, ARPU).
      return all
        .filter((r) => {
          // Rule: Use 'date' column for exact matching when available.
          // This avoids redundant timezone shifts for sales already normalized to BRT.
          const effectiveDate = getHotmartEffectiveDate(r);
          return !!effectiveDate && effectiveDate >= start && effectiveDate <= end;
        })
        .filter((r) => isAllowed(r.product_name, r.item_name))
        .filter((r) => {
          const role = roleOf(r.product_name, r.item_name);
          const isEDD = operationId === "1dd606e3-dac2-4064-b863-9784307c9e98";
          
          // Manual fallback for EDD products if categories are missing or failed
          if (isEDD && role === "ignore") {
            const name = norm(r.product_name || r.item_name);
            if (name.includes("fast dólar") || name.includes("fast dolar")) return true;
            if (name.includes("vip member") || name.includes("validado") || r.item_name === "order_bump") return true;
            if (name.includes("mentoria") || name.includes("turbo dólar") || name.includes("turbo dolar") || r.item_name === "upsell") return true;
          }
          
          return role !== "ignore";
        })
        .map((r) => {
          const funnelRole = roleOf(r.product_name, r.item_name);
          const hasExplicitFunnelRole = Boolean(categories[norm(r.product_name)] || categories[norm(r.item_name)]);
          return {
            id: `hm:${r.id}`,
            order_id: r.receipt || `hm:${r.id}`,
            created_at: r.created_at,
            date: r.date,
            product_name: r.product_name || r.item_name || null,
            item_name: r.item_name || null,
            revenue: Number(r.amount_brl || 0),
            amount: Number(r.amount_brl || 0),
            store: "hotmart",
            status: "approved",
            event_type: funnelRole,
            funnel_role: funnelRole,
            funnel_role_explicit: hasExplicitFunnelRole,
            hotmart_categories_configured: Object.keys(categories).length > 0,
            utm_campaign: r.meta_campaign_name || r.utm_campaign || null,
            utm_source: r.utm_source || null,
            utm_medium: r.utm_medium || null,
            utm_content: r.meta_ad_name || r.utm_content || null,
            utm_term: r.utm_term || null,
            offer_name: null,
            _source: "hotmart_audit",
          };
        });
    },
  });
}
