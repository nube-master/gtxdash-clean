import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TrafficInfraCost {
  /** Custo total do período em BRL — mesma fonte do card "Aluguel de Contas" */
  cost: number;
  /** Nº de contas alugadas consideradas no período */
  accounts: number;
  days: number;
}

/**
 * Custo de estrutura de tráfego = MESMA fonte do card "Aluguel de Contas" do
 * dashboard (Overview.tsx): custos variáveis ativos com escopo
 * "specific_account", aplicados sobre o spend normalizado BRT por conta.
 *
 *  - pct_spend     → spend das contas do escopo × %
 *  - pct_revenue   → faturamento do período × %
 *  - fixed_value   → (valor / 30) × dias do período
 */
export async function fetchTrafficInfraCost(
  opId: string,
  start: string,
  end: string,
  revenue = 0,
): Promise<TrafficInfraCost> {
  const startDate = new Date(start + "T00:00:00");
  const endDate = new Date(end + "T00:00:00");
  const days = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1);

  const [{ data: costs, error: cErr }, { data: spendRows, error: sErr }] = await Promise.all([
    supabase.from("variable_costs").select("*").eq("operation_id", opId),
    supabase.rpc("get_traffic_spend_by_account_normalized" as any, {
      p_start_date: start,
      p_end_date: end,
      p_operation_id: opId,
    }),
  ]);
  if (cErr) throw new Error(cErr.message);
  if (sErr) throw new Error(sErr.message);

  const spendByAccount = new Map<string, number>();
  for (const row of (spendRows as any[]) ?? []) {
    const id = row.account_id;
    spendByAccount.set(id, (spendByAccount.get(id) || 0) + Number(row.total_spend || 0));
  }

  let cost = 0;
  const accountIdsUsed = new Set<string>();
  for (const vc of (costs as any[]) ?? []) {
    if (!vc.is_active || vc.scope !== "specific_account") continue;
    let accountIds: string[] = [];
    try {
      const parsed = JSON.parse(vc.scope_ref || "[]");
      accountIds = Array.isArray(parsed) ? parsed : [vc.scope_ref];
    } catch {
      accountIds = vc.scope_ref ? [vc.scope_ref] : [];
    }
    accountIds.forEach((id) => id && accountIdsUsed.add(id));
    const applicableSpend = accountIds.reduce((sum, id) => sum + (spendByAccount.get(id) || 0), 0);

    switch (vc.calc_base) {
      case "pct_spend":
        cost += applicableSpend * (Number(vc.percentage) || 0) / 100;
        break;
      case "pct_revenue":
        cost += revenue * (Number(vc.percentage) || 0) / 100;
        break;
      case "fixed_value":
        cost += ((Number(vc.fixed_value) || 0) / 30) * days;
        break;
    }
  }

  return { cost, accounts: accountIdsUsed.size, days };
}

export function useTrafficInfraCost(
  opId: string | undefined,
  start: string,
  end: string,
  enabled = true,
  revenue = 0,
) {
  return useQuery<TrafficInfraCost>({
    queryKey: ["traffic-infra-cost", opId, start, end, revenue],
    enabled: !!opId && !!start && !!end && enabled,
    staleTime: 60_000,
    queryFn: () => fetchTrafficInfraCost(opId!, start, end, revenue),
  });
}
