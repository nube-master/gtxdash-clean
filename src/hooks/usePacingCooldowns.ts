import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PacingCooldown {
  campaignId: string;
  snoozedUntil: string; // ISO
  ruleId: string | null;
  reason: string | null;
  setBy: 'manual' | 'rule' | string | null;
}

/**
 * Cooldowns ATIVOS (snoozed_until > now).
 * O `pacing-controller` cria uma linha em `pacing_cooldowns` toda vez que pausa
 * uma campanha por uma regra (campaign_hourly_cap, group_hourly_cap, etc.) e
 * remove no smart-reenable. Usamos isso pra mostrar contagem regressiva e
 * horário previsto de religar.
 */
export function usePacingCooldowns() {
  return useQuery({
    queryKey: ["pacing-cooldowns-active"],
    queryFn: async () => {
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from("pacing_cooldowns")
        .select("campaign_id, snoozed_until, rule_id, reason, set_by")
        .gt("snoozed_until", nowIso)
        .order("snoozed_until", { ascending: true })
        .limit(2000);
      if (error) throw error;
      const map = new Map<string, PacingCooldown>();
      for (const row of (data ?? []) as any[]) {
        if (!row.campaign_id) continue;
        const cur = map.get(row.campaign_id);
        if (cur && new Date(cur.snoozedUntil).getTime() >= new Date(row.snoozed_until).getTime()) continue;
        map.set(row.campaign_id, {
          campaignId: row.campaign_id,
          snoozedUntil: row.snoozed_until,
          ruleId: row.rule_id ?? null,
          reason: row.reason ?? null,
          setBy: row.set_by ?? null,
        });
      }
      return map;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/** Formata diferença em "Xm Ys" / "Xh Ym" pra contagem regressiva curta. */
export function formatCooldownRemaining(snoozedUntilIso: string, now: number = Date.now()): string {
  const diffMs = new Date(snoozedUntilIso).getTime() - now;
  if (diffMs <= 0) return "expirando…";
  const totalSec = Math.floor(diffMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

/** Hora prevista de religar no formato HH:mm BRT. */
export function formatResumeTimeBRT(snoozedUntilIso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(snoozedUntilIso));
}
