import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperationId } from "@/contexts/OperationContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { format } from "date-fns";

import { deduplicateTraffic } from "@/utils/traffic-deduplication";

export interface CODDailyRow {
  order_date: string;
  orders_generated: number;
  orders_approved: number;
  orders_paid: number;
  orders_pending: number;
  orders_expired: number;
  orders_cancelled: number;
  delivery_rate: number;
  effective_rate?: number;
  commission_generated: number;
  fat_gerados: number;
  fat_aprovado: number;
  invest_total: number;
  delivered_total: number;
  commission_total: number;
  profit_of_day: number;
  cpa_generated: number;
  roas_real: number;
  day_status: "partial" | "closed" | "open";
  arpu?: number;
  // Projeções
  proj_orders_approved: number;
  proj_revenue_approved: number;
  proj_commission_approved: number;
  ticket_avg_approved: number;
  commission_avg_approved: number;
  avg_comm_7d_brl: number;
  // Novas métricas calculadas (FAHTO focused)
  cpa_approved: number;
  cpa_projected: number;
  approval_rate_pct: number;
  expiration_rate_pct: number;
  cancellation_rate_pct: number;
  commission_projected: number;
  roas_projected: number;
  profit_projected: number;
  days_since_creation: number;
  deadline_remaining: number;
}

export function useCODDaily(from: string, to: string) {
  const operationId = useOperationId();
  const { currency } = useCurrency();

  return useQuery({
    queryKey: ["cod-daily", operationId, from, to, currency],
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async (): Promise<CODDailyRow[]> => {
      if (!operationId) return [];
      
      const { data: pnlData, error: pnlError } = await supabase.rpc("get_cod_daily_pnl_v13" as any, {
        p_operation_id: operationId,
        p_date_from: from,
        p_date_to: to,
        p_display_currency: currency
      });

      if (pnlError) throw pnlError;

      // Invest now comes directly from RPC v13 with proper FX conversion
      const rawRows = (pnlData ?? []) as any[];
      
      // 1. Busca Taxa Final Histórica (cohorts fechados 10-30d atrás)
      const { data: historicalRate } = await supabase.rpc("get_cod_historical_approval_rate_v2" as any, {
        _operation_id: operationId
      });
      
      const effectiveRate = (Number(historicalRate) || 52.38) / 100;

      const avgComm7d = rawRows.length > 0 ? Number(rawRows[0].avg_comm_7d_brl) : 501.33;


      const rows = rawRows.map(r => {
        const dateStr = r.res_date;
        const investTotal = Number(r.invest_total_brl) || 0;
        const revTotal = Number(r.revenue_total) || 0; // commission_approved vindo da RPC
        
        const genCount = Number(r.orders_generated) || 0;
        const appCount = Number(r.orders_approved) || 0;
        const expCount = Number(r.orders_expired) || 0;
        const pendCount = Number(r.orders_pending) || 0;
        const cancelCount = Number(r.orders_cancelled) || 0;
        
        const ticketAvg = Number(r.ticket_avg_approved) || 0;
        const commAvg = Number(r.commission_avg_approved) || 0;

        const dateObj = new Date(dateStr);
        const now = new Date();
        const daysDiff = Math.floor((now.getTime() - dateObj.getTime()) / (1000 * 3600 * 24));
        const isClosed = pendCount === 0 || daysDiff >= 10;

        // Projeções usando a TAXA HISTÓRICA CONSOLIDADA (10-30d)
        const projOrders = !isClosed ? pendCount * effectiveRate : 0;
        const projComm = !isClosed ? projOrders * avgComm7d : 0;
        const projRev = projOrders * avgComm7d;


        const netProfit = revTotal - investTotal; 
        const netProfitProj = (revTotal + projComm) - investTotal;


        // Cálculos CPA
        const cpaGen = genCount > 0 ? investTotal / genCount : 0;
        const cpaApp = appCount > 0 ? investTotal / appCount : 0;
        const denProj = (appCount + projOrders);
        const cpaProj = denProj > 0 ? investTotal / denProj : 0;

        const totalProcessed = appCount + expCount + cancelCount;
        const denRate = (appCount + expCount + cancelCount + pendCount);
        // Taxa Entregue: entregues / gerados (sobre TODOS os pedidos do dia)
        const deliveryRate = genCount > 0 ? appCount / genCount : 0;
        // Taxa Efetiva (secundária): entregues / (entregues + expirados)
        const effectiveRate2 = (appCount + expCount) > 0 ? appCount / (appCount + expCount) : 0;


        return {
          order_date: dateStr,
          orders_generated: genCount,
          orders_approved: appCount,
          orders_paid: Number(r.orders_paid) || 0,
          orders_pending: pendCount,
          orders_expired: expCount,
          orders_cancelled: cancelCount,
          delivery_rate: deliveryRate,
          effective_rate: effectiveRate2,
          commission_generated: Number(r.commission_generated) || 0,
          fat_gerados: Number(r.revenue_generated) || 0,
          fat_aprovado: Number(r.revenue_approved) || 0,
          invest_total: investTotal,
          delivered_total: Number(r.revenue_approved) || 0,
          commission_total: revTotal,
          profit_of_day: netProfit,
          cpa_generated: cpaGen,
          roas_real: investTotal > 0 ? revTotal / investTotal : 0,
          arpu: genCount > 0 ? (revTotal + projComm) / genCount : 0,
          day_status: isClosed ? "closed" : "partial",
          proj_orders_approved: projOrders,
          proj_revenue_approved: projRev,
          proj_commission_approved: projComm,
          ticket_avg_approved: ticketAvg,
          commission_avg_approved: commAvg,
          avg_comm_7d_brl: avgComm7d,
          cpa_approved: cpaApp,
          cpa_projected: cpaProj,
          approval_rate_pct: effectiveRate * 100,
          expiration_rate_pct: denRate > 0 ? (expCount / denRate) * 100 : 0,
          cancellation_rate_pct: denRate > 0 ? (cancelCount / denRate) * 100 : 0,
          commission_projected: projComm,
          roas_projected: investTotal > 0 ? (revTotal + projComm) / investTotal : 0,
          profit_projected: netProfitProj,
          days_since_creation: daysDiff,
          deadline_remaining: Math.max(0, 10 - daysDiff)
        } as CODDailyRow;
      });

      return rows.sort((a, b) => b.order_date.localeCompare(a.order_date));
    },
  });
}
