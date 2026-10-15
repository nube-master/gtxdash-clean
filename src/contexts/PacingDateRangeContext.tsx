import { createContext, useContext, useState, useCallback, useMemo, useEffect, type ReactNode } from "react";

export type PacingDateRangeKey = "today" | "yesterday" | "3d" | "7d" | "30d" | "custom";

interface Ctx {
  range: PacingDateRangeKey;
  setRange: (r: PacingDateRangeKey) => void;
  /** Define um intervalo customizado (calendário). Aplica `range = "custom"`. */
  setCustomRange: (startISO: string, endISO: string) => void;
  /** YYYY-MM-DD em BRT (America/Sao_Paulo) */
  startDate: string;
  /** YYYY-MM-DD em BRT (America/Sao_Paulo) */
  endDate: string;
  /** True quando a janela cobre apenas o dia de hoje BRT — necessário pra pace ao vivo. */
  isToday: boolean;
  label: string;
}

const STORAGE_KEY = "pacing-date-range";
const STORAGE_CUSTOM_KEY = "pacing-date-range-custom";
const SAO_PAULO_TZ = "America/Sao_Paulo";

const PacingDateRangeContext = createContext<Ctx | null>(null);

function toBRDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SAO_PAULO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function addDaysISO(yyyyMmDd: string, days: number): string {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + days * 86_400_000;
  const dt = new Date(t);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function fmtBRLabel(yyyyMmDd: string): string {
  const [, m, d] = yyyyMmDd.split("-");
  return `${d}/${m}`;
}

function resolveRange(
  range: PacingDateRangeKey,
  todayBRT: string,
  custom: { start: string; end: string } | null,
): { start: string; end: string; label: string } {
  if (range === "today") return { start: todayBRT, end: todayBRT, label: "Hoje" };
  if (range === "yesterday") {
    const y = addDaysISO(todayBRT, -1);
    return { start: y, end: y, label: "Ontem" };
  }
  if (range === "custom" && custom) {
    return {
      start: custom.start,
      end: custom.end,
      label: custom.start === custom.end
        ? fmtBRLabel(custom.start)
        : `${fmtBRLabel(custom.start)} – ${fmtBRLabel(custom.end)}`,
    };
  }
  const back = range === "3d" ? 2 : range === "7d" ? 6 : 29;
  return {
    start: addDaysISO(todayBRT, -back),
    end: todayBRT,
    label: range === "3d" ? "Últ. 3 dias" : range === "7d" ? "Últ. 7 dias" : "Últ. 30 dias",
  };
}

function loadCustom(): { start: string; end: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_CUSTOM_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (obj && typeof obj.start === "string" && typeof obj.end === "string") {
      return { start: obj.start, end: obj.end };
    }
  } catch {}
  return null;
}

export function PacingDateRangeProvider({ children }: { children: ReactNode }) {
  const [range, setRangeState] = useState<PacingDateRangeKey>(() => {
    if (typeof window === "undefined") return "today";
    const v = localStorage.getItem(STORAGE_KEY) as PacingDateRangeKey | null;
    return v && ["today", "yesterday", "3d", "7d", "30d", "custom"].includes(v) ? v : "today";
  });
  const [custom, setCustom] = useState<{ start: string; end: string } | null>(() => loadCustom());

  const setRange = useCallback((r: PacingDateRangeKey) => {
    setRangeState(r);
    try { localStorage.setItem(STORAGE_KEY, r); } catch {}
  }, []);

  const setCustomRange = useCallback((startISO: string, endISO: string) => {
    const start = startISO <= endISO ? startISO : endISO;
    const end = startISO <= endISO ? endISO : startISO;
    setCustom({ start, end });
    setRangeState("custom");
    try {
      localStorage.setItem(STORAGE_KEY, "custom");
      localStorage.setItem(STORAGE_CUSTOM_KEY, JSON.stringify({ start, end }));
    } catch {}
  }, []);

  const [todayBRT, setTodayBRT] = useState(() => toBRDate(new Date()));
  useEffect(() => {
    const tick = () => {
      const now = toBRDate(new Date());
      setTodayBRT((prev) => (now !== prev ? now : prev));
    };
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  const value = useMemo<Ctx>(() => {
    const { start, end, label } = resolveRange(range, todayBRT, custom);
    return {
      range,
      setRange,
      setCustomRange,
      startDate: start,
      endDate: end,
      isToday: range === "today" || (start === todayBRT && end === todayBRT),
      label,
    };
  }, [range, setRange, setCustomRange, todayBRT, custom]);

  return <PacingDateRangeContext.Provider value={value}>{children}</PacingDateRangeContext.Provider>;
}

export function usePacingDateRange() {
  const ctx = useContext(PacingDateRangeContext);
  if (!ctx) throw new Error("usePacingDateRange must be used within PacingDateRangeProvider");
  return ctx;
}
