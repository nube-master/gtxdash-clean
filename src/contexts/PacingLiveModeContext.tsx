import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const STORAGE_KEY = "pacing.liveMode";

interface Ctx {
  liveMode: boolean;
  setLiveMode: (v: boolean) => void;
  toggle: () => void;
}

const PacingLiveModeContext = createContext<Ctx | null>(null);

export function PacingLiveModeProvider({ children }: { children: ReactNode }) {
  const [liveMode, setLiveModeState] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, liveMode ? "1" : "0");
    } catch { /* ignore */ }
  }, [liveMode]);

  const setLiveMode = (v: boolean) => setLiveModeState(v);
  const toggle = () => setLiveModeState((v) => !v);

  return (
    <PacingLiveModeContext.Provider value={{ liveMode, setLiveMode, toggle }}>
      {children}
    </PacingLiveModeContext.Provider>
  );
}

export function usePacingLiveMode(): Ctx {
  const ctx = useContext(PacingLiveModeContext);
  if (!ctx) return { liveMode: false, setLiveMode: () => {}, toggle: () => {} };
  return ctx;
}
