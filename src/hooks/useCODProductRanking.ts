import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperation } from "@/contexts/OperationContext";
import { useCODSource, applySourceFilter } from "@/hooks/useCODSourceFilter";

const DELIVERED_STATUSES = ["paid", "commission_approved", "delivered", "approved"];
const CLOSED_STATUSES = [...DELIVERED_STATUSES, "canceled", "refused", "expired"];

export interface CODProductRow {
  product: string;
  generated: number;
  delivered: number;
  pending: number;
  lost: number;                 // canceled+refused+expired
  deliveryRate: number;         // delivered / generated (sobre todos os pedidos)
  commissionEur: number;
  commissionBrl: number;
  avgCommissionEur: number;     // por entrega
}

interface Args {
  from: string;
  to: string;
}

export function useCODProductRanking({ from, to }: Args) {
  const { operationId } = useOperation();
  const { source } = useCODSource();

  return useQuery({
    queryKey: ["cod-product-ranking", operationId, from, to, source],
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async (): Promise<{ rows: CODProductRow[]; fxEurBrl: number }> => {
      const { data: fxRow } = await supabase
        .from("exchange_rates_cache")
        .select("rate")
        .eq("base_currency", "EUR")
        .eq("target_currency", "BRL")
        .maybeSingle();
      const fx = Number(fxRow?.rate) || 5.85;

      let q = supabase
        .from("cod_orders")
        .select("product_key, status, commission_value")
        .gte("order_date", from)
        .lte("order_date", to);
      if (operationId) q = q.eq("operation_id", operationId);
      q = applySourceFilter(q, source);

      const PAGE = 1000;
      let all: any[] = [];
      let offset = 0;
      while (true) {
        const { data, error } = await q.range(offset, offset + PAGE - 1);
        if (error) throw error;
        all = all.concat(data || []);
        if ((data?.length || 0) < PAGE) break;
        offset += PAGE;
      }

      const map = new Map<string, CODProductRow>();
      for (const r of all) {
        const key = (r.product_key || "—").trim() || "—";
        if (!map.has(key)) {
          map.set(key, {
            product: key,
            generated: 0,
            delivered: 0,
            pending: 0,
            lost: 0,
            deliveryRate: 0,
            commissionEur: 0,
            commissionBrl: 0,
            avgCommissionEur: 0,
          });
        }
        const row = map.get(key)!;
        row.generated++;
        const st = String(r.status);
        if (DELIVERED_STATUSES.includes(st)) {
          row.delivered++;
          row.commissionEur += Number(r.commission_value) || 0;
        } else if (st === "pending") {
          row.pending++;
        } else if (["canceled", "refused", "expired"].includes(st)) {
          row.lost++;
        }
      }

      const rows = Array.from(map.values()).map((r) => {
        // Taxa Entrega = entregues / gerados (consistente com o dashboard COD)
        r.deliveryRate = r.generated > 0 ? r.delivered / r.generated : 0;
        r.avgCommissionEur = r.delivered > 0 ? r.commissionEur / r.delivered : 0;
        r.commissionBrl = r.commissionEur * fx;
        return r;
      });

      rows.sort((a, b) => b.commissionBrl - a.commissionBrl);
      return { rows, fxEurBrl: fx };
    },
  });
}
