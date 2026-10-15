import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CommissionCalc {
  configured: boolean;
  revenue: number;
  spend: number;
  taxes: number;
  rental: number;
  other_costs: number;
  base: number;
  pct: number;
  valor_comissao: number;
  base_formula: "net_profit" | "gross_profit" | null;
}

export interface CommissionConfig {
  id?: string;
  operation_id: string;
  commission_pct: number;
  base_formula: "net_profit" | "gross_profit";
  includes_taxes: boolean;
  includes_account_rental: boolean;
  includes_other_costs: boolean;
  includes_traffic_infra: boolean;
  other_costs_brl: number;
  is_cod_operation: boolean;
  delivery_rate_pct: number;
}

const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function useCommissionCalc(
  opId: string | undefined,
  start: string,
  end: string,
  enabled = true,
) {
  return useQuery<CommissionCalc>({
    queryKey: ["commission-calc", opId, start, end],
    enabled: !!opId && enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_commission_calc", {
        p_operation_id: opId!,
        p_start: start,
        p_end: end,
      });
      if (error) throw new Error(error.message);
      const d = (data ?? {}) as any;
      return {
        configured: !!d.configured,
        revenue: num(d.revenue),
        spend: num(d.spend),
        taxes: num(d.taxes),
        rental: num(d.rental),
        other_costs: num(d.other_costs),
        base: num(d.base),
        pct: num(d.pct),
        valor_comissao: num(d.valor_comissao),
        base_formula: d.base_formula ?? null,
      };
    },
  });
}

export function useCommissionConfig(opId: string | undefined, enabled = true) {
  return useQuery<CommissionConfig | null>({
    queryKey: ["commission-config", opId],
    enabled: !!opId && enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("space_commission_config")
        .select("*")
        .eq("operation_id", opId!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      return {
        id: data.id,
        operation_id: data.operation_id,
        commission_pct: num(data.commission_pct),
        base_formula: data.base_formula as CommissionConfig["base_formula"],
        includes_taxes: !!data.includes_taxes,
        includes_account_rental: !!data.includes_account_rental,
        includes_other_costs: !!data.includes_other_costs,
        includes_traffic_infra: (data as any).includes_traffic_infra !== false,
        other_costs_brl: num(data.other_costs_brl),
        is_cod_operation: !!(data as any).is_cod_operation,
        delivery_rate_pct: num((data as any).delivery_rate_pct ?? 60),
      };
    },
  });
}

export function useSaveCommissionConfig(opId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (cfg: Omit<CommissionConfig, "id" | "operation_id">) => {
      const { error } = await supabase
        .from("space_commission_config")
        .upsert({ operation_id: opId!, ...cfg }, { onConflict: "operation_id" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["commission-config", opId] });
      qc.invalidateQueries({ queryKey: ["commission-calc", opId] });
      qc.invalidateQueries({ queryKey: ["commission-history", opId] });
    },
  });
}

export function useCommissionHistory(opId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["commission-history", opId],
    enabled: !!opId && enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("space_commission_config_history")
        .select("id, changed_at, changed_by, old_values, new_values")
        .eq("operation_id", opId!)
        .order("changed_at", { ascending: false })
        .limit(20);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}
