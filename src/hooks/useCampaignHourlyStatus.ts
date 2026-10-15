import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CampaignHourlyStatus {
  spendLast60mBrl: number;
  salesLast60m: number;
  snapshotAt: string;
  source: string | null;
}

/**
 * Pega o snapshot mais recente de `pacing_campaign_hourly_snapshots` por campanha
 * (escrito pelo `pacing-controller` a cada execução com gasto REAL dos últimos 60 min
 * pela API hourly do Meta).
 *
 * Retorna Map<campaign_id, CampaignHourlyStatus>. Usado pra mostrar progresso vs
 * teto horário (`campaign_hourly_cap`) na CampaignTable.
 */
export function useCampaignHourlyStatus() {
  return useQuery({
    queryKey: ["campaign-hourly-status"],
    queryFn: async () => {
      // Pega snapshots dos últimos 90 min (snapshot_bucket > now - 90m).
      // Múltiplos buckets/campanha — vamos guardar o mais recente.
      const cutoff = new Date(Date.now() - 90 * 60_000).toISOString();
      const { data, error } = await supabase
        .from("pacing_campaign_hourly_snapshots")
        .select("campaign_id, spend_last_60m_brl, sales_last_60m, snapshot_at, source")
        .gte("snapshot_at", cutoff)
        .order("snapshot_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      const map = new Map<string, CampaignHourlyStatus>();
      for (const row of (data ?? []) as any[]) {
        if (!row.campaign_id) continue;
        if (map.has(row.campaign_id)) continue; // primeiro = mais recente
        map.set(row.campaign_id, {
          spendLast60mBrl: Number(row.spend_last_60m_brl ?? 0),
          salesLast60m: Number(row.sales_last_60m ?? 0),
          snapshotAt: row.snapshot_at,
          source: row.source ?? null,
        });
      }
      return map;
    },
    staleTime: 60_000,
    refetchInterval: 120_000, // alinhado com cron do controller (2 min)
  });
}

/**
 * Calcula o teto horário efetivo aplicável à campanha, varrendo regras
 * `campaign_hourly_cap` que casam (matched) com ela. Pega o MENOR teto
 * (mais restritivo = primeiro a disparar).
 *
 * Aceita `maxSpendPerHourBrl` (R$) e `maxPctOfDailyPerHour` (% sobre teto diário).
 */
export function getEffectiveHourlyCap(args: {
  matchedRules: Array<{
    id: string;
    name: string;
    enabled?: boolean;
    trigger?: {
      kind?: string;
      maxSpendPerHourBrl?: number;
      maxPctOfDailyPerHour?: number;
    } | null;
  }>;
  dailyTargetBrl?: number | null;
}): { capBrl: number; ruleName: string } | null {
  const { matchedRules, dailyTargetBrl } = args;
  let best: { capBrl: number; ruleName: string } | null = null;
  for (const r of matchedRules) {
    if (r.enabled === false) continue;
    const t = r.trigger;
    if (!t || t.kind !== "campaign_hourly_cap") continue;
    let cap: number | null = null;
    if (t.maxSpendPerHourBrl && t.maxSpendPerHourBrl > 0) {
      cap = Number(t.maxSpendPerHourBrl);
    } else if (t.maxPctOfDailyPerHour && t.maxPctOfDailyPerHour > 0 && dailyTargetBrl && dailyTargetBrl > 0) {
      cap = (Number(t.maxPctOfDailyPerHour) / 100) * Number(dailyTargetBrl);
    }
    if (cap == null || cap <= 0) continue;
    if (!best || cap < best.capBrl) {
      best = { capBrl: cap, ruleName: r.name };
    }
  }
  return best;
}
