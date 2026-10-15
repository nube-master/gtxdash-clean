import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

interface PacingFullscreenContextValue {
  isFullscreen: boolean;
  enterFullscreen: () => void;
  exitFullscreen: () => void;
}

const PacingFullscreenContext = createContext<PacingFullscreenContextValue>({
  isFullscreen: false,
  enterFullscreen: () => {},
  exitFullscreen: () => {},
});

export function PacingFullscreenProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [isFullscreen, setIsFullscreen] = useState(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem("pacing-fullscreen");
    // Default to fullscreen ON when on /pacing routes, unless user explicitly opted out ("0")
    const enabled = stored === null ? true : stored === "1";
    const onPacing = location.pathname === "/pacing" || location.pathname.startsWith("/pacing");
    return enabled && onPacing;
  });

  const enterFullscreen = useCallback(() => {
    setIsFullscreen(true);
    localStorage.setItem("pacing-fullscreen", "1");
  }, []);

  const exitFullscreen = useCallback(() => {
    setIsFullscreen(false);
    localStorage.setItem("pacing-fullscreen", "0");
  }, []);

  // Auto-enter fullscreen when landing on /pacing (unless user opted out);
  // auto-exit when leaving /pacing routes
  useEffect(() => {
    const onPacing = location.pathname === "/pacing" || location.pathname.startsWith("/pacing");
    const stored = localStorage.getItem("pacing-fullscreen");
    const enabled = stored === null ? true : stored === "1";
    if (onPacing && enabled && !isFullscreen) {
      setIsFullscreen(true);
    }
    if (!onPacing && isFullscreen) {
      setIsFullscreen(false);
    }
  }, [location.pathname, isFullscreen]);

  return (
    <PacingFullscreenContext.Provider value={{ isFullscreen, enterFullscreen, exitFullscreen }}>
      {children}
    </PacingFullscreenContext.Provider>
  );
}

export function usePacingFullscreen() {
  const ctx = useContext(PacingFullscreenContext);
  if (!ctx) {
    throw new Error("usePacingFullscreen must be used within PacingFullscreenProvider");
  }
  return ctx;
}
