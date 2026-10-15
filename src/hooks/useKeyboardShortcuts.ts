import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

// Primárias (1-9, 0) — abas top do dia-a-dia
const PRIMARY_MAP: Record<string, string> = {
  "1": "/",
  "2": "/pacing",
  "3": "/war-room",
  "4": "/analytics",
  "5": "/vendas",
  "6": "/creatives",
  "7": "/offers",
  "8": "/spy",
  "9": "/planning",
  "0": "/cashflow",
};

// Sequência `g` + letra (estilo Linear/GitHub) — secundárias
const G_MAP: Record<string, string> = {
  a: "/assets",
  m: "/meta-ads",
  v: "/vsls",
  p: "/performance-vsl",
  u: "/unit-economics",
  r: "/financial/reconciliation",
  i: "/gtx-meta-ia",
  j: "/jarvis",
  h: "/pacing/historico",
  s: "/pacing/score-rules",
  b: "/pacing/budget-groups",
  c: "/campaigns",
  t: "/talent-bank",
  k: "/academy",
  l: "/ao-vivo",
  n: "/media-channels",
  o: "/profile",
};

export const KEYBOARD_SHORTCUTS = { PRIMARY_MAP, G_MAP };

export function useKeyboardShortcuts() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const gPendingRef = useRef<number | null>(null);

  useEffect(() => {
    const clearG = () => {
      if (gPendingRef.current) {
        window.clearTimeout(gPendingRef.current);
        gPendingRef.current = null;
      }
    };

    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Sequência g+letra
      if (gPendingRef.current) {
        const target = G_MAP[e.key.toLowerCase()];
        clearG();
        if (target) {
          e.preventDefault();
          navigate(target);
        }
        return;
      }

      if (e.key === "g" || e.key === "G") {
        e.preventDefault();
        gPendingRef.current = window.setTimeout(clearG, 1500);
        return;
      }

      // Primárias 1-9, 0
      if (PRIMARY_MAP[e.key]) {
        e.preventDefault();
        navigate(PRIMARY_MAP[e.key]);
        return;
      }

      // ? — overlay de atalhos
      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        document.dispatchEvent(new CustomEvent("shortcuts:toggle"));
        return;
      }

      // R — refresh
      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        queryClient.invalidateQueries();
        return;
      }

      // T — cicla tema (movido do L)
      if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        const root = document.documentElement;
        const cycle = ["dark", "light", "midnight"];
        const current = cycle.find((c) => root.classList.contains(c)) || "dark";
        const idx = cycle.indexOf(current);
        const next = cycle[(idx + 1) % cycle.length];
        root.classList.remove(...cycle);
        root.classList.add(next);
        localStorage.setItem("wr-theme", next);
        return;
      }

      // . — foca primeiro campo de busca da página
      if (e.key === ".") {
        const search = document.querySelector<HTMLInputElement>(
          'input[type="search"], input[placeholder*="uscar" i], input[placeholder*="earch" i]'
        );
        if (search) {
          e.preventDefault();
          search.focus();
          search.select?.();
        }
        return;
      }
    };

    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      clearG();
    };
  }, [navigate, queryClient]);
}
