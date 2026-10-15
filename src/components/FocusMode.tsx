import { useState, useEffect, useCallback, createContext, useContext } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface FocusContextValue {
  isFocused: boolean;
  toggleFocus: () => void;
}

const FocusContext = createContext<FocusContextValue>({ isFocused: false, toggleFocus: () => {} });

export function useFocusMode() {
  return useContext(FocusContext);
}

export function FocusModeProvider({ children }: { children: React.ReactNode }) {
  const [isFocused, setIsFocused] = useState(false);

  const toggleFocus = useCallback(() => {
    setIsFocused((prev) => !prev);
  }, []);

  // Keyboard shortcut: F key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "f" || e.key === "F") {
        // Don't intercept Cmd+F browser search
        if (!e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          toggleFocus();
        }
      }
      // ESC exits focus mode
      if (e.key === "Escape" && isFocused) {
        setIsFocused(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [toggleFocus, isFocused]);

  return (
    <FocusContext.Provider value={{ isFocused, toggleFocus }}>
      {children}
    </FocusContext.Provider>
  );
}

export function FocusModeButton() {
  const { isFocused, toggleFocus } = useFocusMode();

  return (
    <button
      onClick={toggleFocus}
      className="h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors border border-primary/10 bg-primary/5 shrink-0"
      title={isFocused ? "Sair do Modo Foco (F)" : "Modo Foco (F)"}
    >
      {isFocused ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
    </button>
  );
}
