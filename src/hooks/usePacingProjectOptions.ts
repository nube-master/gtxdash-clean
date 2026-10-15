import { useMemo } from "react";
import { useOfferProjects } from "@/hooks/useOfferProjects";
import { PROJECT_SLUGS } from "@/components/pacing/mockData";

/**
 * Lista de projetos para o editor de regras de Pacing.
 * = apelido_interno das offers cadastradas ∪ slugs hardcoded (fallback).
 * Ordenado alfabeticamente. Retorna { projects, loading }.
 */
export function usePacingProjectOptions() {
  const { allProjects } = useOfferProjects();

  const projects = useMemo(() => {
    const codes = (allProjects ?? []).map((p: any) => (typeof p === "string" ? p : p?.code ?? ""));
    const merged = new Set<string>([...codes, ...(PROJECT_SLUGS as readonly string[])]);
    return Array.from(merged)
      .map((s) => String(s).trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }, [allProjects]);

  return { projects, loading: false };
}
