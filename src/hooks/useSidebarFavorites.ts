import { useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "sidebar-favorites";

export function useSidebarFavorites() {
  const [favoriteUrls, setFavoriteUrls] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favoriteUrls));
  }, [favoriteUrls]);

  const toggleFavorite = useCallback((url: string) => {
    setFavoriteUrls((prev) =>
      prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url]
    );
  }, []);

  return { favoriteUrls, toggleFavorite };
}
