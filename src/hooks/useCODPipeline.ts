import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperation } from "@/contexts/OperationContext";
import { useCODSource, applySourceFilter } from "@/hooks/useCODSourceFilter";

const CUTOFF_DAYS = 10;
const HISTORY_DAYS = 30;

export interface CODPipeline {
  pendingInWindow: number;      // pending com order_date >= today-10 (ainda podem entregar)
  expiredCount: number;          // pending com order_date < today-10 (perdidos)
  deliveryRate30d: number;       // 0..1, dinâmica dos últimos 30d de cohorts fechados
  avgCommissionEur: number;      // média EUR/entrega dos últimos 30d
  avgCommissionBrl7d: number;    // comissão média BRL real (últimos 7d)
  fxEurBrl: number;
  projectedDeliveries: number;   // pendingInWindow * deliveryRate30d
  projectedCommissionEur: number;
  projectedCommissionBrl: number;
  pendingByDate: Record<string, number>;  // order_date -> count (só no prazo)
}

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

const DELIVERED_STATUSES = ["paid", "commission_approved", "delivered", "approved"];

export function useCODPipeline() {
  const { operationId } = useOperation();
  const { source } = useCODSource();

  return useQuery({
    queryKey: ["cod-pipeline", operationId, source],
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async (): Promise<CODPipeline> => {
      const today = isoDaysAgo(0);
      const cutoff = isoDaysAgo(CUTOFF_DAYS);              // pending >= cutoff -> no prazo
      const histFrom = isoDaysAgo(HISTORY_DAYS + CUTOFF_DAYS);
      const histTo = isoDaysAgo(CUTOFF_DAYS);              // cohorts encerrados

      // FX
      const { data: fxRow } = await supabase
        .from("exchange_rates_cache")
        .select("rate")
        .eq("base_currency", "EUR")
        .eq("target_currency", "BRL")
        .maybeSingle();
      const fx = Number(fxRow?.rate) || 5.85;

      // Todos pending (ativos)
      let pendingQ = supabase
        .from("cod_orders")
        .select("order_date")
        .eq("status", "pending")
        .lte("order_date", today);
      if (operationId) pendingQ = pendingQ.eq("operation_id", operationId);
      pendingQ = applySourceFilter(pendingQ, source);
      const { data: pendingRows } = await pendingQ;

      const pendingByDate: Record<string, number> = {};
      let pendingInWindow = 0;
      let expiredCount = 0;
      for (const r of pendingRows ?? []) {
        const od = String((r as any).order_date);
        if (od >= cutoff) {
          pendingInWindow++;
          pendingByDate[od] = (pendingByDate[od] || 0) + 1;
        } else {
          expiredCount++;
        }
      }

      // 1. Busca Taxa Final Histórica (cohorts fechados 10-30d atrás)
      const { data: historicalRate } = await supabase.rpc("get_cod_historical_approval_rate_v2" as any, {
        _operation_id: operationId
      });
      const deliveryRate = (Number(historicalRate) || 52.38) / 100;

      // 2. Busca Comissão Média EUR (últimos 30d de cohorts fechados)
      let histQ = supabase
        .from("cod_orders")
        .select("status, commission_value")
        .gte("order_date", histFrom)
        .lt("order_date", histTo);
      if (operationId) histQ = histQ.eq("operation_id", operationId);
      histQ = applySourceFilter(histQ, source);
      const { data: histRows } = await histQ;

      let histDeliv = 0;
      let histCommEur = 0;
      for (const r of histRows ?? []) {
        if (DELIVERED_STATUSES.includes(String((r as any).status))) {
          histDeliv++;
          histCommEur += Number((r as any).commission_value) || 0;
        }
      }
      const avgCommEur = histDeliv > 0 ? histCommEur / histDeliv : 83; 


      const { data: avgRow } = await supabase
        .from("cod_orders")
        .select("commission_value_brl")
        .eq("status", "commission_approved")
        .eq("operation_id", operationId || '')
        .gte("updated_at", isoDaysAgo(7));
      
      const avgCommBrl7d = (avgRow?.length ?? 0) > 0 
        ? (avgRow ?? []).reduce((s, r) => s + (Number(r.commission_value_brl) || 0), 0) / (avgRow?.length ?? 1)
        : avgCommEur * fx;

      const projDeliveries = pendingInWindow * deliveryRate;
      const projCommBrl = projDeliveries * avgCommBrl7d;

      return {
        pendingInWindow,
        expiredCount,
        deliveryRate30d: deliveryRate,
        avgCommissionEur: avgCommEur,
        avgCommissionBrl7d: avgCommBrl7d,
        fxEurBrl: fx,
        projectedDeliveries: projDeliveries,
        projectedCommissionEur: projCommBrl / fx,
        projectedCommissionBrl: projCommBrl,
        pendingByDate,
      };
    },
  });
}
