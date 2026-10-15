import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOperation } from "@/contexts/OperationContext";
import { PROJECT_SLUGS, type ProjectSlug, type RulePhase, type RuleAppliesTo } from "@/components/pacing/mockData";

export interface PacingScopeFilter {
  nameContains: string;
  projects: ProjectSlug[];
  account: string; // "all" or account_name
  phases: RulePhase[];
  minBudget: number; // R$
  appliesTo: RuleAppliesTo;
  minSpendYesterdayBrl?: number; // R$
}

export interface PacingScopePreview {
  count: number;
  loading: boolean;
  error: string | null;
  /** "ativas" | "pausadas" | "no total" — para usar no texto */
  label: string;
  /** Amostra de nomes de campanhas que batem com o escopo (até 200). */
  sampleNames: string[];
}

// Meta retorna daily_budget em centavos (minor units). Convertendo para a moeda da conta (R$ aproximado).
const budgetMajor = (raw: number | null | undefined) => Number(raw ?? 0) / 100;

const labelFor = (a: RuleAppliesTo) =>
  a === "active" ? "ativas" : a === "paused" ? "pausadas" : "no total";

/**
 * Conta campanhas reais (meta_campaign_status) que batem com o escopo.
 * Debounce de 400ms p/ não martelar o banco enquanto o usuário digita.
 */
export function usePacingScopePreview(filter: PacingScopeFilter, enabled = true): PacingScopePreview {
  const { operationId } = useOperation();
  const [state, setState] = useState<PacingScopePreview>({
    count: 0,
    loading: false,
    error: null,
    label: labelFor(filter.appliesTo),
    sampleNames: [],
  });

  const key = JSON.stringify({ ...filter, operationId, enabled });

  useEffect(() => {
    if (!enabled) return;
    if (!operationId) {
      setState({ count: 0, loading: false, error: null, label: labelFor(filter.appliesTo), sampleNames: [] });
      return;
    }

    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null, label: labelFor(filter.appliesTo) }));

    const t = setTimeout(async () => {
      try {
        // 1) Resolve account_ids do tenant (e do filtro de conta, se houver).
        let accountsQ = supabase
          .from("meta_ad_accounts")
          .select("account_id, account_name")
          .eq("operation_id", operationId)
          .eq("is_active", true);
        if (filter.account && filter.account !== "all") {
          accountsQ = accountsQ.eq("account_name", filter.account);
        }
        const { data: accts, error: acctErr } = await accountsQ;
        if (acctErr) throw acctErr;
        const accountIds = (accts ?? []).map((a) => a.account_id);
        if (accountIds.length === 0) {
          if (!cancelled) setState({ count: 0, loading: false, error: null, label: labelFor(filter.appliesTo), sampleNames: [] });
          return;
        }

        const needsYesterdayFilter =
          typeof filter.minSpendYesterdayBrl === "number" && filter.minSpendYesterdayBrl > 0;

        // Sempre pede count exato + amostra de nomes (limite 200) na mesma query.
        let q = supabase
          .from("meta_campaign_status")
          .select("campaign_id, campaign_name, effective_status, daily_budget", { count: "exact" })
          .eq("operation_id", operationId)
          .in("account_id", accountIds);

        if (filter.appliesTo === "active") {
          q = q.eq("effective_status", "ACTIVE");
        } else if (filter.appliesTo === "paused") {
          q = q.eq("effective_status", "PAUSED");
        } else {
          q = q.in("effective_status", ["ACTIVE", "PAUSED"]);
        }

        if (filter.nameContains.trim()) {
          q = q.ilike("campaign_name", `%${filter.nameContains.trim()}%`);
        }

        // Substring match — aceita qualquer slug (hardcoded ou dinâmico via offers.apelido_interno).
        if (filter.projects.length > 0) {
          const cleanSlugs = filter.projects
            .map((p) => String(p).trim())
            .filter((p) => p.length >= 2);
          if (cleanSlugs.length) {
            const esc = (s: string) => s.replace(/[,()]/g, "");
            const orExpr = cleanSlugs.map((s) => `campaign_name.ilike.%${esc(s)}%`).join(",");
            q = q.or(orExpr);
          }
        }

        if (filter.phases.length > 0) {
          const orExpr = filter.phases.map((p) => `campaign_name.ilike.%-${p}-%`).join(",");
          q = q.or(orExpr);
        }

        if (filter.minBudget > 0) {
          q = q.gte("daily_budget", filter.minBudget * 100);
        }

        // Sem filtro de "spend ontem": count exato + até 200 nomes ordenados alfabeticamente.
        if (!needsYesterdayFilter) {
          const { data, count, error } = await q
            .order("campaign_name", { ascending: true })
            .limit(200);
          if (error) throw error;
          const names = Array.from(
            new Set(((data ?? []) as Array<{ campaign_name: string }>).map((r) => r.campaign_name).filter(Boolean)),
          );
          if (!cancelled) {
            setState({
              count: count ?? names.length,
              loading: false,
              error: null,
              label: labelFor(filter.appliesTo),
              sampleNames: names,
            });
          }
          return;
        }

        // Com filtro de spend ontem: pega candidatos e intersecta com traffic_data.
        const { data: candidates, error: candErr } = await q.limit(5000);
        if (candErr) throw candErr;
        const rows = ((candidates ?? []) as any[]) as Array<{ campaign_name: string }>;
        if (rows.length === 0) {
          if (!cancelled) setState({ count: 0, loading: false, error: null, label: labelFor(filter.appliesTo), sampleNames: [] });
          return;
        }

        const now = new Date();
        const brtMs = now.getTime() - 3 * 3600_000;
        const ydayBRT = new Date(brtMs - 24 * 3600_000).toISOString().slice(0, 10);

        const candidateNames = Array.from(new Set(rows.map((r) => r.campaign_name)));
        const okNames = new Set<string>();
        for (let i = 0; i < candidateNames.length; i += 200) {
          const slice = candidateNames.slice(i, i + 200);
          const { data: td, error: tdErr } = await supabase
            .from("traffic_data")
            .select("campaign_name, spend:spend_brl")
            .eq("date", ydayBRT)
            .in("account_id", accountIds)
            .in("campaign_name", slice)
            .gte("spend", filter.minSpendYesterdayBrl!);
          if (tdErr) throw tdErr;
          for (const r of (td ?? []) as Array<{ campaign_name: string; spend: number }>) {
            if (Number(r.spend ?? 0) >= filter.minSpendYesterdayBrl!) okNames.add(r.campaign_name);
          }
        }
        const finalNames = candidateNames.filter((n) => okNames.has(n)).sort();
        if (!cancelled) {
          setState({
            count: finalNames.length,
            loading: false,
            error: null,
            label: labelFor(filter.appliesTo),
            sampleNames: finalNames.slice(0, 200),
          });
        }
        return;
      } catch (e) {
        if (!cancelled) {
          setState({
            count: 0,
            loading: false,
            error: e instanceof Error ? e.message : "Erro ao buscar campanhas",
            label: labelFor(filter.appliesTo),
            sampleNames: [],
          });
        }
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Mantém budgetMajor exportado p/ futura UX (ex: mostrar soma de budgets).
  void budgetMajor;

  return state;
}
