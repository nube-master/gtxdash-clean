import { useRef, useCallback, useState, useEffect } from "react";

interface PullToRefreshOptions {
  onRefresh: () => Promise<void>;
  threshold?: number;
  maxPull?: number;
}

export function usePullToRefresh({ onRefresh, threshold = 80, maxPull = 120 }: PullToRefreshOptions) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startY = useRef(0);
  const isPulling = useRef(false);
  const lockedRef = useRef(false);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (isRefreshing || lockedRef.current) return;
    const scrollContainer = document.querySelector(".flex-1.overflow-auto");
    if (!scrollContainer || scrollContainer.scrollTop > 5) return;
    startY.current = e.touches[0].clientY;
    isPulling.current = true;
  }, [isRefreshing]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isPulling.current || isRefreshing) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta <= 0) { setPullDistance(0); return; }
    // Rubber-band effect
    const d = Math.min(delta * 0.5, maxPull);
    setPullDistance(d);
    if (d > 10) e.preventDefault();
  }, [isRefreshing, maxPull]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling.current) return;
    isPulling.current = false;
    if (pullDistance >= threshold && !isRefreshing) {
      setIsRefreshing(true);
      lockedRef.current = true;
      setPullDistance(threshold * 0.6); // Hold at spinner position
      try { await onRefresh(); } catch {}
      setIsRefreshing(false);
      lockedRef.current = false;
    }
    setPullDistance(0);
  }, [pullDistance, threshold, isRefreshing, onRefresh]);

  useEffect(() => {
    const opts: AddEventListenerOptions = { passive: false };
    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, opts);
    document.addEventListener("touchend", handleTouchEnd);
    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return { pullDistance, isRefreshing };
}
