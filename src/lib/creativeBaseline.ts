// Pure helpers for creative baseline (platô de performance) and consistency validation.
// Used by CreativeLifecycleCurve. No React, no I/O.

import type { LifecycleDayPoint } from "@/hooks/useCreativeLifecycle";

export interface BaselineMetric {
  median: number;
  p25: number;
  p75: number;
  sampleSize: number;
  /** "higher is better" (ROAS, CTR) vs lower is better (CPA, CPC) */
  betterHigher: boolean;
}

export interface CreativeBaseline {
  hasEnoughData: boolean;
  sampleSize: number;
  spendThreshold: number;
  metrics: {
    roas: BaselineMetric;
    cpa: BaselineMetric;
    cpc: BaselineMetric;
    ctr: BaselineMetric;
    salesPerDay: BaselineMetric;
    spendPerDay: BaselineMetric;
  };
  /** Snapshot for "today" / most recent day classification (last day in series). */
  today: {
    date: string;
    roas: number;
    cpa: number;
    cpc: number;
    ctr: number;
  } | null;
}

export type BaselineVerdict = "above" | "in_range" | "below" | "no_data";

export function classifyAgainstBaseline(
  current: number,
  baseline: BaselineMetric,
): BaselineVerdict {
  if (!baseline.sampleSize || current <= 0) return "no_data";
  const { p25, p75, betterHigher } = baseline;
  // Higher-is-better metrics: above p75 = great, below p25 = bad
  // Lower-is-better metrics: below p25 = great, above p75 = bad
  if (betterHigher) {
    if (current >= p75) return "above";
    if (current >= p25) return "in_range";
    return "below";
  }
  if (current <= p25) return "above";
  if (current <= p75) return "in_range";
  return "below";
}

function quantile(sortedAsc: number[], q: number): number {
  if (!sortedAsc.length) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const pos = (sortedAsc.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sortedAsc[base + 1] !== undefined) {
    return sortedAsc[base] + rest * (sortedAsc[base + 1] - sortedAsc[base]);
  }
  return sortedAsc[base];
}

function buildMetric(values: number[], betterHigher: boolean): BaselineMetric {
  const filtered = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  return {
    median: quantile(filtered, 0.5),
    p25: quantile(filtered, 0.25),
    p75: quantile(filtered, 0.75),
    sampleSize: filtered.length,
    betterHigher,
  };
}

/**
 * Builds the creative baseline from the lifecycle series.
 * Only "stable" days (spend ≥ 30% of period median spend) are used to avoid
 * warmup/idle days skewing the platô.
 */
export function buildCreativeBaseline(series: LifecycleDayPoint[]): CreativeBaseline {
  const empty: BaselineMetric = {
    median: 0,
    p25: 0,
    p75: 0,
    sampleSize: 0,
    betterHigher: true,
  };
  const emptyResult: CreativeBaseline = {
    hasEnoughData: false,
    sampleSize: 0,
    spendThreshold: 0,
    metrics: {
      roas: { ...empty, betterHigher: true },
      cpa: { ...empty, betterHigher: false },
      cpc: { ...empty, betterHigher: false },
      ctr: { ...empty, betterHigher: true },
      salesPerDay: { ...empty, betterHigher: true },
      spendPerDay: { ...empty, betterHigher: true },
    },
    today: null,
  };

  if (!series.length) return emptyResult;

  const allSpends = series.map((p) => p.spend).filter((v) => v > 0).sort((a, b) => a - b);
  const medianSpend = quantile(allSpends, 0.5);
  const spendThreshold = medianSpend * 0.3;

  const stable = series.filter((p) => p.spend >= spendThreshold && p.spend > 0);

  if (stable.length < 3) {
    // Not enough stable days for a meaningful baseline.
    const lastWithData = [...series].reverse().find((p) => p.spend > 0) || null;
    return {
      ...emptyResult,
      sampleSize: stable.length,
      spendThreshold,
      today: lastWithData
        ? {
            date: lastWithData.date,
            roas: lastWithData.roas,
            cpa: lastWithData.cpa,
            cpc: lastWithData.cpc,
            ctr: lastWithData.ctr,
          }
        : null,
    };
  }

  const lastStable = stable[stable.length - 1];

  return {
    hasEnoughData: true,
    sampleSize: stable.length,
    spendThreshold,
    metrics: {
      roas: buildMetric(stable.map((p) => p.roas), true),
      cpa: buildMetric(stable.map((p) => p.cpa), false),
      cpc: buildMetric(stable.map((p) => p.cpc), false),
      ctr: buildMetric(stable.map((p) => p.ctr), true),
      salesPerDay: buildMetric(stable.map((p) => p.sales), true),
      spendPerDay: buildMetric(stable.map((p) => p.spend), true),
    },
    today: {
      date: lastStable.date,
      roas: lastStable.roas,
      cpa: lastStable.cpa,
      cpc: lastStable.cpc,
      ctr: lastStable.ctr,
    },
  };
}

