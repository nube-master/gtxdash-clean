import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperation } from "@/contexts/OperationContext";
import { deduplicateTraffic } from "@/utils/traffic-deduplication";

export interface CODTodayCash {
  today: string;              // YYYY-MM-DD BRT
  generated_today: number;    // pedidos criados hoje (approved + pending + cancelled + expired)
  approved_analytics_count: number; // approved sales_data (paridade com principal)
  invest_today: number;       // gasto Meta hoje (BRL) para COD
  approved_count: number;     // comissões aprovadas hoje (updated_at = hoje)
  approved_brl: number;       // SUM(commission_brl) aprovados hoje
  expired_today: number;      // expirados reais hoje (updated_at = hoje && created_at > 10d)
  cancelled_today: number;    // cancelados ou "expirados falsos" hoje
  avg_approval_7d: number;    // média de aprovação últimos 7d (call center efficiency)
  fx_eur_brl: number;
  avg_comm_7d_brl: number;
  approved_analytics_brl: number;
  generated_comm_brl: number;
}

function brtTodayISO(): string {
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return brt.toISOString().slice(0, 10);
}

export function useCODToday() {
  const { operationId } = useOperation();

  return useQuery({
    queryKey: ["cod-today-cash", operationId],
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<CODTodayCash> => {
      const today = brtTodayISO();
      if (!operationId) throw new Error("Operation ID is required");

      const { data: fxRow } = await supabase
        .from("exchange_rates_cache")
        .select("rate")
        .eq("base_currency", "EUR")
        .eq("target_currency", "BRL")
        .maybeSingle();
      const fx = Number(fxRow?.rate) || 5.85;

      const { data: trafficData, error: trafficError } = await supabase
        .from("traffic_data")
        .select("spend:spend_brl, account_id")
        .eq("operation_id", operationId)
        .eq("date", today);
      if (trafficError) throw trafficError;
      
      const { data: accounts } = await supabase
        .from("meta_ad_accounts")
        .select("account_id, currency")
        .eq("operation_id", operationId);

      const { data: usdFx } = await supabase
        .from("exchange_rates_cache")
        .select("rate")
        .eq("base_currency", "USD")
        .eq("target_currency", "BRL")
        .maybeSingle();
      
      const { data: eurFx } = await supabase
        .from("exchange_rates_cache")
        .select("rate")
        .eq("base_currency", "EUR")
        .eq("target_currency", "BRL")
        .maybeSingle();

      const vUsdRate = Number(usdFx?.rate) || 5.20;
      const vEurRate = Number(eurFx?.rate) || 6.05;

      const cleanTraffic = deduplicateTraffic(trafficData || []);
      const investFromTraffic = cleanTraffic.reduce((s, curr) => {
        const acc = (accounts || []).find(a => a.account_id === curr.account_id);
        const currSpend = Number(curr.spend || 0);
        let spendBrl = currSpend;
        
        if (acc?.currency === 'USD') spendBrl = currSpend * vUsdRate;
        else if (acc?.currency === 'EUR') spendBrl = currSpend * vEurRate;
        else if (!acc) spendBrl = currSpend * vUsdRate; // fallback assume USD

        return s + spendBrl;
      }, 0);
      
      const { data: realtimeRows } = await supabase
        .from("meta_spend_realtime_safe")
        .select("spend_brl")
        .eq("sp_date", today)
        .eq("operation_id", operationId);
      
      const investFromRealtime = (realtimeRows ?? []).reduce((s, r: any) => s + (Number(r.spend_brl) || 0), 0);
      
      // FIX 2026-08-23: FAHTO authoritative spend parity with dashboard-totals
      // Instead of simple Math.max, we use the trafficData as authoritative if it exists for the current day
      const invest_today = investFromTraffic > 0 ? investFromTraffic : investFromRealtime;


      const startBrt = `${today}T00:00:00-03:00`;
      const endBrt = `${today}T23:59:59-03:00`;

      // BLOCO 1: Gerados Hoje (Criação)
      const { count: generatedTodayCount } = await supabase
        .from("cod_orders")
        .select("id", { count: "exact", head: true })
        .eq("operation_id", operationId)
        .gte("created_at", startBrt)
        .lte("created_at", endBrt);

      // BLOCO 2: Processado Hoje (Call Center)
      // APROVADOS HOJE (Usa approved_at em vez de updated_at para evitar bugs de backfill)
      const { data: approvedRes } = await supabase
        .from("cod_orders")
        .select("commission_value_brl")
        .eq("operation_id", operationId)
        .eq("status", "commission_approved")
        .gte("approved_at", startBrt)
        .lte("approved_at", endBrt);
      
      const approved_count = approvedRes?.length || 0;
      const approved_brl = (approvedRes ?? []).reduce((s, r) => s + (Number(r.commission_value_brl) || 0), 0);

      // EXPIRADOS HOJE
      const { count: expired_today } = await supabase
        .from("cod_orders")
        .select("id", { count: "exact", head: true })
        .eq("operation_id", operationId)
        .eq("status", "expired")
        .gte("expired_at", startBrt)
        .lte("expired_at", endBrt);

      // CANCELADOS HOJE
      const { count: cancelled_today } = await supabase
        .from("cod_orders")
        .select("id", { count: "exact", head: true })
        .eq("operation_id", operationId)
        .eq("status", "cancelled")
        .gte("cancelled_at", startBrt)
        .lte("cancelled_at", endBrt);

      // MÉDIA APROVAÇÃO 7D (Call Center Efficiency)
      // Definimos como Aprovados / (Aprovados + Expirados + Cancelados) processados nos últimos 7 dias
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: last7dRes } = await supabase
        .from("cod_orders")
        .select("status")
        .eq("operation_id", operationId)
        .in("status", ["commission_approved", "expired", "cancelled"])
        .gte("updated_at", sevenDaysAgo);

      const app7 = (last7dRes ?? []).filter(r => r.status === 'commission_approved').length;
      const total7 = (last7dRes ?? []).length;
      const avg_approval_7d = total7 > 0 ? app7 / total7 : 0.5238;

      // Cálculo dinâmico da comissão média BRL dos últimos 7 dias
      const { data: avgRes } = await supabase
        .from("cod_orders")
        .select("commission_value_brl")
        .eq("operation_id", operationId)
        .eq("status", "commission_approved")
        .gte("updated_at", sevenDaysAgo);
      
      const avg_comm_7d_brl = (avgRes?.length ?? 0) > 0
        ? (avgRes ?? []).reduce((s, r) => s + (Number(r.commission_value_brl) || 0), 0) / (avgRes?.length ?? 1)
        : 501.33;

      // BLOCO ANALYTICS: Vendas aprovadas hoje via RedTrack/Analytics
      const { data: analyticsRes } = await supabase
        .from("sales_data")
        .select("revenue")
        .eq("operation_id", operationId)
        .eq("status", "approved")
        .eq("date", today);
      
      const approved_analytics_count = analyticsRes?.length || 0;
      const approved_analytics_brl = (analyticsRes ?? []).reduce((s, r) => s + (Number(r.revenue) || 0), 0);

      // BLOCO COMISSÃO GERADA: Valor total de comissão dos pedidos criados hoje (Potencial)
      const { data: generatedCommRes } = await supabase
        .from("cod_orders")
        .select("commission_value_brl, status")
        .eq("operation_id", operationId)
        .gte("created_at", startBrt)
        .lte("created_at", endBrt);
      
      const generated_comm_brl = (generatedCommRes ?? []).reduce((s, r) => s + (Number(r.commission_value_brl) || 0), 0);


      return {
        today,
        generated_today: generatedTodayCount || 0,
        invest_today,
        approved_count,
        approved_brl,
        expired_today,
        cancelled_today,
        avg_approval_7d,
        fx_eur_brl: fx,
        avg_comm_7d_brl,
        approved_analytics_count,
        approved_analytics_brl,
        generated_comm_brl,
      };
    },
  });
}
