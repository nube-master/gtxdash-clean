export function fmt(value: number, type: "currency" | "number" | "percent" | "roas") {
  if (type === "currency")
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  if (type === "number") return new Intl.NumberFormat("pt-BR").format(Math.round(value));
  if (type === "percent") return `${value.toFixed(1)}%`;
  if (type === "roas") return `${value.toFixed(2)}x`;
  return String(value);
}

export function toISO(d: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function diffDays(a: string, b: string) {
  const d1 = new Date(a);
  const d2 = new Date(b);
  return Math.max(1, Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1);
}

export function remainingDays(end: string) {
  const today = new Date();
  const d2 = new Date(end);
  return Math.max(0, Math.round((d2.getTime() - today.getTime()) / 86400000) + 1);
}

export function elapsedDays(start: string) {
  const today = new Date();
  const d1 = new Date(start);
  return Math.max(1, Math.round((today.getTime() - d1.getTime()) / 86400000) + 1);
}

export interface GoalConfig {
  revenueGoal: number;
  salesGoal: number;
  cpaGoal: number;
  avgPrice: number;
  profitGoal: number;
  marginGoal: number; // target margin % (e.g. 30)
  cogs: number;
  taxRate: number;
  feeRate: number;
  startDate: string;
  endDate: string;
}

export interface RealMetrics {
  totalRevenue: number;
  totalRefunds: number;
  totalSales: number;
  totalSpend: number;
  cpaReal: number;
  lucro: number;
  roi: number;
  metaPct: number; // now based on profit goal
  lucroBruto: number;
  lucroLiquido: number;
  margemPct: number;
  lucroPorVenda: number;
  marginOnInvest: number; // lucro / investimento %
}

export function computeRealMetrics(
  sales: any[],
  traffic: any[],
  config: GoalConfig
): RealMetrics {
  const approved = sales.filter((s) => s.status === "approved");
  const refunded = sales.filter((s) => s.status === "refunded");
  const totalRevenue = approved.reduce((s, sale) => s + Number(sale.revenue), 0);
  const totalRefunds = refunded.reduce((s, sale) => s + Number(sale.revenue), 0);
  const totalSales = approved.length;
  const totalSpend = traffic.reduce((s, t) => s + Number(t.spend), 0);
  const cpaReal = totalSales > 0 ? totalSpend / totalSales : 0;
  const lucro = totalRevenue - totalSpend;
  const roi = totalSpend > 0 ? lucro / totalSpend : 0;

  const totalCogs = config.cogs * totalSales;
  const totalFees = totalRevenue * (config.feeRate / 100);
  const totalTaxes = totalRevenue * (config.taxRate / 100);
  const lucroBruto = totalRevenue - totalSpend - totalCogs;
  const lucroLiquido = totalRevenue - totalSpend - totalCogs - totalFees - totalTaxes;
  const margemPct = totalRevenue > 0 ? (lucroLiquido / totalRevenue) * 100 : 0;
  const lucroPorVenda = totalSales > 0 ? lucroLiquido / totalSales : 0;
  const marginOnInvest = totalSpend > 0 ? (lucroLiquido / totalSpend) * 100 : 0;

  // metaPct now based on profit goal (primary KPI)
  const metaPct = config.profitGoal > 0 ? (lucroLiquido / config.profitGoal) * 100 : 0;

  return { totalRevenue, totalRefunds, totalSales, totalSpend, cpaReal, lucro, roi, metaPct, lucroBruto, lucroLiquido, margemPct, lucroPorVenda, marginOnInvest };
}

export interface ProfitTargets {
  revenueNeeded: number;
  salesNeeded: number;
  investNeeded: number;
  cpaMax: number;
  roasMin: number;
}

export function computeProfitTargets(config: GoalConfig): ProfitTargets {
  const { profitGoal, avgPrice, cogs, taxRate, feeRate, cpaGoal } = config;
  if (profitGoal <= 0 || avgPrice <= 0) return { revenueNeeded: 0, salesNeeded: 0, investNeeded: 0, cpaMax: 0, roasMin: 0 };

  const deductionsPerUnit = cogs + avgPrice * ((feeRate + taxRate) / 100);
  const netPerUnit = avgPrice - deductionsPerUnit;

  const effectiveCpa = cpaGoal > 0 ? cpaGoal : 0;
  const profitPerSale = netPerUnit - effectiveCpa;
  const salesNeeded = profitPerSale > 0 ? Math.ceil(profitGoal / profitPerSale) : 0;
  const revenueNeeded = salesNeeded * avgPrice;
  const investNeeded = salesNeeded * effectiveCpa;
  const cpaMax = netPerUnit > 0 ? netPerUnit : 0;
  const roasMin = investNeeded > 0 ? revenueNeeded / investNeeded : 0;

  return { revenueNeeded, salesNeeded, investNeeded, cpaMax, roasMin };
}

export interface Projections {
  projRevenue: number;
  projSales: number;
  projLucro: number;
  projCpa: number;
  projLucroLiquido: number;
  projMargemPct: number;
  projMarginOnInvest: number;
  revenueStatus: "green" | "yellow" | "red";
  salesStatus: "green" | "yellow" | "red";
  cpaStatus: "green" | "yellow" | "red";
  profitStatus: "green" | "yellow" | "red";
  marginStatus: "green" | "yellow" | "red";
}

export function computeProjections(
  realMetrics: RealMetrics,
  elapsed: number,
  totalDays: number,
  config: GoalConfig
): Projections {
  const dailyRevenue = elapsed > 0 ? realMetrics.totalRevenue / elapsed : 0;
  const dailySales = elapsed > 0 ? realMetrics.totalSales / elapsed : 0;
  const dailySpend = elapsed > 0 ? realMetrics.totalSpend / elapsed : 0;

  const projRevenue = dailyRevenue * totalDays;
  const projSales = dailySales * totalDays;
  const projSpend = dailySpend * totalDays;
  const projLucro = projRevenue - projSpend;
  const projCpa = projSales > 0 ? projSpend / projSales : 0;

  const projCogs = config.cogs * projSales;
  const projFees = projRevenue * (config.feeRate / 100);
  const projTaxes = projRevenue * (config.taxRate / 100);
  const projLucroLiquido = projRevenue - projSpend - projCogs - projFees - projTaxes;
  const projMargemPct = projRevenue > 0 ? (projLucroLiquido / projRevenue) * 100 : 0;
  const projMarginOnInvest = projSpend > 0 ? (projLucroLiquido / projSpend) * 100 : 0;

  const revTarget = config.revenueGoal;
  const salesTarget = config.salesGoal;
  const cpaTarget = config.cpaGoal;
  const profitTarget = config.profitGoal;
  const marginTarget = config.marginGoal;

  const revenueStatus: "green" | "yellow" | "red" =
    revTarget <= 0 ? "yellow" :
    projRevenue >= revTarget * 1.05 ? "green" :
    projRevenue >= revTarget * 0.9 ? "yellow" : "red";

  const salesStatus: "green" | "yellow" | "red" =
    salesTarget <= 0 ? "yellow" :
    projSales >= salesTarget * 1.05 ? "green" :
    projSales >= salesTarget * 0.9 ? "yellow" : "red";

  const cpaStatus: "green" | "yellow" | "red" =
    cpaTarget <= 0 ? "yellow" :
    projCpa <= cpaTarget * 0.95 ? "green" :
    projCpa <= cpaTarget * 1.1 ? "yellow" : "red";

  const profitStatus: "green" | "yellow" | "red" =
    profitTarget <= 0 ? "yellow" :
    projLucroLiquido >= profitTarget * 1.05 ? "green" :
    projLucroLiquido >= profitTarget * 0.9 ? "yellow" : "red";

  const marginStatus: "green" | "yellow" | "red" =
    marginTarget <= 0 ? "yellow" :
    projMargemPct >= marginTarget * 1.05 ? "green" :
    projMargemPct >= marginTarget * 0.9 ? "yellow" : "red";

  return { projRevenue, projSales, projLucro, projCpa, projLucroLiquido, projMargemPct, projMarginOnInvest, revenueStatus, salesStatus, cpaStatus, profitStatus, marginStatus };
}
