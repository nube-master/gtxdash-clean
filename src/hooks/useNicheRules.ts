import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_NICHE_RULES,
  NICHE_LABELS,
  NicheRule,
  detectNiche,
  getNicheRules,
  loadCustomNicheRules,
  saveCustomNicheRules,
} from "@/lib/productNiche";

/** Retorna as regras ativas (custom + default) e um detector reativo. */
export function useNicheRules() {
  const [custom, setCustom] = useState<NicheRule[]>(() => loadCustomNicheRules());

  useEffect(() => {
    const sync = () => setCustom(loadCustomNicheRules());
    window.addEventListener("niche-rules-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("niche-rules-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const rules = useMemo(() => [...custom, ...DEFAULT_NICHE_RULES], [custom]);

  const detect = useCallback((name: string | null | undefined) => detectNiche(name, rules), [rules]);

  const addRule = useCallback(
    (niche: string, keywords: string[]) => {
      const next = [
        { id: `c_${Date.now()}`, niche, keywords: keywords.filter(Boolean) },
        ...loadCustomNicheRules(),
      ];
      saveCustomNicheRules(next);
      setCustom(next);
    },
    [],
  );

  const removeRule = useCallback((id: string) => {
    const next = loadCustomNicheRules().filter((r) => r.id !== id);
    saveCustomNicheRules(next);
    setCustom(next);
  }, []);

  return { rules, custom, detect, addRule, removeRule, allNiches: Object.keys(NICHE_LABELS), getRules: getNicheRules };
}
