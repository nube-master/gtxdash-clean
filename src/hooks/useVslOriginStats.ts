import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useExchangeRate } from "@/hooks/useExchangeRate";
import { useOperationId } from "@/contexts/OperationContext";

export type VslOriginRow = {
  ad_id: string;
  total_viewed: number;
  total_started: number;
  total_over_pitch: number;
  total_clicked: number;
  play_rate: number;
  pitch_rate: number;
  vendas: number;
  receita_brl: number;
  spend_brl: number;
  roas: number | null;
};

function periodRange(period: "today" | "yesterday" | "7d"): { start: string; end: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const today = fmt.format(new Date());
  if (period === "today") return { start: today, end: today };
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const yesterday = fmt.format(d);
  if (period === "yesterday") return { start: yesterday, end: yesterday };
  const d7 = new Date();
  d7.setDate(d7.getDate() - 6);
  return { start: fmt.format(d7), end: today };
}

function extractAdIdFromCampaign(name: string): string | null {
  if (!name) return null;
  const m = name.match(/\[([^\]]+)\]/g);
  if (!m || m.length < 2) return null;
  return m[1].replace(/[\[\]]/g, "").trim().toUpperCase();
}

/**
 * Aggregates `vsl_origin_stats` for a given VTurb player + period and joins
 * vendas (sales_data) and spend (creative_traffic_data) by AD ID extracted
 * from the second bracket of utm_campaign / campaign_name.
 */
export function useVslOriginStats(
  vturbPlayerId: string | null | undefined,
  period: "today" | "yesterday" | "7d",
) {
  const { start, end } = periodRange(period);
  const usdToBrl = useExchangeRate();
  const opId = useOperationId();

  return useQuery({
    queryKey: ["vsl-origin-stats", vturbPlayerId, start, end, opId],
    enabled: !!vturbPlayerId,
    queryFn: async (): Promise<VslOriginRow[]> => {
      // 1) Player row
      const { data: player } = await supabase
        .from("vsl_players")
        .select("id, vturb_player_id")
        .eq("vturb_player_id", vturbPlayerId!)
        .maybeSingle();
      if (!player) return [];

      // 2) Aggregated VTurb stats per ad_id within range
      const { data: statsRows, error: statsErr } = await supabase
        .from("vsl_origin_stats")
        .select("ad_id, total_viewed, total_started, total_over_pitch, total_clicked")
        .eq("vsl_player_id", player.id)
        .gte("data_capturada", start)
        .lte("data_capturada", end);
      if (statsErr) throw statsErr;

      const byAd = new Map<string, VslOriginRow>();
      for (const r of statsRows || []) {
        const adId = String(r.ad_id || "?").toUpperCase();
        if (!byAd.has(adId)) {
          byAd.set(adId, {
            ad_id: adId,
            total_viewed: 0,
            total_started: 0,
            total_over_pitch: 0,
            total_clicked: 0,
            play_rate: 0,
            pitch_rate: 0,
            vendas: 0,
            receita_brl: 0,
            spend_brl: 0,
            roas: null,
          });
        }
        const g = byAd.get(adId)!;
        g.total_viewed += r.total_viewed || 0;
        g.total_started += r.total_started || 0;
        g.total_over_pitch += r.total_over_pitch || 0;
        g.total_clicked += r.total_clicked || 0;
      }
      for (const g of byAd.values()) {
        g.play_rate = g.total_viewed > 0 ? (g.total_started / g.total_viewed) * 100 : 0;
        g.pitch_rate = g.total_started > 0 ? (g.total_over_pitch / g.total_started) * 100 : 0;
      }

      if (byAd.size === 0) return [];

      // 3) Vendas — sales_data + redtrack_events (cross by ad_id in utm_campaign 2nd bracket)
      let salesQ = supabase
        .from("sales_data")
        .select("revenue, utm_campaign, status")
        .gte("date", start)
        .lte("date", end);
      if (opId) salesQ = salesQ.eq("operation_id", opId);
      const { data: sales } = await salesQ;
      for (const s of sales || []) {
        if (s.status && s.status !== "approved") continue;
        const adId = extractAdIdFromCampaign(s.utm_campaign || "");
        if (!adId) continue;
        const g = byAd.get(adId);
        if (!g) continue;
        g.vendas += 1;
        g.receita_brl += Number(s.revenue || 0);
      }

      // 4) Spend — via RPC normalizada (mesma fonte do módulo Creatives)
      const params: any = { p_start_date: start, p_end_date: end };
      if (opId) params.p_operation_id = opId;
      const { data: trafficRows } = await (supabase as any).rpc("get_creative_traffic_normalized_sp", params);

      // Currency map
      const accIds = Array.from(new Set(((trafficRows as any[]) || []).map((t: any) => t.account_id).filter(Boolean)));
      const currencyMap = new Map<string, string>();
      if (accIds.length > 0) {
        let accQ = (supabase as any).from("meta_ad_accounts").select("account_id, currency").in("account_id", accIds);
        if (opId) accQ = accQ.eq("operation_id", opId);
        const { data: accs } = await accQ;
        for (const a of (accs as any[]) || []) currencyMap.set(a.account_id, a.currency || "BRL");
      }

      for (const t of (trafficRows as any[]) || []) {
        const adId = extractAdIdFromCampaign(t.campaign_name || "");
        if (!adId) continue;
        const g = byAd.get(adId);
        if (!g) continue;
        const raw = Number(t.total_spend || 0);
        const cur = currencyMap.get(t.account_id) || "BRL";
        g.spend_brl += cur === "USD" ? raw * usdToBrl : raw;
      }

      for (const g of byAd.values()) {
        g.roas = g.spend_brl > 0 ? g.receita_brl / g.spend_brl : null;
      }

      return Array.from(byAd.values()).sort((a, b) => b.total_viewed - a.total_viewed);
    },
    staleTime: 60_000,
  });
}
