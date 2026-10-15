import { useMemo } from "react";
import type { LiveSale } from "./useLiveSales";

export interface SalesMetrics {
  lastSaleAt: Date | null;

  // Rhythm windows
  sales10min: number;
  sales30min: number;
  sales60min: number;
  avgInterval30min: number; // seconds
  avgInterval2h: number;   // seconds

  // Comparison
  currentInterval30min: number;
  pctDiff: number;

  // Operational status
  status: "normal" | "accelerating" | "slowing" | "risk" | "critical";

  // Alerts
  alerts: SalesAlert[];
}

export interface SalesAlert {
  id: string;
  type: "drop" | "spike" | "burst" | "drought";
  message: string;
  icon: string;
}

function countInWindow(sales: LiveSale[], windowMs: number, now: number): number {
  const cutoff = now - windowMs;
  return sales.filter((s) => new Date(s.created_at).getTime() >= cutoff).length;
}

function avgIntervalInWindow(sales: LiveSale[], windowMs: number, now: number): number {
  const cutoff = now - windowMs;
  const inWindow = sales
    .filter((s) => new Date(s.created_at).getTime() >= cutoff)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  if (inWindow.length < 2) return 0;
  const intervals: number[] = [];
  for (let i = 0; i < inWindow.length - 1; i++) {
    intervals.push(
      new Date(inWindow[i].created_at).getTime() - new Date(inWindow[i + 1].created_at).getTime()
    );
  }
  return intervals.reduce((a, b) => a + b, 0) / intervals.length / 1000;
}

export function calculateSalesMetrics(sales: LiveSale[], now: number): SalesMetrics {
  const lastSaleAt = sales.length > 0 ? new Date(sales[0].created_at) : null;

  const sales10min = countInWindow(sales, 10 * 60_000, now);
  const sales30min = countInWindow(sales, 30 * 60_000, now);
  const sales60min = countInWindow(sales, 60 * 60_000, now);

  const avgInterval30min = avgIntervalInWindow(sales, 30 * 60_000, now);
  const avgInterval2h = avgIntervalInWindow(sales, 2 * 60 * 60_000, now);
  const currentInterval30min = avgIntervalInWindow(sales, 30 * 60_000, now);

  let pctDiff = 0;
  if (avgInterval2h > 0 && currentInterval30min > 0) {
    pctDiff = ((currentInterval30min - avgInterval2h) / avgInterval2h) * 100;
  }

  // Status
  const timeSinceLastMs = lastSaleAt ? now - lastSaleAt.getTime() : Infinity;
  const timeSinceLastMin = timeSinceLastMs / 60_000;

  let status: SalesMetrics["status"] = "normal";
  if (timeSinceLastMin > 40) status = "critical";
  else if (timeSinceLastMin > 30) status = "risk";
  else if (pctDiff > 40) status = "slowing";
  else if (pctDiff < -60) status = "accelerating";

  // Alerts
  const alerts: SalesAlert[] = [];

  if (pctDiff > 50 && avgInterval2h > 0) {
    alerts.push({
      id: "drop",
      type: "drop",
      message: `Queda de ${Math.round(pctDiff)}% vs média 2h`,
      icon: "📉",
    });
  }

  if (pctDiff < -60 && avgInterval2h > 0) {
    alerts.push({
      id: "spike",
      type: "spike",
      message: `Aceleração de ${Math.abs(Math.round(pctDiff))}% acima da média`,
      icon: "🔥",
    });
  }

  // Burst: 5 sales in less than 2 minutes
  if (sales.length >= 5) {
    const recent5 = sales.slice(0, 5);
    const spanMs =
      new Date(recent5[0].created_at).getTime() -
      new Date(recent5[4].created_at).getTime();
    if (spanMs < 2 * 60_000) {
      alerts.push({
        id: "burst",
        type: "burst",
        message: "5 vendas em menos de 2 min!",
        icon: "⚡",
      });
    }
  }

  if (timeSinceLastMin > 30) {
    alerts.push({
      id: "drought",
      type: "drought",
      message: `${Math.floor(timeSinceLastMin)} min sem venda`,
      icon: "🚨",
    });
  }

  return {
    lastSaleAt,
    sales10min,
    sales30min,
    sales60min,
    avgInterval30min,
    avgInterval2h,
    currentInterval30min,
    pctDiff,
    status,
    alerts,
  };
}

export function useSalesMetrics(sales: LiveSale[], now: number): SalesMetrics {
  return useMemo(() => calculateSalesMetrics(sales, now), [sales, now]);
}
