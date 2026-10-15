import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  dbToRule,
  ruleToDbPayload,
  type DbRule,
} from "@/components/pacing/dbAdapters";
import type { PacingRuleV2 } from "@/components/pacing/mockData";
import { useOperationId } from "@/contexts/OperationContext";
import { shouldSkipRtPayload } from "@/lib/realtimeTenantGuard";

const TABLE = "pacing_rules";

export function usePacingRules() {
  const [rules, setRules] = useState<PacingRuleV2[]>([]);
  const [loading, setLoading] = useState(true);
  const operationId = useOperationId();

  const fetchAll = useCallback(async () => {
    let q = (supabase as any)
      .from(TABLE)
      .select("*")
      .order("created_at", { ascending: false });
    // Tenant isolation: sempre filtra por operação ativa no client
    // (não depende do RLS — Super Admin pode ter bypass legacy).
    if (operationId) q = q.eq("operation_id", operationId);
    const { data, error } = await q;
    if (error) {
      toast.error("Erro ao carregar regras", { description: error.message });
      setLoading(false);
      return;
    }
    setRules((data as DbRule[]).map(dbToRule));
    setLoading(false);
  }, [operationId]);

  useEffect(() => {
    // Reset ao trocar de operação para evitar flash de dados da op anterior
    setRules([]);
    setLoading(true);
    fetchAll();
    const ch = (supabase as any)
      .channel(`pacing-rules-rt-${operationId ?? "none"}`)
      .on(
        "postgres_changes",
        { 
          event: "*", 
          schema: "public", 
          table: TABLE,
          filter: `operation_id=eq.${operationId}`
        },
        (payload: any) => {
          if (shouldSkipRtPayload(payload, operationId, "usePacingRules")) return;
          // Guard extra: só aceita payload da operação atual
          const rowOp = (payload.new?.operation_id ?? payload.old?.operation_id) as string | null | undefined;
          if (operationId && rowOp && rowOp !== operationId) return;
          if (payload.eventType === "INSERT") {
            setRules((prev) => {
              if (prev.some((r) => r.id === payload.new.id)) return prev;
              return [dbToRule(payload.new), ...prev];
            });
          } else if (payload.eventType === "UPDATE") {
            setRules((prev) =>
              prev.map((r) => (r.id === payload.new.id ? dbToRule(payload.new) : r))
            );
          } else if (payload.eventType === "DELETE") {
            setRules((prev) => prev.filter((r) => r.id !== payload.old.id));
          }
        }
      )
      .subscribe();
    return () => {
      (supabase as any).removeChannel(ch);
    };
  }, [fetchAll, operationId]);

  const createRule = useCallback(async (rule: PacingRuleV2) => {
    if (!operationId) {
      toast.error("Selecione uma operação antes de criar regras");
      return null;
    }
    const ruleWithOp: PacingRuleV2 = { ...rule, operationId };
    const optimistic: PacingRuleV2 = { ...ruleWithOp, id: `tmp-${Date.now()}` };
    setRules((p) => [optimistic, ...p]);
    const payload = { ...ruleToDbPayload(ruleWithOp), operation_id: operationId };
    const { data, error } = await (supabase as any)
      .from(TABLE)
      .insert(payload)
      .select()
      .single();
    if (error) {
      setRules((p) => p.filter((r) => r.id !== optimistic.id));
      toast.error("Erro ao criar regra", { description: error.message });
      return null;
    }
    setRules((p) => p.map((r) => (r.id === optimistic.id ? dbToRule(data) : r)));
    toast.success(`Regra "${rule.name}" criada`);
    return data;
  }, [operationId]);

  const updateRule = useCallback(async (id: string, patch: Partial<PacingRuleV2>) => {
    setRules((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r))); // optimistic
    const current = rules.find((r) => r.id === id);
    const merged = { ...current, ...patch } as PacingRuleV2;
    const { error } = await (supabase as any)
      .from(TABLE)
      .update(ruleToDbPayload(merged))
      .eq("id", id);
    if (error) {
      toast.error("Erro ao salvar regra", { description: error.message });
      fetchAll();
    }
  }, [rules, fetchAll]);

  const toggleEnabled = useCallback(async (id: string, enabled: boolean) => {
    setRules((p) => p.map((r) => (r.id === id ? { ...r, enabled } : r)));
    const { error } = await (supabase as any)
      .from(TABLE)
      .update({ enabled })
      .eq("id", id);
    if (error) {
      toast.error("Erro ao alternar regra");
      fetchAll();
    } else {
      toast.success(`Regra ${enabled ? "ativada" : "pausada"}`);
    }
  }, [fetchAll]);

  const deleteRule = useCallback(async (id: string) => {
    const prev = rules;
    setRules((p) => p.filter((r) => r.id !== id));
    const { error } = await (supabase as any).from(TABLE).delete().eq("id", id);
    if (error) {
      setRules(prev);
      toast.error("Erro ao deletar regra", { description: error.message });
    }
  }, [rules]);

  return { rules, loading, createRule, updateRule, toggleEnabled, deleteRule, refetch: fetchAll };
}
