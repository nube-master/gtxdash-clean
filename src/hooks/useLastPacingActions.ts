import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface LastPacingAction {
  campaign_id: string;
  rule_id: string | null;
  rule_name: string | null;
  action_type: string;
  reason: string | null;
  triggered_at: string;
  dry_run: boolean;
  success: boolean;
}

/**
 * Última ação de pacing por campanha nas últimas 24h.
 * Retorna Map<campaign_id, LastPacingAction>.
 */
export function useLastPacingActions() {
  return useQuery({
    queryKey: ["last-pacing-actions-24h"],
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await (supabase as any)
        .from("pacing_action_log")
        .select("campaign_id, rule_id, action_type, reason, triggered_at, dry_run, success")
        .gte("triggered_at", since)
        .order("triggered_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      const rows = (data ?? []) as any[];
      // Carrega nomes das regras envolvidas
      const ruleIds = Array.from(new Set(rows.map((r) => r.rule_id).filter(Boolean)));
      const ruleNames = new Map<string, string>();
      if (ruleIds.length > 0) {
        const { data: rData } = await (supabase as any)
          .from("pacing_rules")
          .select("id, name")
          .in("id", ruleIds);
        for (const r of (rData ?? []) as any[]) ruleNames.set(r.id, r.name);
      }
      const map = new Map<string, LastPacingAction>();
      for (const row of rows) {
        if (!row.campaign_id) continue;
        if (map.has(row.campaign_id)) continue; // mais recente já registrada
        map.set(row.campaign_id, {
          campaign_id: row.campaign_id,
          rule_id: row.rule_id,
          rule_name: row.rule_id ? ruleNames.get(row.rule_id) ?? null : null,
          action_type: row.action_type,
          reason: row.reason,
          triggered_at: row.triggered_at,
          dry_run: !!row.dry_run,
          success: !!row.success,
        });
      }
      return map;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}
