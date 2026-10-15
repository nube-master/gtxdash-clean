import { useState, useEffect, useCallback } from "react";

export type Theme = "dark" | "light" | "midnight";

const THEME_CYCLE: Theme[] = ["dark", "light", "midnight"];

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("wr-theme") as Theme) || "dark";
    }
    return "dark";
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("dark", "light", "midnight");
    root.classList.add(theme);
    localStorage.setItem("wr-theme", theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const idx = THEME_CYCLE.indexOf(prev);
      return THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
    });
  }, []);

  return { theme, toggleTheme };
}
