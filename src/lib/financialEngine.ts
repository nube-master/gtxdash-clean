/**
 * Financial Engine — calculates P&L from raw data + configurations
 * Order: Revenue → Investment → Taxes → Rent → Commissions → Fixed → Profit
 */

interface TrafficRow {
  account_id: string;
  spend: number;
  campaign_name?: string;
  ad_name?: string;
}

interface AccountRow {
  account_id: string;
  currency: string;
}

interface VariableCost {
  id: string;
  name: string;
  calc_base: string; // pct_spend, pct_revenue, pct_profit, fixed_value
  percentage: number;
  fixed_value: number;
  scope: string; // all, brl_only, usd_only, specific_account, specific_campaign, specific_creative
  scope_ref: string | null;
  is_active: boolean;
}

interface TeamMember {
  id: string;
  name: string;
  role_title: string;
  commission_type: string;
  percentage: number;
  fixed_value: number;
  scope: string;
  scope_ref: string | null;
  is_active: boolean;
}

interface FixedCostRow {
  id: string;
  name: string;
  category: string;
  monthly_value: number;
  is_active: boolean;
}

export interface PnLResult {
  revenue: number;
  investment: number;
  trafficSpend: number;
  manualAdjustmentsTotal: number;
  manualAdjustmentsBreakdown: { name: string; value: number }[];
  variableCostsTotal: number;
  variableCostsBreakdown: { name: string; value: number }[];
  commissionsTotal: number;
  commissionsBreakdown: { name: string; role_title: string; value: number }[];
  fixedCostsTotal: number;
  fixedCostsBreakdown: { name: string; category: string; value: number }[];
  operatingProfit: number;
  operatingMargin: number;
}

interface ManualAdjustment {
  id: string;
  description: string;
  amount: number;
  is_active: boolean;
}

