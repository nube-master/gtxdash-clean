import { createContext, useContext, useState, useMemo, useEffect, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";

export type DateRangeKey = "today" | "yesterday" | "7" | "14" | "30" | "this_month" | "last_month" | "q_current" | "q_last" | "custom";

interface DateRangeContextValue {
  rangeKey: DateRangeKey;
  setRangeKey: (key: DateRangeKey) => void;
  customStart: string;
  customEnd: string;
  setCustomStart: (d: string) => void;
  setCustomEnd: (d: string) => void;
  /** ISO date strings [start, end] inclusive */
  dateRange: [string, string];
}

const DateRangeContext = createContext<DateRangeContextValue | null>(null);

/** Returns YYYY-MM-DD in São Paulo timezone */
function toBRDate(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return parts; // en-CA already returns YYYY-MM-DD
}

export function DateRangeProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [rangeKey, setRangeKeyState] = useState<DateRangeKey>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("wr-daterange") as DateRangeKey) || "today";
    }
    return "today";
  });
  const setRangeKey = (key: DateRangeKey) => {
    setRangeKeyState(key);
    localStorage.setItem("wr-daterange", key);
  };
  const [customStart, setCustomStart] = useState(() => toBRDate(new Date()));
  const [customEnd, setCustomEnd] = useState(() => toBRDate(new Date()));

  // Force recalculation when the Brasília day changes (midnight tick)
  const [todayStr, setTodayStr] = useState(() => toBRDate(new Date()));

  useEffect(() => {
    const checkDay = () => {
      const now = toBRDate(new Date());
      if (now !== todayStr) {
        console.log(`[DateRangeContext] Midnight tick detected: ${todayStr} -> ${now}`);
        setTodayStr(now);
        // Dispatch a global event to notify all listeners that the operational day has changed
        window.dispatchEvent(new CustomEvent("tos:midnight-tick", { detail: { date: now } }));
        
        // Force immediate invalidation of financial and campaign data
        queryClient.invalidateQueries({ queryKey: ["dashboard-totals"] });
        queryClient.invalidateQueries({ queryKey: ["live-pacing-campaigns"] });
        queryClient.invalidateQueries({ queryKey: ["campaign-statuses"] });
      }
    };
    // Check every 10 seconds for day change to minimize lag at 00:00
    const interval = setInterval(checkDay, 10_000);
    return () => clearInterval(interval);
  }, [todayStr]);

  const dateRange = useMemo<[string, string]>(() => {
    const today = todayStr;

    if (rangeKey === "today") return [today, today];

    if (rangeKey === "yesterday") {
      const now = new Date();
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const yStr = toBRDate(y);
      return [yStr, yStr];
    }

    if (rangeKey === "custom") return [customStart, customEnd];

    if (rangeKey === "this_month") {
      const now = new Date();
      const brToday = todayStr;
      const [y, m] = brToday.split("-").map(Number);
      const firstDay = `${y}-${String(m).padStart(2, "0")}-01`;
      return [firstDay, brToday];
    }

    if (rangeKey === "last_month") {
      const [y, m] = todayStr.split("-").map(Number);
      const prevMonth = m === 1 ? 12 : m - 1;
      const prevYear = m === 1 ? y - 1 : y;
      const firstDay = `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`;
      const lastDay = new Date(prevYear, prevMonth, 0).getDate();
      const lastDayStr = `${prevYear}-${String(prevMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      return [firstDay, lastDayStr];
    }

    if (rangeKey === "q_current" || rangeKey === "q_last") {
      const [y, m] = todayStr.split("-").map(Number);
      const qStart = Math.floor((m - 1) / 3) * 3 + 1; // 1,4,7,10
      const pad = (n: number) => String(n).padStart(2, "0");
      if (rangeKey === "q_current") {
        return [`${y}-${pad(qStart)}-01`, todayStr];
      }
      const prevStartMonth = qStart - 3;
      const py = prevStartMonth <= 0 ? y - 1 : y;
      const pm = prevStartMonth <= 0 ? prevStartMonth + 12 : prevStartMonth;
      const endMonth = pm + 2;
      const lastDay = new Date(py, endMonth, 0).getDate();
      return [`${py}-${pad(pm)}-01`, `${py}-${pad(endMonth)}-${pad(lastDay)}`];
    }


    const days = Number(rangeKey);
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - (days - 1));
    return [toBRDate(start), today];
  }, [rangeKey, customStart, customEnd, todayStr]);

  return (
    <DateRangeContext.Provider value={{ rangeKey, setRangeKey, customStart, customEnd, setCustomStart, setCustomEnd, dateRange }}>
      {children}
    </DateRangeContext.Provider>
  );
}

export function useDateRange() {
  const ctx = useContext(DateRangeContext);
  if (!ctx) throw new Error("useDateRange must be used within DateRangeProvider");
  return ctx;
}
