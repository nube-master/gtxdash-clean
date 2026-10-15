import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface EvaluationLogRow {
  id: string;
  rule_id: string | null;
  rule_name: string;
  evaluated_at: string;
  campaigns_matched: number;
  campaigns_fired: number;
  campaigns_blocked: number;
  skip_reason: string | null;
  campaign_ids: string[] | null;
  blocked_details: Array<{ campaignId: string; campaignName: string; reason: string }> | null;
  dry_run: boolean;
}

export interface RuleVitalSigns {
  ruleId: string | null;
  ruleName: string;
  lastEvaluatedAt: string | null;
  evaluationsLastHour: number;
  evaluationsLast24h: number;
  firesLast24h: number;
  matchedLast24h: number;
  blockedLast24h: number;
  topBlockReason: string | null;
  lastSkipReason: string | null;
}

const LOOKBACK_HOURS = 24;

export function usePacingEvaluationLog(options?: { ruleId?: string; campaignId?: string }) {
  const [rows, setRows] = useState<EvaluationLogRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
    let q = (supabase as any)
      .from("pacing_evaluation_log")
      .select("*")
      .gte("evaluated_at", since)
      .order("evaluated_at", { ascending: false })
      .limit(5000);
    if (options?.ruleId) q = q.eq("rule_id", options.ruleId);
    if (options?.campaignId) q = q.contains("campaign_ids", [options.campaignId]);
    const { data, error } = await q;
    if (!error) setRows((data ?? []) as EvaluationLogRow[]);
    setLoading(false);
  }, [options?.ruleId, options?.campaignId]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 60_000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  return { rows, loading, refetch: fetchAll };
}

export function aggregateVitalSigns(rows: EvaluationLogRow[]): RuleVitalSigns[] {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  const byRule = new Map<string, EvaluationLogRow[]>();
  for (const r of rows) {
    const key = r.rule_id ?? r.rule_name;
    const list = byRule.get(key) ?? [];
    list.push(r);
    byRule.set(key, list);
  }
  return Array.from(byRule.entries()).map(([key, list]) => {
    const sorted = [...list].sort(
      (a, b) => new Date(b.evaluated_at).getTime() - new Date(a.evaluated_at).getTime()
    );
    const last = sorted[0];
    const lastHourRows = sorted.filter((r) => new Date(r.evaluated_at).getTime() >= oneHourAgo);
    const blockReasonCount = new Map<string, number>();
    for (const row of sorted) {
      for (const b of row.blocked_details ?? []) {
        blockReasonCount.set(b.reason, (blockReasonCount.get(b.reason) ?? 0) + 1);
      }
    }
    const topBlockReason =
      Array.from(blockReasonCount.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return {
      ruleId: last?.rule_id ?? null,
      ruleName: last?.rule_name ?? key,
      lastEvaluatedAt: last?.evaluated_at ?? null,
      evaluationsLastHour: lastHourRows.length,
      evaluationsLast24h: sorted.length,
      firesLast24h: sorted.reduce((s, r) => s + (r.campaigns_fired ?? 0), 0),
      matchedLast24h: sorted.reduce((s, r) => s + (r.campaigns_matched ?? 0), 0),
      blockedLast24h: sorted.reduce((s, r) => s + (r.campaigns_blocked ?? 0), 0),
      topBlockReason,
      lastSkipReason: last?.skip_reason ?? null,
    };
  });
}
