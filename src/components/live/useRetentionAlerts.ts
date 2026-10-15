import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export type RetentionAlert = {
  id: string;
  scope: string; // "global" | `player:<id>`
  scopeLabel: string;
  ts: number;
  qualityNow: number;
  qualityBase: number;
  delta: number; // negative = degradation
  shortPctNow: number;
  shortPctBase: number;
  longPctNow: number;
  longPctBase: number;
  total: number;
  shortLabel: string;
  longLabel: string;
};

type Sample = { t: number; quality: number; shortPct: number; longPct: number; total: number };

// `buckets` must be ordered short→long. Quality = % long − % short, where:
//   short = first bucket, long = sum of last 1–2 buckets (depends on count).
export function computeQuality(
  buckets: { count: number }[] | undefined,
  total: number,
): { quality: number; shortPct: number; longPct: number } {
  if (!buckets || buckets.length === 0 || !total) return { quality: 0, shortPct: 0, longPct: 0 };
  const t = total || 1;
  const shortPct = (buckets[0].count / t) * 100;
  const longCount =
    buckets.length >= 3
      ? buckets[buckets.length - 1].count + buckets[buckets.length - 2].count
      : buckets[buckets.length - 1].count;
  const longPct = (longCount / t) * 100;
  return { quality: longPct - shortPct, shortPct, longPct };
}

const HISTORY_WINDOW_MS = 15 * 60_000;
const BASELINE_MIN_AGE_MS = 4 * 60_000;
const BASELINE_MAX_AGE_MS = 12 * 60_000;
const ALERT_COOLDOWN_MS = 3 * 60_000;
const MIN_VIEWERS = 10;
const DROP_THRESHOLD = 10;

export function useRetentionAlerts(input: {
  scope: string;
  scopeLabel: string;
  buckets?: { label: string; count: number }[];
  total: number;
  enabled?: boolean;
}) {
  const { scope, scopeLabel, buckets, total, enabled = true } = input;
  const historyRef = useRef<Map<string, Sample[]>>(new Map());
  const lastAlertRef = useRef<Map<string, number>>(new Map());
  const [alerts, setAlerts] = useState<RetentionAlert[]>([]);
  const [activeAlert, setActiveAlert] = useState<RetentionAlert | null>(null);

  useEffect(() => {
    if (!enabled || !buckets || buckets.length < 2) return;
    const now = Date.now();
    const { quality, shortPct, longPct } = computeQuality(buckets, total);

    const hist = historyRef.current.get(scope) ?? [];
    hist.push({ t: now, quality, shortPct, longPct, total });
    const pruned = hist.filter((s) => now - s.t <= HISTORY_WINDOW_MS);
    historyRef.current.set(scope, pruned);

    if (total < MIN_VIEWERS) {
      setActiveAlert(null);
      return;
    }

    const baselineSamples = pruned.filter(
      (s) => now - s.t >= BASELINE_MIN_AGE_MS && now - s.t <= BASELINE_MAX_AGE_MS && s.total >= MIN_VIEWERS,
    );
    if (baselineSamples.length < 3) {
      setActiveAlert(null);
      return;
    }

    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const qBase = avg(baselineSamples.map((s) => s.quality));
    const sBase = avg(baselineSamples.map((s) => s.shortPct));
    const lBase = avg(baselineSamples.map((s) => s.longPct));
    const delta = quality - qBase;

    const degraded = delta <= -DROP_THRESHOLD && shortPct > sBase && longPct < lBase;

    if (!degraded) {
      if (activeAlert && delta > -DROP_THRESHOLD / 2) setActiveAlert(null);
      return;
    }

    const last = lastAlertRef.current.get(scope) ?? 0;
    const fresh = now - last >= ALERT_COOLDOWN_MS;
    const shortLabel = buckets[0].label;
    const longLabel =
      buckets.length >= 3
        ? `${buckets[buckets.length - 2].label} + ${buckets[buckets.length - 1].label}`
        : buckets[buckets.length - 1].label;

    const alert: RetentionAlert = {
      id: `${scope}:${now}`,
      scope,
      scopeLabel,
      ts: now,
      qualityNow: Math.round(quality * 10) / 10,
      qualityBase: Math.round(qBase * 10) / 10,
      delta: Math.round(delta * 10) / 10,
      shortPctNow: Math.round(shortPct * 10) / 10,
      shortPctBase: Math.round(sBase * 10) / 10,
      longPctNow: Math.round(longPct * 10) / 10,
      longPctBase: Math.round(lBase * 10) / 10,
      total,
      shortLabel,
      longLabel,
    };

    setActiveAlert(alert);

    if (fresh) {
      lastAlertRef.current.set(scope, now);
      setAlerts((prev) => [alert, ...prev].slice(0, 30));
      toast.warning(`Retenção caindo · ${scopeLabel}`, {
        description: `${shortLabel} ${alert.shortPctBase}% → ${alert.shortPctNow}% · ${longLabel} ${alert.longPctBase}% → ${alert.longPctNow}% (Δ ${alert.delta} pp)`,
        duration: 8000,
      });
    }
  }, [buckets, total, scope, scopeLabel, enabled]);

  return { activeAlert, alerts };
}
