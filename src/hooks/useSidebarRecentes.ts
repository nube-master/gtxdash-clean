import { useState, useCallback, useEffect } from "react";
import { useLocation } from "react-router-dom";

const STORAGE_KEY = "sidebar-recentes";
const MAX = 4;

export function useSidebarRecentes() {
  const location = useLocation();
  const [recentes, setRecentes] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const path = location.pathname;
    setRecentes((prev) => {
      const filtered = prev.filter((p) => p !== path);
      const next = [path, ...filtered].slice(0, MAX);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, [location.pathname]);

  return recentes;
}
