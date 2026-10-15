import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ConsolidatedRange = "today" | "yesterday" | "7d" | "30d" | "mtd" | "custom";
export type ConsolidatedCurrency = "BRL" | "USD";

export interface ConsolidatedOpRow {
  operation_id: string;
  operation_name: string;
  spend: number;
  revenue: number;
  sales: number;
  roas: number;
  lucro_bruto: number;
  margem_bruta_pct: number;
  active_campaigns_count: number;
}

export interface ConsolidatedTotals {
  spend: number;
  revenue: number;
  sales: number;
  roas: number;
  lucro_bruto: number;
  operations_count: number;
}

export interface ConsolidatedPayload {
  range: string;
  start_date: string;
  end_date: string;
  currency: ConsolidatedCurrency;
  fx_used: number;
  generated_at: string;
  operations: ConsolidatedOpRow[];
  totals: ConsolidatedTotals;
  source_notes: Record<string, string>;
}

export function useDashboardConsolidated(
  range: ConsolidatedRange,
  currency: ConsolidatedCurrency,
  customStart?: string,
  customEnd?: string,
  enabled = true,
  includeSuspended = false,
) {
  return useQuery<ConsolidatedPayload, Error>({
    queryKey: ["dashboard-consolidated", range, currency, customStart, customEnd, includeSuspended],
    enabled,
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: (failureCount, error) => {
      const msg = String(error?.message || "").toLowerCase();
      if (msg.includes("permission denied") || msg.includes("42501")) return false;
      return failureCount < 1;
    },
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_consolidated", {
        p_range: range,
        p_start: range === "custom" ? customStart ?? null : null,
        p_end: range === "custom" ? customEnd ?? null : null,
        p_currency: currency,
        p_include_suspended: includeSuspended,
      } as any);
      if (error) throw new Error(error.message);
      return data as unknown as ConsolidatedPayload;
    },
  });
}
