import type { Offer } from "@/types/offers";
import type { OfferPerformanceStats } from "@/hooks/useOffersTraffic";
import { format } from "date-fns";

const COLS = [
  "Apelido", "Produto", "Status", "Nicho", "Geo", "Vendor", "Vendor ID",
  "Ticket BRL", "CPA Target", "Margem %",
  "Spend 7d", "Spend 30d", "Receita 7d", "Receita 30d",
  "Vendas Hoje", "Vendas 7d", "Vendas 30d",
  "ROI 7d", "ROI 30d", "Contas Ativas", "Inicio", "Tags",
];

export function exportOffersCSV(offers: Offer[], trafficMap: Map<string, OfferPerformanceStats> | undefined) {
  const rows = offers.map((o) => {
    const t = trafficMap?.get(o.id);
    return [
      o.apelido_interno,
      o.produto_real,
      o.status,
      o.nicho,
      o.geo,
      o.vendor,
      o.vendor_id ?? "",
      o.ticket_front_brl ?? "",
      o.cpa_target_brl ?? "",
      o.margem_pct ?? "",
      t?.spend_7d_brl?.toFixed(2) ?? "",
      t?.spend_30d_brl?.toFixed(2) ?? "",
      t?.revenue_7d_brl?.toFixed(2) ?? "",
      t?.revenue_30d_brl?.toFixed(2) ?? "",
      t?.sales_today ?? 0,
      t?.sales_7d ?? 0,
      t?.sales_30d ?? 0,
      t?.roi_7d?.toFixed(3) ?? "",
      t?.roi_30d?.toFixed(3) ?? "",
      t?.accounts_count ?? 0,
      o.data_inicio ?? "",
      (o.tags ?? []).join(";"),
    ];
  });

  const csv = [COLS, ...rows]
    .map((r) => r.map((cell) => {
      const s = String(cell ?? "");
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(","))
    .join("\n");

  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `offers-${format(new Date(), "yyyy-MM-dd-HHmm")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
