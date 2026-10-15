import type { CommissionConfig } from "@/hooks/useCommissionCalc";

const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export interface CommissionBreakdown {
  /** Faturamento bruto (pedidos) */
  grossRevenue: number;
  /** Faturamento considerado após taxa de entrega (COD) */
  effectiveRevenue: number;
  deliveryRate: number; // 0-100
  isCod: boolean;
  spend: number;
  taxes: number;
  rental: number;
  /** Custo de estrutura de tráfego (aluguel das contas + imposto BR) */
  trafficInfra: number;
  other: number;
  base: number;
  pct: number;
  valor: number;
}

/**
 * Cálculo único da Comissão SPACE — usado no card, na coluna diária e no CSV.
 * Base COD:      (Receita × taxa entrega) − Spend − Estrutura − Impostos − Aluguel − Outros
 * Base digital:  Receita − Spend − Estrutura − Impostos − Aluguel − Outros
 */
export function calcCommission(
  config: Partial<CommissionConfig> | null | undefined,
  revenue: number,
  spend: number,
  trafficInfraCost = 0,
): CommissionBreakdown {
  const rev = num(revenue);
  const spd = num(spend);
  const isCod = !!config?.is_cod_operation;
  const deliveryRate = isCod ? num(config?.delivery_rate_pct) : 100;
  const effectiveRevenue = rev * (deliveryRate / 100);

  const isNet = config?.base_formula === "net_profit";
  const taxes = isNet && config?.includes_taxes ? effectiveRevenue * 0.1215 : 0;
  const rental = isNet && config?.includes_account_rental ? spd * 0.055 : 0;
  const other = isNet && config?.includes_other_costs ? num(config?.other_costs_brl) : 0;
  const trafficInfra =
    isNet && config?.includes_traffic_infra !== false ? num(trafficInfraCost) : 0;

  const base = effectiveRevenue - spd - trafficInfra - taxes - rental - other;
  const pct = num(config?.commission_pct);
  const valor = base > 0 ? base * (pct / 100) : 0;

  return {
    grossRevenue: rev,
    effectiveRevenue,
    deliveryRate,
    isCod,
    spend: spd,
    taxes,
    rental,
    trafficInfra,
    other,
    base,
    pct,
    valor,
  };
}
