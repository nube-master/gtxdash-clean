import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type OfferSalesIntelRow = {
  offer_id: string | null;
  apelido_interno: string;
  produto_real: string;
  nicho: string;
  geo: string;
  sales_count: number;
  revenue_brl: number;
};

const num = (v: any) => Number(v ?? 0);

/**
 * Sales Intelligence powered by `offers` table.
 * Each sale is attributed to a single offer (bracket > Newsbreak > vendor > apelido in product_name)
 * and Dual-Source MAX is applied per (offer, day) to prevent CartPanda × RedTrack double counting.
 */
export function useOffersSalesIntelligence(
  startDate: string,
  endDate: string,
  operationId?: string | null,
) {
  return useQuery({
    queryKey: ["offers-sales-intel", startDate, endDate, operationId ?? null],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_offers_sales_intelligence", {
        p_start_date: startDate,
        p_end_date: endDate,
        p_operation_id: operationId ?? undefined,
      } as any);
      if (error) throw error;
      return ((data as OfferSalesIntelRow[] | null) ?? []).map((r) => ({
        ...r,
        sales_count: num(r.sales_count),
        revenue_brl: num(r.revenue_brl),
      }));
    },
    refetchInterval: 120_000,
    staleTime: 60_000,
  });
}

export type SalesIntelGroup = {
  key: string;          // grouping key (nicho or produto)
  label: string;        // display label
  revenue: number;
  sales: number;
  sharePct: number;     // % of total revenue (or sales)
};

/** Group rows by nicho ("project") returning sorted list with share %. */
export function groupByNicho(rows: OfferSalesIntelRow[]): SalesIntelGroup[] {
  const totalRev = rows.reduce((s, r) => s + r.revenue_brl, 0);
  const map = new Map<string, { revenue: number; sales: number }>();
  for (const r of rows) {
    const key = r.nicho || "outros";
    const cur = map.get(key) || { revenue: 0, sales: 0 };
    cur.revenue += r.revenue_brl;
    cur.sales += r.sales_count;
    map.set(key, cur);
  }
  return Array.from(map.entries())
    .map(([key, v]) => ({
      key,
      label: NICHO_LABELS[key] ?? key,
      revenue: v.revenue,
      sales: v.sales,
      sharePct: totalRev > 0 ? (v.revenue / totalRev) * 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

/** Group rows by produto_real + geo (uma linha por mercado). */
export function groupByProduto(rows: OfferSalesIntelRow[], by: "revenue" | "sales" = "revenue"): SalesIntelGroup[] {
  const totalRev = rows.reduce((s, r) => s + r.revenue_brl, 0);
  const totalSales = rows.reduce((s, r) => s + r.sales_count, 0);
  const map = new Map<string, { label: string; revenue: number; sales: number }>();
  for (const r of rows) {
    const produto = r.produto_real || "Outros";
    const geo = (r.geo || "").toUpperCase().trim();
    const key = geo ? `${produto}__${geo}` : produto;
    const label = geo ? `${produto} · ${geo}` : produto;
    const cur = map.get(key) || { label, revenue: 0, sales: 0 };
    cur.revenue += r.revenue_brl;
    cur.sales += r.sales_count;
    map.set(key, cur);
  }
  return Array.from(map.entries())
    .map(([key, v]) => ({
      key,
      label: v.label,
      revenue: v.revenue,
      sales: v.sales,
      sharePct:
        by === "revenue"
          ? totalRev > 0
            ? (v.revenue / totalRev) * 100
            : 0
          : totalSales > 0
            ? (v.sales / totalSales) * 100
            : 0,
    }))
    .sort((a, b) => (by === "revenue" ? b.revenue - a.revenue : b.sales - a.sales));
}

const NICHO_LABELS: Record<string, string> = {
  brain_memory: "Brain & Memory",
  weight_loss: "Weight Loss",
  sleep: "Sleep",
  joint: "Joint",
  blood_sugar: "Blood Sugar",
  prostate: "Prostate",
  ed: "ED",
  hair: "Hair",
  skin: "Skin",
  energy: "Energy",
  diabetes: "Diabetes",
  outros: "Outros",
};
