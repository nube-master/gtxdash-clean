import { useSyncExternalStore, useCallback } from "react";

export type CODSource = "all" | "sphere" | "checkout_gtx" | "fahto" | "manual" | string;

const listeners = new Set<() => void>();

function readFromUrl(): CODSource {
  if (typeof window === "undefined") return "all";
  const p = new URLSearchParams(window.location.search).get("source");
  return (p || "all") as CODSource;
}

let current: CODSource = readFromUrl();

function emit() {
  listeners.forEach((l) => l());
}

export function setCODSource(next: CODSource) {
  current = next || "all";
  if (typeof window !== "undefined") {
    const url = new URL(window.location.href);
    if (current === "all") url.searchParams.delete("source");
    else url.searchParams.set("source", current);
    window.history.replaceState({}, "", url.toString());
  }
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Filtro global de origem dos pedidos COD (Todos | Sphere | FAHTO | Manual). */
export function useCODSource() {
  const source = useSyncExternalStore(subscribe, () => current, () => "all" as CODSource);
  const setSource = useCallback((s: CODSource) => setCODSource(s), []);
  return { source, setSource };
}

/** Aplica `.eq("source", ...)` no query builder quando o filtro não é "Todos". */
export function applySourceFilter<T>(query: T, source: CODSource): T {
  if (!source || source === "all") return query;
  return (query as any).eq("source", source) as T;
}
