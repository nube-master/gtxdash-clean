import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePacingDateRange } from "@/contexts/PacingDateRangeContext";

/**
 * Normaliza nome de campanha (mesma lógica do SQL normalize_campaign_key).
 * Remove sufixos como " — Cópia", " - top", " (2)", colapsa espaços.
 */
export function normalizePacingCampaignName(p: string | null | undefined): string {
  if (!p) return "";
  let s = String(p).toLowerCase();
  // remove " — Cópia / Copy [N]" no final
  s = s.replace(/\s*(?:—|-|–)\s*(?:c[oó]pia|copy)(?:\s*\(?\d+\)?)?\s*$/i, "");
  // remove " — top|xxx|old|kill|test|teste ..." (consome tudo dali pra frente)
  s = s.replace(/\s*(?:—|-|–)\s*(?:top|xxx|old|kill|test|teste)\b.*$/i, "");
  // remove " (N)" trailing
  s = s.replace(/\s*\(\s*\d+\s*\)\s*$/i, "");
  // colapsa espaços
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

export type PacingICMaps = {
  byMetaId: Map<string, number>;
  byNormalizedName: Map<string, number>;
};

/**
 * Retorna o nº de ICs atribuíveis a uma campanha — tenta primeiro pelo
 * meta_campaign_id (match exato) e, se zero, faz fallback pelo nome
 * normalizado (cobre clones cujo ID não bate com o local).
 */
export function getIcCount(
  maps: PacingICMaps | undefined,
  campaign: { id: string; name: string },
): number {
  if (!maps) return 0;
  const byId = maps.byMetaId.get(campaign.id) ?? 0;
  if (byId > 0) return byId;
  const key = normalizePacingCampaignName(campaign.name);
  return key ? (maps.byNormalizedName.get(key) ?? 0) : 0;
}

/**
 * Conta InitiateCheckouts no intervalo BRT, agrupando por:
 *  - meta_campaign_id (match exato com a campanha da Meta)
 *  - normalized(utm_campaign) (fallback p/ clones cujo ID não existe local)
 */
export function usePacingICs() {
  const { startDate, endDate, isToday } = usePacingDateRange();
  return useQuery<PacingICMaps>({
    queryKey: ["pacing-ics-by-campaign-v2", startDate, endDate],
    queryFn: async () => {
      const start = new Date(`${startDate}T03:00:00.000Z`);
      const endExclusive = new Date(`${endDate}T03:00:00.000Z`);
      endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

      const byMetaId = new Map<string, number>();
      const byNormalizedName = new Map<string, number>();
      const PAGE = 1000;
      for (let from = 0; from < 100_000; from += PAGE) {
        const { data, error } = await supabase
          .from("redtrack_events")
          .select("meta_campaign_id, utm_campaign")
          .eq("event_type", "initiate_checkout")
          .gte("occurred_at", start.toISOString())
          .lt("occurred_at", endExclusive.toISOString())
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const rows = (data ?? []) as Array<{ meta_campaign_id: string | null; utm_campaign: string | null }>;
        for (const r of rows) {
          if (r.meta_campaign_id) {
            byMetaId.set(r.meta_campaign_id, (byMetaId.get(r.meta_campaign_id) ?? 0) + 1);
          }
          const key = normalizePacingCampaignName(r.utm_campaign);
          if (key) {
            byNormalizedName.set(key, (byNormalizedName.get(key) ?? 0) + 1);
          }
        }
        if (rows.length < PAGE) break;
      }
      return { byMetaId, byNormalizedName };
    },
    refetchInterval: isToday ? 60_000 : 300_000,
    staleTime: 30_000,
  });
}
