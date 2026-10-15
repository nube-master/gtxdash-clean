import { useMemo } from "react";
import { type CreativeRow, type ProjectInfo } from "@/lib/creativeUtils";

/**
 * Leaderboard Monthly Data — UNIFIED SOURCE OF TRUTH
 * 
 * This hook now consumes the SAME data as the Creative Table (via useCreativeData).
 * No separate queries, no separate attribution logic, no separate deduplication.
 * 
 * Previously this hook used 4 separate RPCs (get_leaderboard_traffic, get_leaderboard_sales,
 * get_leaderboard_cb_sales, get_leaderboard_redtrack) which caused data inconsistencies
 * because:
 * 1. Different CB attribution (no aff_sub2 join)
 * 2. Different RedTrack revenue calculation (raw multiply vs receipt-based lookup)
 * 3. Different sales filtering (no clickbank_ref exclusion, no mergeAllSales)
 * 4. Different date context (hardcoded month vs global range)
 */

export interface LeaderboardCreative {
  key: string;
  creativeId: string;
  totalSales: number;
  totalRevenue: number;
  totalSpend: number;
  totalProfit: number;
  avgRoas: number;
  activeAccounts: number;
  project: ProjectInfo;
}

export function useLeaderboardMonthlyData(creatives: CreativeRow[]) {
  const leaderboard = useMemo<LeaderboardCreative[]>(() => {
    const withSales = creatives.filter((c) => c.creativeId !== "SEM_ID" && c.sales > 0);

    const grouped = new Map<string, {
      creativeId: string;
      totalSales: number;
      totalRevenue: number;
      totalSpend: number;
      totalProfit: number;
      project: ProjectInfo;
      accountIds: Set<string>;
    }>();

    for (const creative of withSales) {
      const key = `${creative.creativeId}::${creative.project.tag ?? "SEM_TAG"}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          creativeId: creative.creativeId,
          totalSales: 0,
          totalRevenue: 0,
          totalSpend: 0,
          totalProfit: 0,
          project: creative.project,
          accountIds: new Set<string>(),
        });
      }

      const entry = grouped.get(key)!;
      entry.totalSales += creative.sales;
      entry.totalRevenue += creative.revenue;
      entry.totalSpend += creative.spend;
      entry.totalProfit += creative.profit;
      creative.accountIds.forEach((accountId) => entry.accountIds.add(accountId));
    }

    const entries: LeaderboardCreative[] = Array.from(grouped.entries()).map(([key, entry]) => ({
      key,
      creativeId: entry.creativeId,
      totalSales: entry.totalSales,
      totalRevenue: entry.totalRevenue,
      totalSpend: entry.totalSpend,
      totalProfit: entry.totalProfit,
      avgRoas: entry.totalSpend > 0 ? entry.totalRevenue / entry.totalSpend : 0,
      activeAccounts: entry.accountIds.size,
      project: entry.project,
    }));

    entries.sort((a, b) => {
      if (b.totalRevenue !== a.totalRevenue) return b.totalRevenue - a.totalRevenue;
      if (b.totalSales !== a.totalSales) return b.totalSales - a.totalSales;
      return b.totalProfit - a.totalProfit;
    });

    return entries.slice(0, 10);
  }, [creatives]);

  return { leaderboard };
}
