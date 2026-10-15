import { useIsMobile } from "@/hooks/use-mobile";
import { useMemo, useSyncExternalStore } from "react";

/**
 * Mobile Performance Mode
 *
 * Provides optimized configuration for mobile devices:
 * - Longer polling intervals to reduce network usage
 * - Higher staleTime to avoid redundant fetches
 * - Lower concurrent request limits
 * - Priority tiers for data loading
 */

export interface MobilePerformanceConfig {
  /** Is the device detected as mobile */
  isMobile: boolean;
  /** Polling interval for primary data (sales, traffic) */
  primaryPollingMs: number;
  /** Polling interval for secondary data (VSL, previous period, leaderboard) */
  secondaryPollingMs: number;
  /** Polling interval for sky totals (fast KPI) */
  skyPollingMs: number;
  /** staleTime for React Query — data considered fresh for this long */
  staleTimeMs: number;
  /** gcTime for React Query — how long to keep unused cache */
  gcTimeMs: number;
  /** Silent auto-refresh interval in DashboardLayout */
  silentRefreshMs: number;
  /** Cache TTL for short-lived caches (e.g. pull-to-refresh guard) */
  cacheTtlMs: number;
  /** Whether the tab is currently visible */
  isTabActive: boolean;
}

const DESKTOP_CONFIG: Omit<MobilePerformanceConfig, "isTabActive"> = {
  isMobile: false,
  primaryPollingMs: 120_000,    // 2 min (was 60s)
  secondaryPollingMs: 300_000,  // 5 min (was 60s)
  skyPollingMs: 300_000,        // 5 min
  staleTimeMs: 120_000,         // 2 min
  gcTimeMs: 10 * 60_000,        // 10 min
  silentRefreshMs: 300_000,     // 5 min
  cacheTtlMs: 10_000,           // 10s
};

const MOBILE_CONFIG: Omit<MobilePerformanceConfig, "isTabActive"> = {
  isMobile: true,
  primaryPollingMs: 300_000,    // 5 min (was 120s)
  secondaryPollingMs: 600_000,  // 10 min (was 180s)
  skyPollingMs: 300_000,        // 5 min
  staleTimeMs: 120_000,         // 2 min
  gcTimeMs: 15 * 60_000,        // 15 min
  silentRefreshMs: 600_000,     // 10 min
  cacheTtlMs: 10_000,           // 10s
};

// ─── Tab Visibility Store ───────────────────────────────────
// Only the active tab polls. Inactive tabs get refetchInterval = false.
function subscribeVisibility(cb: () => void) {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
}
function getVisibilitySnapshot() {
  return document.visibilityState === "visible";
}
function getServerSnapshot() {
  return true;
}

/** Returns performance-tuned config based on device type and tab visibility */
export function useMobilePerformance(): MobilePerformanceConfig {
  const isMobile = useIsMobile();
  const isTabActive = useSyncExternalStore(subscribeVisibility, getVisibilitySnapshot, getServerSnapshot);

  return useMemo(() => {
    const base = isMobile ? MOBILE_CONFIG : DESKTOP_CONFIG;
    return { ...base, isTabActive };
  }, [isMobile, isTabActive]);
}

/**
 * Helper: returns the polling interval only if the tab is active, otherwise false.
 * Use this in refetchInterval to pause polling on inactive tabs.
 */
export function activePolling(interval: number, isTabActive: boolean): number | false {
  return isTabActive ? interval : false;
}

/**
 * In-memory cache guard to prevent duplicate fetches within a short window.
 * Used for pull-to-refresh and manual refresh scenarios.
 */
const _lastRefreshMap = new Map<string, number>();

export function canRefresh(key: string, ttlMs = 10_000): boolean {
  const now = Date.now();
  const last = _lastRefreshMap.get(key) || 0;
  if (now - last < ttlMs) return false;
  _lastRefreshMap.set(key, now);
  return true;
}

export function markRefreshed(key: string): void {
  _lastRefreshMap.set(key, Date.now());
}
