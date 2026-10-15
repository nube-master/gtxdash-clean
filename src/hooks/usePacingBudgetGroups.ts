import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  dbToBudgetGroup,
  budgetGroupToDbPayload,
  type DbBudgetGroup,
} from "@/components/pacing/dbAdapters";
import type { BudgetGroup } from "@/components/pacing/mockData";
import { useOperationId } from "@/contexts/OperationContext";
import { shouldSkipRtPayload } from "@/lib/realtimeTenantGuard";

const TABLE = "pacing_budget_groups";

export function usePacingBudgetGroups() {
  const [groups, setGroups] = useState<BudgetGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from(TABLE)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Erro ao carregar grupos", { description: error.message });
      setLoading(false);
      return;
    }
    setGroups((data as DbBudgetGroup[]).map(dbToBudgetGroup));
    setLoading(false);
  }, []);

  const operationId = useOperationId();

  useEffect(() => {
    if (!operationId) return;
    fetchAll();
    const ch = (supabase as any)
      .channel(`pacing-budget-groups-rt-${operationId}`)
      .on(
        "postgres_changes",
        { 
          event: "*", 
          schema: "public", 
          table: TABLE,
          filter: `operation_id=eq.${operationId}`
        },
        (payload: any) => {
          if (shouldSkipRtPayload(payload, operationId, "usePacingBudgetGroups")) return;
          if (payload.eventType === "INSERT") {
            setGroups((p) =>
              p.some((g) => g.id === payload.new.id) ? p : [dbToBudgetGroup(payload.new), ...p]
            );
          } else if (payload.eventType === "UPDATE") {
            setGroups((p) =>
              p.map((g) => (g.id === payload.new.id ? dbToBudgetGroup(payload.new) : g))
            );
          } else if (payload.eventType === "DELETE") {
            setGroups((p) => p.filter((g) => g.id !== payload.old.id));
          }
        }
      )
      .subscribe();
    return () => {
      (supabase as any).removeChannel(ch);
    };
  }, [fetchAll, operationId]);

  // Monta payload da pacing_rules espelho que liga o grupo ao motor (controller).
  // Sem isso, o grupo fica órfão — o controller só avalia quando existe
  // pacing_rules.budget_group_id apontando pra ele.
  const buildLinkedRulePayload = (g: BudgetGroup, groupId: string) => {
    const actionKind =
      g.action === "alert_only" ? "alert_only" : "pause"; // pause_all/pause_overpacing => pause
    return {
      name: `[GROUP] ${g.name}`,
      description: `Regra auto-gerada pelo grupo "${g.name}". Não edite manualmente.`,
      budget_group_id: groupId,
      enabled: true,
      dry_run: false,
      filter_config: {
        nameContains: g.matcher.nameContains ?? "",
        projects: g.matcher.projects ?? [],
        account: g.matcher.account ?? "all",
        phases: g.matcher.phases ?? [],
        minBudget: 0,
      },
      trigger_config: {
        kind: "group_hourly_cap",
        groupId,
      },
      action_config: {
        kind: actionKind,
        cooldownMin: g.cooldownMin ?? 60,
        groupMode: g.action, // pause_all | pause_overpacing | alert_only (preservado p/ futuro)
        autoResume: false,
        reducePct: 0,
      },
      notification_config: {
        pushcut: !!g.pushcut,
        severity: g.severity ?? "medium",
      },
    };
  };

  const createGroup = useCallback(async (g: BudgetGroup) => {
    const tmpId = `tmp-${Date.now()}`;
    setGroups((p) => [{ ...g, id: tmpId }, ...p]);
    const { data, error } = await (supabase as any)
      .from(TABLE)
      .insert(budgetGroupToDbPayload(g))
      .select()
      .single();
    if (error) {
      setGroups((p) => p.filter((x) => x.id !== tmpId));
      toast.error("Erro ao criar grupo", { description: error.message });
      return null;
    }
    setGroups((p) => p.map((x) => (x.id === tmpId ? dbToBudgetGroup(data) : x)));

    // Cria regra-espelho ligando o grupo ao motor
    const { error: ruleErr } = await (supabase as any)
      .from("pacing_rules")
      .insert(buildLinkedRulePayload(g, data.id));
    if (ruleErr) {
      toast.warning(`Grupo "${g.name}" criado, mas regra-espelho falhou`, {
        description: `${ruleErr.message}. O motor não vai avaliar o grupo até a regra ser criada.`,
      });
    } else {
      toast.success(`Grupo "${g.name}" criado e ligado ao motor (cron 2 min)`);
    }
    return data;
  }, []);

  const updateGroup = useCallback(async (id: string, g: BudgetGroup) => {
    setGroups((p) => p.map((x) => (x.id === id ? { ...g, id } : x)));
    const { error } = await (supabase as any)
      .from(TABLE)
      .update(budgetGroupToDbPayload(g))
      .eq("id", id);
    if (error) {
      toast.error("Erro ao salvar grupo", { description: error.message });
      fetchAll();
      return;
    }

    // Sincroniza regra-espelho (upsert por budget_group_id)
    const payload = buildLinkedRulePayload(g, id);
    const { data: existing } = await (supabase as any)
      .from("pacing_rules")
      .select("id")
      .eq("budget_group_id", id)
      .maybeSingle();
    if (existing?.id) {
      await (supabase as any).from("pacing_rules").update(payload).eq("id", existing.id);
    } else {
      await (supabase as any).from("pacing_rules").insert(payload);
    }
    toast.success(`Grupo "${g.name}" atualizado`);
  }, [fetchAll]);

  const deleteGroup = useCallback(async (id: string) => {
    const prev = groups;
    setGroups((p) => p.filter((g) => g.id !== id));
    // Remove regra-espelho primeiro (FK pode ou não estar configurada)
    await (supabase as any).from("pacing_rules").delete().eq("budget_group_id", id);
    const { error } = await (supabase as any).from(TABLE).delete().eq("id", id);
    if (error) {
      setGroups(prev);
      toast.error("Erro ao deletar grupo");
    }
  }, [groups]);

  return { groups, loading, createGroup, updateGroup, deleteGroup, refetch: fetchAll };
}