export function calculatePnL(
  revenue: number,
  totalSpend: number,
  trafficRows: TrafficRow[],
  accounts: AccountRow[],
  variableCosts: VariableCost[],
  teamMembers: TeamMember[],
  fixedCosts: FixedCostRow[],
  periodDays: number,
  manualAdjustments: ManualAdjustment[] = [],
  includeManualAdjustments: boolean = false,
): PnLResult {
  // Build currency map
  const currencyMap = new Map<string, string>();
  for (const a of accounts) currencyMap.set(a.account_id, a.currency);

  // Spend by account (raw from traffic rows)
  const spendByAccount = new Map<string, number>();
  for (const t of trafficRows) {
    spendByAccount.set(t.account_id, (spendByAccount.get(t.account_id) || 0) + Number(t.spend));
  }

  // ── Normalize per-account spend to match authoritative totalSpend ──
  // trafficRows (client RPC) may aggregate differently from skyTotals (edge function).
  // Scale proportionally so per-account breakdown sums exactly to totalSpend.
  const rawTotal = Array.from(spendByAccount.values()).reduce((s, v) => s + v, 0);
  const spendScale = rawTotal > 0 && totalSpend > 0 ? totalSpend / rawTotal : 1;

  if (Math.abs(spendScale - 1) > 0.001) {
    for (const [accId, spend] of spendByAccount) {
      spendByAccount.set(accId, spend * spendScale);
    }
  }

  // Spend BRL / USD (using normalized values)
  let spendBRL = 0, spendUSD = 0;
  for (const [accId, spend] of spendByAccount) {
    const cur = currencyMap.get(accId) || "BRL";
    if (cur === "BRL") spendBRL += spend;
    else spendUSD += spend;
  }

  // ── Manual Adjustments (calculated first to include in investment) ──
  const activeAdjustments = includeManualAdjustments ? manualAdjustments.filter(a => a.is_active) : [];
  const manualAdjustmentsTotal = activeAdjustments.reduce((sum, a) => sum + Number(a.amount), 0);
  const manualAdjustmentsBreakdown = activeAdjustments.map(a => ({ name: a.description, value: Number(a.amount) }));

  // Total investment = traffic spend + manual adjustments (when applicable)
  const trafficSpend = totalSpend;
  const investment = totalSpend + manualAdjustmentsTotal;

  // ── 1) Variable Costs ──
  const variableCostsBreakdown: { name: string; value: number }[] = [];
  let variableCostsTotal = 0;

  // Gross profit uses full investment (traffic + manual adjustments)
  const grossProfit = revenue - investment;

  for (const vc of variableCosts) {
    if (!vc.is_active) continue;

    let base = 0;
    let applicableSpend = totalSpend;

    // Determine applicable spend based on scope
    if (vc.scope === "brl_only") applicableSpend = spendBRL;
    else if (vc.scope === "usd_only") applicableSpend = spendUSD;
    else if (vc.scope === "specific_account" && vc.scope_ref) {
      // scope_ref can be a single ID or JSON array of IDs
      let accountIds: string[] = [];
      try {
        const parsed = JSON.parse(vc.scope_ref);
        if (Array.isArray(parsed)) accountIds = parsed;
        else accountIds = [vc.scope_ref];
      } catch {
        accountIds = [vc.scope_ref];
      }
      applicableSpend = accountIds.reduce((sum, id) => sum + (spendByAccount.get(id) || 0), 0);
    }

    switch (vc.calc_base) {
      case "pct_spend":
        base = applicableSpend * (vc.percentage / 100);
        break;
      case "pct_revenue":
        base = revenue * (vc.percentage / 100);
        break;
      case "pct_profit":
        base = grossProfit * (vc.percentage / 100);
        break;
      case "fixed_value":
        // Pro-rate fixed monthly value by period days
        base = (vc.fixed_value / 30) * periodDays;
        break;
    }

    variableCostsBreakdown.push({ name: vc.name, value: base });
    variableCostsTotal += base;
  }

  // ── 2) Commissions ──
  const commissionsBreakdown: { name: string; role_title: string; value: number }[] = [];
  let commissionsTotal = 0;

  // Operating profit before commissions and fixed costs (uses full investment)
  const profitBeforeCommissions = revenue - investment - variableCostsTotal;

  for (const tm of teamMembers) {
    if (!tm.is_active) continue;

    let value = 0;
    switch (tm.commission_type) {
      case "pct_profit":
        value = profitBeforeCommissions * (tm.percentage / 100);
        break;
      case "pct_gross_profit":
        value = grossProfit * (tm.percentage / 100);
        break;
      case "pct_revenue":
        value = revenue * (tm.percentage / 100);
        break;
      case "pct_spend":
        value = totalSpend * (tm.percentage / 100);
        break;
      case "pct_creative_revenue":
        // Would need creative-level revenue; for now use total revenue as proxy
        value = revenue * (tm.percentage / 100);
        break;
      case "fixed_salary":
        value = (tm.fixed_value / 30) * periodDays;
        break;
      case "fixed_period":
        value = tm.fixed_value;
        break;
    }

    commissionsBreakdown.push({ name: tm.name, role_title: tm.role_title, value });
    commissionsTotal += value;
  }

  // ── 3) Fixed Costs ──
  const fixedCostsBreakdown: { name: string; category: string; value: number }[] = [];
  let fixedCostsTotal = 0;

  for (const fc of fixedCosts) {
    if (!fc.is_active) continue;
    const prorated = (fc.monthly_value / 30) * periodDays;
    fixedCostsBreakdown.push({ name: fc.name, category: fc.category, value: prorated });
    fixedCostsTotal += prorated;
  }


  // ── Final P&L ──
  const operatingProfit = revenue - investment - variableCostsTotal - commissionsTotal - fixedCostsTotal;
  const operatingMargin = revenue > 0 ? (operatingProfit / revenue) * 100 : 0;

  return {
    revenue,
    investment,
    trafficSpend,
    manualAdjustmentsTotal,
    manualAdjustmentsBreakdown,
    variableCostsTotal,
    variableCostsBreakdown,
    commissionsTotal,
    commissionsBreakdown,
    fixedCostsTotal,
    fixedCostsBreakdown,
    operatingProfit,
    operatingMargin,
  };
}
