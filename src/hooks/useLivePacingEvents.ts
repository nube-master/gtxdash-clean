import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { PacingEvent } from "@/components/pacing/mockData";
import { useOperationId } from "@/contexts/OperationContext";
import { shouldSkipRtPayload } from "@/lib/realtimeTenantGuard";

type DbRow = {
  id: string;
  triggered_at: string;
  action_type: "pause" | "resume" | "alert" | "reduce_budget" | "snooze";
  campaign_name: string;
  reason: string;
  rule_id: string | null;
  dry_run: boolean;
  success: boolean | null;
};

const ACTION_TO_TYPE: Record<DbRow["action_type"], PacingEvent["type"]> = {
  pause: "pause",
  resume: "resume",
  reduce_budget: "scale",
  alert: "alert",
  snooze: "warm",
};

function mapRow(r: DbRow, ruleNameById?: Map<string, string>): PacingEvent {
  const ruleName = r.rule_id ? ruleNameById?.get(r.rule_id) : undefined;
  const prefix = r.dry_run ? "[DRY] " : r.success === false ? "[FALHOU] " : "";
  return {
    id: r.id,
    ts: r.triggered_at,
    type: ACTION_TO_TYPE[r.action_type] ?? "alert",
    message: prefix + (r.reason || r.action_type),
    campaign: r.campaign_name,
    rule: ruleName,
  };
}

export function useLivePacingEvents(opts?: { campaignName?: string; limit?: number; ruleNameById?: Map<string, string> }) {
  const { campaignName, limit = 50, ruleNameById } = opts ?? {};
  const [events, setEvents] = useState<PacingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const operationId = useOperationId();

  const fetchAll = useCallback(async () => {
    let q: any = (supabase as any)
      .from("pacing_action_log")
      .select("id, triggered_at, action_type, campaign_name, reason, rule_id, dry_run, success")
      .order("triggered_at", { ascending: false })
      .limit(limit);
    if (campaignName) q = q.eq("campaign_name", campaignName);
    if (operationId) q = q.eq("operation_id", operationId);
    const { data, error } = await q;
    if (!error && data) setEvents((data as DbRow[]).map((r) => mapRow(r, ruleNameById)));
    setLoading(false);
  }, [campaignName, limit, ruleNameById, operationId]);

  useEffect(() => {
    if (!operationId) return;
    fetchAll();
    const ch = (supabase as any)
      .channel(`live-pacing-events-${operationId}`)
      .on(
        "postgres_changes",
        { 
          event: "INSERT", 
          schema: "public", 
          table: "pacing_action_log",
          filter: `operation_id=eq.${operationId}`
        },
        (payload: any) => {
          if (shouldSkipRtPayload(payload, operationId, "useLivePacingEvents")) return;
          const row = payload.new as DbRow;
          if (campaignName && row.campaign_name !== campaignName) return;
          setEvents((prev) => [mapRow(row, ruleNameById), ...prev].slice(0, limit));
        }
      )
      .subscribe();
    return () => {
      (supabase as any).removeChannel(ch);
    };
  }, [fetchAll, campaignName, limit, ruleNameById, operationId]);

  return { events, loading, refetch: fetchAll };
}
