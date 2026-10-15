import { useEffect, useState } from "react";

// Bucket boundaries are minutes. Last bucket is open-ended (>= last boundary).
// Example: [5, 15, 30, 60] => buckets: 0–5, 5–15, 15–30, 30–60, 60+
export type DurationBucketsConfig = {
  boundaries: number[]; // minutes, sorted ascending, 1..6 entries
};

export type BucketDef = { key: string; label: string; lo: number; hi: number | null };

export type BucketCounts = { key: string; label: string; count: number; avgSecs: number; lo: number; hi: number | null };

const STORAGE_KEY = "aovivo:duration_buckets:v1";
const DEFAULT_CONFIG: DurationBucketsConfig = { boundaries: [5, 15, 30, 60] };

function isValid(cfg: any): cfg is DurationBucketsConfig {
  if (!cfg || !Array.isArray(cfg.boundaries)) return false;
  const b = cfg.boundaries as number[];
  if (b.length < 1 || b.length > 6) return false;
  if (!b.every((n) => typeof n === "number" && n > 0 && Number.isFinite(n))) return false;
  for (let i = 1; i < b.length; i++) if (b[i] <= b[i - 1]) return false;
  return true;
}

export function useDurationBucketsConfig(): [DurationBucketsConfig, (cfg: DurationBucketsConfig) => void, () => void] {
  const [cfg, setCfg] = useState<DurationBucketsConfig>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return isValid(parsed) ? parsed : DEFAULT_CONFIG;
    } catch {
      return DEFAULT_CONFIG;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    } catch {
      /* ignore */
    }
  }, [cfg]);

  // Cross-tab sync
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try {
        const parsed = JSON.parse(e.newValue);
        if (isValid(parsed)) setCfg(parsed);
      } catch { /* ignore */ }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const reset = () => setCfg(DEFAULT_CONFIG);
  const update = (next: DurationBucketsConfig) => {
    if (isValid(next)) setCfg(next);
  };
  return [cfg, update, reset];
}

function fmtMin(n: number) {
  if (n < 1) return `${Math.round(n * 60)}s`;
  if (n < 60) return `${n}min`;
  const h = n / 60;
  return Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`;
}

export function bucketsFromConfig(cfg: DurationBucketsConfig): BucketDef[] {
  const out: BucketDef[] = [];
  let prev = 0;
  for (const b of cfg.boundaries) {
    out.push({ key: `b_${prev}_${b}`, label: `${fmtMin(prev)}–${fmtMin(b)}`, lo: prev * 60, hi: b * 60 });
    prev = b;
  }
  out.push({ key: `b_${prev}_inf`, label: `${fmtMin(prev)}+`, lo: prev * 60, hi: null });
  return out;
}

export function bucketize(sessionsSecs: number[] | undefined, defs: BucketDef[]): BucketCounts[] {
  const buckets = defs.map((d) => ({ ...d, count: 0, sum: 0 }));
  for (const s of sessionsSecs ?? []) {
    for (const b of buckets) {
      if (s >= b.lo && (b.hi === null || s < b.hi)) {
        b.count++;
        b.sum += s;
        break;
      }
    }
  }
  return buckets.map((b) => ({
    key: b.key,
    label: b.label,
    lo: b.lo,
    hi: b.hi,
    count: b.count,
    avgSecs: b.count ? Math.round(b.sum / b.count) : 0,
  }));
}
