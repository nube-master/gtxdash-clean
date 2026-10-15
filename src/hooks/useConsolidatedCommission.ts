import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { calcCommission } from "@/lib/spaceCommission";
import { fetchTrafficInfraCost } from "@/hooks/useTrafficInfraCost";
import type { ConsolidatedOpRow, ConsolidatedCurrency } from "@/hooks/useDashboardConsolidated";

export interface ConsolidatedCommission {
  /** Soma das comissões já calculadas de cada operação, na moeda do consolidado */
  total: number;
  /** Operações que têm comissão configurada e entraram na soma */
  configured: { operationId: string; name: string; valor: number }[];
  /** Operações cuja comissão não pôde ser lida — bloqueiam a exibição do total */
  failed: string[];
}

/**
 * KPI "Comissão SPACE" do consolidado — AGREGAÇÃO PURA.
 * Usa exatamente a mesma fórmula/fonte do card de comissão de cada operação
 * (space_commission_config + calcCommission sobre revenue/spend do período),
 * apenas somando os valores. Operação sem config contribui 0.
 */
export function useConsolidatedCommission(
  operations: ConsolidatedOpRow[] | undefined,
  startDate: string | undefined,
  endDate: string | undefined,
  currency: ConsolidatedCurrency,
  fxUsed: number | undefined,
  enabled = true,
) {
  const opKey = (operations ?? []).map((o) => `${o.operation_id}:${o.revenue}:${o.spend}`).join("|");

  return useQuery<ConsolidatedCommission, Error>({
    queryKey: ["consolidated-commission", startDate, endDate, currency, opKey],
    enabled: enabled && !!operations?.length && !!startDate && !!endDate,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: cfgs, error } = await supabase.from("space_commission_config").select("*");
      if (error) throw new Error(error.message);
      const byOp = new Map<string, any>((cfgs ?? []).map((c: any) => [c.operation_id, c]));

      const baseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const configured: ConsolidatedCommission["configured"] = [];
      const failed: string[] = [];
      let total = 0;

      for (const op of operations ?? []) {
        const cfg = byOp.get(op.operation_id);
        if (!cfg) continue; // sem comissão configurada → contribui 0
        try {
          // MESMA fonte do card de comissão no detalhe da operação (dashboard-totals),
          // não os totais agregados do consolidado — senão os números divergem.
          const res = await fetch(
            `${baseUrl}/functions/v1/dashboard-totals?start=${startDate}&end=${endDate}&operation_id=${op.operation_id}`,
            { headers: { Authorization: `Bearer ${anonKey}`, apikey: anonKey } },
          );
          if (!res.ok) throw new Error(`dashboard-totals ${res.status}`);
          const t: any = await res.json();
          const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
          const fx = num(t.usdToBrl) > 0 ? num(t.usdToBrl) : Number(fxUsed) || 0;
          const toCurrency = (brl: number) =>
            currency === "USD" && fx > 0 ? brl / fx : brl;

          const revenueBrl = num(t.totalRevenue);
          const spendBrl = num(t.totalSpend);

          const infra = await fetchTrafficInfraCost(
            op.operation_id,
            startDate!,
            endDate!,
            revenueBrl,
          );
          const k = calcCommission(
            cfg,
            toCurrency(revenueBrl),
            toCurrency(spendBrl),
            toCurrency(infra.cost),
          );
          total += k.valor;
          configured.push({ operationId: op.operation_id, name: op.operation_name, valor: k.valor });
        } catch {
          failed.push(op.operation_name);
        }
      }

      return { total, configured, failed };
    },
  });
}

