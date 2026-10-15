import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type GtxScoreThresholds = {
  green: number;
  yellow: number;
  roasWeight: number;
  roasTarget: number;
  consistWeight: number;
  profitWeight: number;
  profitTarget: number;
  volWeight: number;
  volTarget: number;
};

export type GtxDecisionThresholds = {
  // Teste
  testePromoverRoi: number;
  testePromoverMinSales: number;
  // Pré-escala
  preEscalaPromoverRoi: number;
  preEscalaPromoverMinSales: number;
  preEscalaCortarRoiNeg: number;
  // Escala
  escalaEscalarRoi: number;
  escalaEscalarMinDays: number;
  escalaCortarRoiNeg: number;
  // Pain / scale opportunity
  painCortarIndex: number;
  scaleOpportunityRoi: number;
  scaleOpportunitySpend: number;
  // Global
  defaultCpaThreshold: number;
};

export const DEFAULT_SCORE: GtxScoreThresholds = {
  green: 70,
  yellow: 40,
  roasWeight: 40,
  roasTarget: 3,
  consistWeight: 30,
  profitWeight: 20,
  profitTarget: 1000,
  volWeight: 10,
  volTarget: 10,
};

export const DEFAULT_DECISION: GtxDecisionThresholds = {
  testePromoverRoi: 1.30,
  testePromoverMinSales: 2,
  preEscalaPromoverRoi: 1.50,
  preEscalaPromoverMinSales: 2,
  preEscalaCortarRoiNeg: -0.50,
  escalaEscalarRoi: 1.30,
  escalaEscalarMinDays: 2,
  escalaCortarRoiNeg: -0.50,
  painCortarIndex: 2.0,
  scaleOpportunityRoi: 1.30,
  scaleOpportunitySpend: 300,
  defaultCpaThreshold: 150,
};

const SCORE_KEY = "gtx_score_thresholds";
const DECISION_KEY = "gtx_decision_rules";

export function useGtxThresholds() {
  const [score, setScore] = useState<GtxScoreThresholds>(DEFAULT_SCORE);
  const [decision, setDecision] = useState<GtxDecisionThresholds>(DEFAULT_DECISION);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await (supabase as any)
      .from("pacing_settings")
      .select("key,value")
      .in("key", [SCORE_KEY, DECISION_KEY]);
    const map: Record<string, any> = {};
    for (const r of (data ?? []) as { key: string; value: any }[]) map[r.key] = r.value;
    setScore({ ...DEFAULT_SCORE, ...(map[SCORE_KEY] ?? {}) });
    setDecision({ ...DEFAULT_DECISION, ...(map[DECISION_KEY] ?? {}) });
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return { score, decision, loading, refetch: load };
}

export const GTX_THRESHOLDS_KEYS = { SCORE_KEY, DECISION_KEY };
