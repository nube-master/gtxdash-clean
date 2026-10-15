import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOperation } from "@/contexts/OperationContext";
import { fetchAllPaginated } from "@/lib/fetchAllPaginated";
import type { PacingRuleV2, RuleScope } from "@/components/pacing/mockData";

interface CampaignRow {
  operation_id: string | null;
  campaign_id: string;
  campaign_name: string;
  account_id: string;
  account_name: string | null;
  effective_status: string;
  daily_budget: number | null;
}

/**
 * Conta, para cada regra, quantas campanhas reais atendem o escopo.
 * Espera a operação carregar antes de consultar, para não travar em zero no refresh.
 */
export function usePacingRuleMatchCounts(rules: PacingRuleV2[]): Record<string, number> {
  const { operationId, loading: operationLoading } = useOperation();
  const [campaigns, setCampaigns] = useState<CampaignRow[] | null>(null);

  const operationIds = useMemo(() => {
    if (operationId) return [operationId];
    return Array.from(
      new Set(
        rules
          .map((rule) => rule.operationId)
          .filter((id): id is string => typeof id === "string" && id.length > 0)
      )
    ).sort();
  }, [operationId, rules]);

  useEffect(() => {
    if (operationLoading) return;

    if (operationIds.length === 0) {
      setCampaigns([]);
      return;
    }

    let cancelled = false;
    setCampaigns(null);

    const loadCampaigns = async () => {
      try {
        const { data: accts, error: accountsError } = await supabase
          .from("meta_ad_accounts")
          .select("operation_id, account_id, account_name")
          .in("operation_id", operationIds);

        if (accountsError) throw accountsError;

        const accountNameById = new Map<string, string>(
          (accts ?? []).map((a) => [`${a.operation_id}:${a.account_id}`, a.account_name ?? a.account_id])
        );

        const data = await fetchAllPaginated<any>(
          "meta_campaign_status",
          "operation_id, campaign_id, campaign_name, account_id, effective_status, daily_budget",
          (q) =>
            q
              .in("operation_id", operationIds)
              .in("effective_status", ["ACTIVE", "PAUSED"]),
          "campaign_id",
          true,
        );

        if (!cancelled) {
          setCampaigns(((data ?? []) as any[]).map((r) => ({
            operation_id: r.operation_id,
            campaign_id: r.campaign_id,
            campaign_name: r.campaign_name,
            account_id: r.account_id,
            account_name: accountNameById.get(`${r.operation_id}:${r.account_id}`) ?? null,
            effective_status: r.effective_status,
            daily_budget: r.daily_budget,
          })));
        }
      } catch (error) {
        console.error("[usePacingRuleMatchCounts] failed to load campaigns", error);
        if (!cancelled) setCampaigns([]);
      }
    };

    loadCampaigns();

    return () => {
      cancelled = true;
    };
  }, [operationIds, operationLoading]);

  return useMemo(() => {
    if (campaigns === null) return {};

    const counts: Record<string, number> = {};
    for (const rule of rules) {
      counts[rule.id] = countMatches(rule.scope, campaigns, operationId ?? rule.operationId ?? null);
    }
    return counts;
  }, [rules, campaigns, operationId]);
}

function countMatches(scope: RuleScope, campaigns: CampaignRow[], ruleOperationId: string | null): number {
  const appliesTo = scope.appliesTo ?? "active";
  const projects = scope.projects ?? [];
  const phases = scope.phases ?? [];

  return campaigns.filter((c) => {
    if (ruleOperationId && c.operation_id !== ruleOperationId) return false;

    if (appliesTo === "active" && c.effective_status !== "ACTIVE") return false;
    if (appliesTo === "paused" && c.effective_status !== "PAUSED") return false;

    const name = (c.campaign_name ?? "").toLowerCase();

    if (scope.nameContains && !name.includes(scope.nameContains.toLowerCase())) return false;

    if (projects.length > 0) {
      const matched = projects.some((p) => name.includes(String(p).toLowerCase()));
      if (!matched) return false;
    }

    if (phases.length > 0) {
      const matched = phases.some((p) => name.includes(`-${String(p).toLowerCase()}-`));
      if (!matched) return false;
    }

    if (scope.account && scope.account !== "all") {
      if ((c.account_name ?? "") !== scope.account) return false;
    }

    if (scope.minBudget > 0) {
      const budgetReais = Number(c.daily_budget ?? 0) / 100;
      if (budgetReais < scope.minBudget) return false;
    }

    return true;
  }).length;
}