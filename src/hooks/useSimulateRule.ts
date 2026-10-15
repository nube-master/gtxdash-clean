import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface SimulationRuleStat {
  rule_id: string;
  rule_name: string;
  skip_reason: string | null;
  campaigns_matched: number;
  campaigns_fired: number;
  campaigns_blocked: number;
  matched_campaign_ids: string[];
  fired_campaign_ids: string[];
  blocked: Array<{ campaignId: string; campaignName: string; reason: string }>;
}

export interface SimulationWouldFire {
  kind: string;
  rule_id: string | null;
  rule_name: string | null;
  campaign_id: string;
  campaign_name: string;
  account_id: string;
  reason: string;
  spend_today: number;
  daily_budget: number;
}

export interface SimulationResult {
  success: boolean;
  simulate: true;
  duration_ms: number;
  campaigns_evaluated: number;
  rules_evaluated: number;
  would_fire: SimulationWouldFire[];
  rule_stats: SimulationRuleStat[];
}

export function useSimulateRule() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);

  const simulate = useCallback(async (ruleId: string) => {
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("pacing-controller", {
        body: { simulate: true, simulate_rule_ids: [ruleId] },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? "simulação falhou");
      setResult(data as SimulationResult);
      return data as SimulationResult;
    } catch (err: any) {
      toast.error("Erro ao simular regra", { description: err?.message ?? String(err) });
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, result, simulate, reset: () => setResult(null) };
}
