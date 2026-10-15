import { useEffect, useRef } from "react";

interface LoadMetrics {
  /** Labels of queries being tracked */
  labels: string[];
  /** Whether each query is still loading */
  loading: boolean[];
}

/**
 * Logs dashboard load performance to console:
 * - Time to first paint (component mount)
 * - Time to data ready (all queries resolved)
 * - Individual query timings
 * - Total network request count (via PerformanceObserver)
 */
export function useDashboardPerfLog({ labels, loading }: LoadMetrics) {
  const mountTs = useRef(performance.now());
  const queryStartTs = useRef<number[]>([]);
  const queryEndTs = useRef<(number | null)[]>([]);
  const allReadyLogged = useRef(false);
  const requestCount = useRef(0);
  const observer = useRef<PerformanceObserver | null>(null);

  // Track network requests via PerformanceObserver
  useEffect(() => {
    if (typeof PerformanceObserver === "undefined") return;
    try {
      const obs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if ((entry as any).initiatorType === "fetch" || (entry as any).initiatorType === "xmlhttprequest") {
            requestCount.current++;
          }
        }
      });
      obs.observe({ type: "resource", buffered: false });
      observer.current = obs;
    } catch {
      // PerformanceObserver not supported
    }

    const mount = mountTs.current;
    console.log(
      `%c[PERF] 📊 Dashboard mount at ${mount.toFixed(0)}ms`,
      "color: #4ade80; font-weight: bold",
    );

    return () => {
      observer.current?.disconnect();
    };
  }, []);

  // Initialize per-query tracking
  useEffect(() => {
    if (queryStartTs.current.length === 0) {
      const now = performance.now();
      queryStartTs.current = labels.map(() => now);
      queryEndTs.current = labels.map(() => null);
    }
  }, [labels]);

  // Track each query completion
  useEffect(() => {
    if (allReadyLogged.current) return;

    const now = performance.now();

    loading.forEach((isLoading, i) => {
      if (!isLoading && queryEndTs.current[i] === null) {
        queryEndTs.current[i] = now;
        const elapsed = now - mountTs.current;
        console.log(
          `%c[PERF] ✅ ${labels[i]} ready at ${elapsed.toFixed(0)}ms`,
          "color: #60a5fa",
        );
      }
    });

    const allDone = loading.every((l) => !l);
    if (allDone && loading.length > 0) {
      allReadyLogged.current = true;
      const totalMs = now - mountTs.current;
      const summary = labels.map((label, i) => ({
        query: label,
        ms: queryEndTs.current[i]
          ? Math.round((queryEndTs.current[i] as number) - mountTs.current)
          : "pending",
      }));

      console.log(
        `%c[PERF] 🚀 Dashboard fully loaded in ${totalMs.toFixed(0)}ms | ${requestCount.current} network requests`,
        "color: #fbbf24; font-weight: bold; font-size: 14px",
      );
      console.table(summary);
    }
  }, [loading, labels]);
}
