import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface RefundStats {
  refunds: number;
  chargebacks: number;
  sales: number;
  /** (reembolsos + chargebacks) / vendas * 100 */
  rate: number;
  /** Comissão estornada no período (R$) — RFND + CGBK */
  amountBrl: number;
  /** Preço cheio do produto estornado (R$) — igual ao card da Hotmart. 0 quando não capturado */
  grossBrl: number;
  /** Quebra por produto do funil (maior → menor) */
  byProduct: { product: string; count: number; amountBrl: number }[];
}

/**
 * Reembolsos e chargebacks Hotmart no período (clickbank_audit).
 *
 * REGRA: o estorno é atribuído ao dia da VENDA original (`date`), não ao dia
 * em que o reembolso foi processado. Assim a taxa nunca fica > 100% (ex.: 2
 * vendas no dia e 6 reembolsos de vendas antigas) — reembolso de venda de
 * outro dia aparece no dia daquela venda.
 */
export function useRefundStats(
  operationId: string | null,
  startDate: string,
  endDate: string,
) {
  const { data, isLoading } = useQuery<RefundStats>({
    queryKey: ["refund-stats", operationId, startDate, endDate],
    enabled: !!operationId && !!startDate && !!endDate,
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async () => {
      // 1) Estornos das vendas realizadas no período (data da venda original)
      const { data: rows, error: rErr } = await supabase
        .from("clickbank_audit")
        .select("transaction_type, product_name, amount_brl, raw_tracking")
        .eq("operation_id", operationId!)
        .in("transaction_type", ["RFND", "CGBK"])
        .gte("date", startDate)
        .lte("date", endDate);
      if (rErr) throw rErr;


      let r = 0;
      let c = 0;
      let amountBrl = 0;
      let grossBrl = 0;
      const prodMap = new Map<string, { product: string; count: number; amountBrl: number }>();
      for (const row of rows || []) {
        if (row.transaction_type === "CGBK") c++;
        else r++;
        const amt = Number(row.amount_brl || 0);
        amountBrl += amt;
        const gross = Number((row.raw_tracking as any)?.gross_price_brl || 0);
        grossBrl += gross > 0 ? gross : 0;
        const key = row.product_name || "Sem produto";
        const cur = prodMap.get(key) || { product: key, count: 0, amountBrl: 0 };
        cur.count++;
        cur.amountBrl += amt;
        prodMap.set(key, cur);
      }
      const byProduct = Array.from(prodMap.values()).sort((a, b) => b.amountBrl - a.amountBrl);

      // 2) Vendas aprovadas no período (data da venda)
      const { count: sales, error: sErr } = await supabase
        .from("clickbank_audit")
        .select("*", { count: "exact", head: true })
        .eq("operation_id", operationId!)
        .eq("transaction_type", "SALE")
        .gte("date", startDate)
        .lte("date", endDate);
      if (sErr) throw sErr;

      const s = sales ?? 0;
      const total = r + c;
      return {
        refunds: r,
        chargebacks: c,
        sales: s,
        rate: s > 0 ? (total / s) * 100 : 0,
        amountBrl,
        grossBrl,
        byProduct,
      };
    },
  });

  return {
    stats:
      data ?? { refunds: 0, chargebacks: 0, sales: 0, rate: 0, amountBrl: 0, grossBrl: 0, byProduct: [] },
    loading: isLoading,
  };
}