// ============================================================
// Consistency validation: lifecycle totals vs source-of-truth
// (the aggregated CreativeRow used in the table/cards)
// ============================================================

export interface ReferenceTotals {
  spend: number;
  revenue: number;
  sales: number;
  roas: number; // a.k.a. roi
}

export type ConsistencyLevel = "ok" | "warning" | "error";

export interface ConsistencyCheck {
  field: string;
  curve: number;
  reference: number;
  diffPct: number; // (curve - reference) / reference * 100
  level: ConsistencyLevel;
  formatter: "currency" | "integer" | "roas";
}

export interface ConsistencyReport {
  level: ConsistencyLevel;
  checks: ConsistencyCheck[];
  hasReference: boolean;
}

const TOLERANCE_PCT = 3; // soft threshold for currency/roas
const ERROR_PCT = 10;    // hard threshold

function pctDiff(curve: number, ref: number): number {
  if (!ref) return curve === 0 ? 0 : 100;
  return ((curve - ref) / ref) * 100;
}

function levelFromPct(diffPct: number, soft = TOLERANCE_PCT, hard = ERROR_PCT): ConsistencyLevel {
  const abs = Math.abs(diffPct);
  if (abs <= soft) return "ok";
  if (abs <= hard) return "warning";
  return "error";
}

export function validateLifecycleConsistency(
  series: LifecycleDayPoint[],
  reference?: ReferenceTotals | null,
): ConsistencyReport {
  if (!reference) {
    return { level: "ok", checks: [], hasReference: false };
  }

  const totals = series.reduce(
    (acc, p) => {
      acc.spend += p.spend;
      acc.revenue += p.revenue;
      acc.sales += p.sales;
      return acc;
    },
    { spend: 0, revenue: 0, sales: 0 },
  );
  const curveRoas = totals.spend > 0 ? totals.revenue / totals.spend : 0;

  const checks: ConsistencyCheck[] = [
    {
      field: "Investimento",
      curve: totals.spend,
      reference: reference.spend,
      diffPct: pctDiff(totals.spend, reference.spend),
      level: levelFromPct(pctDiff(totals.spend, reference.spend)),
      formatter: "currency",
    },
    {
      field: "Faturamento",
      curve: totals.revenue,
      reference: reference.revenue,
      diffPct: pctDiff(totals.revenue, reference.revenue),
      level: levelFromPct(pctDiff(totals.revenue, reference.revenue)),
      formatter: "currency",
    },
    {
      field: "Vendas",
      curve: totals.sales,
      reference: reference.sales,
      diffPct: pctDiff(totals.sales, reference.sales),
      // Sales: tolerate ±1 unit absolute even if pct looks large for low counts
      level:
        Math.abs(totals.sales - reference.sales) <= 1
          ? "ok"
          : levelFromPct(pctDiff(totals.sales, reference.sales)),
      formatter: "integer",
    },
    {
      field: "ROAS",
      curve: curveRoas,
      reference: reference.roas,
      diffPct: pctDiff(curveRoas, reference.roas),
      level: levelFromPct(pctDiff(curveRoas, reference.roas), 5, 15),
      formatter: "roas",
    },
  ];

  const worst: ConsistencyLevel = checks.reduce<ConsistencyLevel>((acc, check) => {
    if (acc === "error" || check.level === "error") return "error";
    if (acc === "warning" || check.level === "warning") return "warning";
    return "ok";
  }, "ok");

  return { level: worst, checks, hasReference: true };
}
