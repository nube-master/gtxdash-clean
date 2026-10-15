import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperation } from "@/contexts/OperationContext";
import { mapVslToProject } from "@/lib/vslProjectMapping";

export type VslProject = "ALL" | "NDM" | "ERX" | "GLP" | "CRT" | "LDR" | "NDR" | "NEURO";

export interface MetaCampaignBreakdown {
  campaign_name: string;
  /** Meta campaign_id quando resolvido via meta_campaign_status */
  campaign_id: string | null;
  spend_brl: number;
  clicks: number;
  impressions: number;
  /** Vendas reais cruzadas via RedTrack (utm_campaign == campaign_name) */
  rt_sales: number;
  rt_revenue_brl: number;
  /** ROI = receita RT / spend Meta */
  roi: number;
}

export interface VslUtmBreakdown {
  utm_campaign: string;
  /** Meta campaign ID extraído do grouped_field (autoritativo p/ cruzamento) */
  meta_campaign_id: string | null;
  /** Nome da campanha Meta resolvido via meta_campaign_status (null = órfã) */
  meta_campaign_name: string | null;
  /** Spend BRL EXATO da campanha Meta (cruzamento 1:1 por campaign_id). 0 se órfã. */
  meta_spend_brl: number;
  /** True quando UTM tem meta_campaign_id mas não casou em meta_campaign_status (campanha deletada) */
  is_orphan: boolean;
  views: number;        // = Visits (total_viewed)
  unique_views: number;
  plays: number;        // = total_started
  pitch_pct: number;    // = over_pitch_rate (%)
  retention_50: number;
  retention_avg: number;
  cta_clicks: number;
  conversions: number;
  conv_rate: number;    // = overall_conversion_rate (%)
}

export interface PerformanceVslRow {
  /** Composite key: vsl_id */
  key: string;
  vsl_id: string;
  vsl_name: string;
  project: string;
  // Vturb metrics (aggregated over period)
  views: number;
  unique_views: number;
  plays: number;
  pitch_pct: number;
  retention_25: number;
  retention_50: number;
  retention_75: number;
  retention_100: number;
  retention_avg: number;
  cta_clicks: number;
  conversions: number;
  // Meta metrics (cross-referenced via PROJECT)
  meta_spend_brl: number;
  meta_clicks: number;
  meta_impressions: number;
  // RedTrack metrics (cross-referenced via PROJECT)
  rt_revenue_brl: number;
  rt_sales: number;
  // Computed
  cta_rate: number;
  conv_rate: number;
  roi: number;
  /** Daily breakdown rows for this VSL (for modal) */
  days: Array<{
    date: string;
    views: number;
    retention_50: number;
    retention_avg: number;
    cta_clicks: number;
    conversions: number;
    retention_curve: any;
  }>;
  /** Top Meta campaigns running in the same project as this VSL */
  top_campaigns: MetaCampaignBreakdown[];
  /** UTM campaign breakdown from Vturb (mirror of "Origem do Tráfego" panel) */
  utms: VslUtmBreakdown[];
}


interface UsePerformanceVslOpts {
  days?: number;
  project?: VslProject;
  search?: string;
}

function dateRange(days: number) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    sinceISO: new Date(start.getTime()).toISOString(),
  };
}

/** Best-effort: extract the project tag from a Meta campaign name (e.g. "[NDM]", "[ERX]") */
function extractProjectFromCampaign(name: string | null | undefined): string | null {
  if (!name) return null;
  const upper = name.toUpperCase();
  // Look for explicit project tags
  const tags = ["NDM", "NDR", "NDB", "ERX", "GLP", "CRT", "LDR", "NEURO"];
  for (const tag of tags) {
    if (upper.includes(`[${tag}]`) || upper.includes(` ${tag} `) || upper.includes(`-${tag}-`)) {
      return tag;
    }
  }
  // Fallback to mapping helper (looks for keywords like "neurocept", "ailula", etc.)
  return mapVslToProject(name);
}

export function usePerformanceVslData(opts: UsePerformanceVslOpts = {}) {
  const { days = 7, project = "ALL", search = "" } = opts;
  const { operationId } = useOperation();

  return useQuery({
    queryKey: ["performance-vsl", days, project, search, operationId],
    enabled: !!operationId,
    staleTime: 60_000,
    queryFn: async (): Promise<{ rows: PerformanceVslRow[]; period: { start: string; end: string } }> => {
      const { start, end, sinceISO } = dateRange(days);

      // ── 1) Vturb performance (granular daily) ──
      let vturbQ = supabase
        .from("vturb_performance_daily")
        .select("date, vsl_id, vsl_name, project, utm_campaign, meta_campaign_id, views, plays, pitch_pct, unique_views, retention_25, retention_50, retention_75, retention_100, retention_avg, cta_clicks, conversions, retention_curve")
        .gte("date", start)
        .lte("date", end);
      if (operationId) vturbQ = vturbQ.eq("operation_id", operationId);
      if (project !== "ALL") vturbQ = vturbQ.eq("project", project);

      const { data: vturbData, error: vErr } = await vturbQ.limit(5000);
      if (vErr) throw new Error(vErr.message);

      // ── 2) RedTrack revenue/sales aggregated by PROJECT ──
      let rtQ = supabase
        .from("redtrack_events")
        .select("utm_campaign, event_type, amount, occurred_at")
        .gte("occurred_at", sinceISO)
        .in("event_type", ["purchase", "sale", "upsell"]);
      if (operationId) rtQ = rtQ.eq("operation_id", operationId);

      const { data: rtData, error: rtErr } = await rtQ.limit(100000);
      if (rtErr) throw new Error(rtErr.message);

      // ── 3) Meta traffic by campaign + lookup campaign_id → name ──
      const [metaTrafficRes, metaStatusRes] = await Promise.all([
        supabase.rpc("get_traffic_by_campaign", { p_start_date: start, p_end_date: end }),
        (async () => {
          let q = supabase.from("meta_campaign_status").select("campaign_id, campaign_name");
          if (operationId) q = q.eq("operation_id", operationId);
          return q.limit(10000);
        })(),
      ]);
      const metaData = metaTrafficRes.data;
      if (metaTrafficRes.error && metaTrafficRes.error.code !== "PGRST202") {
        console.warn("[performance-vsl] RPC get_traffic_by_campaign failed:", metaTrafficRes.error.message);
      }
      if (metaStatusRes.error) {
        console.warn("[performance-vsl] meta_campaign_status fetch failed:", metaStatusRes.error.message);
      }

      // Lookup: campaign_id → campaign_name (autoritativo via meta_campaign_status)
      const idToName = new Map<string, string>();
      for (const m of (metaStatusRes.data || []) as any[]) {
        if (m.campaign_id && m.campaign_name) idToName.set(String(m.campaign_id), String(m.campaign_name));
      }

      // Lookup: campaign_name → spend/clicks/impressions agregado no período
      const spendByCampaignName = new Map<string, { spend: number; clicks: number; impressions: number }>();

      // Build lookup: project → meta totals + per-campaign breakdown
      const metaByProject = new Map<string, { spend: number; clicks: number; impressions: number; campaigns: Map<string, MetaCampaignBreakdown> }>();
      for (const m of (metaData || []) as any[]) {
        const cName = String(m.campaign_name || "");
        const spend = Number(m.total_spend || m.spend_brl || m.spend || 0);
        const clicks = Number(m.total_clicks || m.clicks || 0);
        const impressions = Number(m.total_impressions || m.impressions || 0);

        // Agrega global por nome (necessário p/ cruzamento por meta_campaign_id)
        const sCur = spendByCampaignName.get(cName) || { spend: 0, clicks: 0, impressions: 0 };
        sCur.spend += spend; sCur.clicks += clicks; sCur.impressions += impressions;
        spendByCampaignName.set(cName, sCur);

        const proj = extractProjectFromCampaign(cName);
        if (!proj) continue;
        const cur = metaByProject.get(proj) || { spend: 0, clicks: 0, impressions: 0, campaigns: new Map() };
        cur.spend += spend;
        cur.clicks += clicks;
        cur.impressions += impressions;
        // Aggregate per campaign for the modal
        const cAgg = cur.campaigns.get(cName) || { campaign_name: cName, campaign_id: null, spend_brl: 0, clicks: 0, impressions: 0, rt_sales: 0, rt_revenue_brl: 0, roi: 0 };
        cAgg.spend_brl += spend;
        cAgg.clicks += clicks;
        cAgg.impressions += impressions;
        cur.campaigns.set(cName, cAgg);
        metaByProject.set(proj, cur);
      }

      // Reverse lookup: name → id (preenche cAgg.campaign_id quando casa)
      const nameToId = new Map<string, string>();
      for (const [id, name] of idToName.entries()) {
        if (!nameToId.has(name)) nameToId.set(name, id);
      }
      for (const projData of metaByProject.values()) {
        for (const cAgg of projData.campaigns.values()) {
          const id = nameToId.get(cAgg.campaign_name);
          if (id) cAgg.campaign_id = id;
        }
      }


      // ── 3.5) RedTrack revenue/sales per CAMPAIGN (utm_campaign do RT == campaign_name do Meta) ──
      // Esse é o cruzamento autoritativo: cada venda traz utm_campaign = nome exato da campanha Meta
      const rtByCampaign = new Map<string, { revenue: number; sales: number }>();
      const normCamp = (s: string) => (s || "").trim().toLowerCase();
      for (const r of (rtData || []) as any[]) {
        const key = normCamp(r.utm_campaign);
        if (!key) continue;
        const cur = rtByCampaign.get(key) || { revenue: 0, sales: 0 };
        cur.revenue += Number(r.amount || 0);
        cur.sales += 1;
        rtByCampaign.set(key, cur);
      }

      // Inject RT data into per-project campaign breakdowns
      for (const projData of metaByProject.values()) {
        for (const camp of projData.campaigns.values()) {
          const rt = rtByCampaign.get(normCamp(camp.campaign_name));
          if (rt) {
            camp.rt_sales = rt.sales;
            camp.rt_revenue_brl = rt.revenue;
            camp.roi = camp.spend_brl > 0 ? +(rt.revenue / camp.spend_brl).toFixed(2) : 0;
          }
        }
      }

      // Build lookup: project → redtrack revenue + sales (using utm_campaign tag matching, mantém cálculo agregado por projeto)
      const rtByProject = new Map<string, { revenue: number; sales: number }>();
      for (const r of (rtData || []) as any[]) {
        const proj = extractProjectFromCampaign(r.utm_campaign);
        if (!proj) continue;
        const cur = rtByProject.get(proj) || { revenue: 0, sales: 0 };
        cur.revenue += Number(r.amount || 0);
        cur.sales += 1;
        rtByProject.set(proj, cur);
      }

      // ── 4) Aggregate Vturb rows by VSL (consolidating all days/utms per video) ──
      const agg = new Map<string, PerformanceVslRow>();
      // Per-VSL breakdown by utm_campaign (raw weighted sums; finalized below)
      const utmAgg = new Map<string, Map<string, VslUtmBreakdown & { _wRet50: number; _wRetAvg: number; _wPitch: number; _wConv: number }>>();
      for (const v of (vturbData || []) as any[]) {
        const key = v.vsl_id;
        const cur = agg.get(key) || {
          key,
          vsl_id: v.vsl_id,
          vsl_name: v.vsl_name || v.vsl_id,
          project: v.project || "—",
          views: 0, unique_views: 0, plays: 0, pitch_pct: 0,
          retention_25: 0, retention_50: 0, retention_75: 0, retention_100: 0, retention_avg: 0,
          cta_clicks: 0, conversions: 0,
          meta_spend_brl: 0, meta_clicks: 0, meta_impressions: 0,
          rt_revenue_brl: 0, rt_sales: 0,
          cta_rate: 0, conv_rate: 0, roi: 0,
          days: [],
          top_campaigns: [],
          utms: [],
        };
        const w = Number(v.views || 0);
        cur.views += w;
        cur.unique_views += Number(v.unique_views || 0);
        cur.plays += Number(v.plays || 0);
        // Weighted by views for retention & pitch metrics
        cur.retention_25 += Number(v.retention_25 || 0) * w;
        cur.retention_50 += Number(v.retention_50 || 0) * w;
        cur.retention_75 += Number(v.retention_75 || 0) * w;
        cur.retention_100 += Number(v.retention_100 || 0) * w;
        cur.retention_avg += Number(v.retention_avg || 0) * w;
        cur.pitch_pct += Number(v.pitch_pct || 0) * w;
        cur.cta_clicks += Number(v.cta_clicks || 0);
        cur.conversions += Number(v.conversions || 0);
        cur.days.push({
          date: v.date,
          views: Number(v.views || 0),
          retention_50: Number(v.retention_50 || 0),
          retention_avg: Number(v.retention_avg || 0),
          cta_clicks: Number(v.cta_clicks || 0),
          conversions: Number(v.conversions || 0),
          retention_curve: v.retention_curve,
        });
        agg.set(key, cur);


        // UTM breakdown (skip pre-fix legacy rows where utm == video filename)
        const utmRaw = String(v.utm_campaign || "").trim();
        const isLegacyVideoName = utmRaw.endsWith(".mp4") || utmRaw.includes("vsl ") || utmRaw === (v.vsl_name || "").toLowerCase().trim();
        const utmKey = !utmRaw ? "(sem utm)" : isLegacyVideoName ? "(sem utm)" : utmRaw;
        let perVsl = utmAgg.get(key);
        if (!perVsl) { perVsl = new Map(); utmAgg.set(key, perVsl); }
        const ucur = perVsl.get(utmKey) || {
          utm_campaign: utmKey,
          meta_campaign_id: (v.meta_campaign_id as string | null) ?? null,
          meta_campaign_name: null,
          meta_spend_brl: 0,
          is_orphan: false,
          views: 0, unique_views: 0,
          plays: 0, pitch_pct: 0,
          retention_50: 0, retention_avg: 0,
          cta_clicks: 0, conversions: 0, conv_rate: 0,
          _wRet50: 0, _wRetAvg: 0,
          _wPitch: 0, _wConv: 0,
        };
        // Preserva primeiro meta_campaign_id não-nulo se chegar mais tarde
        if (!ucur.meta_campaign_id && v.meta_campaign_id) ucur.meta_campaign_id = v.meta_campaign_id;
        ucur.views += w;
        ucur.unique_views += Number(v.unique_views || 0);
        ucur.plays += Number(v.plays || 0);
        ucur._wRet50 += Number(v.retention_50 || 0) * w;
        ucur._wRetAvg += Number(v.retention_avg || 0) * w;
        ucur._wPitch += Number(v.pitch_pct || 0) * w;
        ucur._wConv += Number(v.conversion_rate || 0) * w;
        ucur.cta_clicks += Number(v.cta_clicks || 0);
        ucur.conversions += Number(v.conversions || 0);
        perVsl.set(utmKey, ucur);
      }

      // ── 5) Finalize: divide weighted retentions, attach Meta + RT BY PROJECT, compute rates/ROI ──
      // Pre-compute per-project counts of VSLs (so we can split spend/revenue across the VSLs of a project)
      const vslCountPerProject = new Map<string, number>();
      for (const r of agg.values()) {
        vslCountPerProject.set(r.project, (vslCountPerProject.get(r.project) || 0) + 1);
      }

      const rows: PerformanceVslRow[] = Array.from(agg.values()).map((r) => {
        const v = r.views || 1;
        r.retention_25 = +(r.retention_25 / v).toFixed(2);
        r.retention_50 = +(r.retention_50 / v).toFixed(2);
        r.retention_75 = +(r.retention_75 / v).toFixed(2);
        r.retention_100 = +(r.retention_100 / v).toFixed(2);
        r.retention_avg = +(r.retention_avg / v).toFixed(2);
        r.pitch_pct = +(r.pitch_pct / v).toFixed(2);

        // Cross-source by PROJECT
        const meta = metaByProject.get(r.project);
        const rt = rtByProject.get(r.project);
        const vslCount = vslCountPerProject.get(r.project) || 1;

        if (meta) {
          // Show project totals; in single-VSL projects this is exact, in multi-VSL this represents the project's pool
          r.meta_spend_brl = meta.spend;
          r.meta_clicks = meta.clicks;
          r.meta_impressions = meta.impressions;
          // Top 10 campanhas por receita real RT (fallback: spend)
          r.top_campaigns = Array.from(meta.campaigns.values())
            .sort((a, b) => (b.rt_revenue_brl - a.rt_revenue_brl) || (b.spend_brl - a.spend_brl))
            .slice(0, 10);
        }
        if (rt) {
          r.rt_revenue_brl = rt.revenue;
          r.rt_sales = rt.sales;
        }

        r.cta_rate = r.views > 0 ? +((r.cta_clicks / r.views) * 100).toFixed(2) : 0;
        // Taxa de Conversão igual Vturb: conversões / plays únicos (usa unique_views como proxy).
        // Fallback para cta_clicks se unique_views estiver zerado.
        const convDen = r.unique_views > 0 ? r.unique_views : r.cta_clicks;
        r.conv_rate = convDen > 0 ? +((r.conversions / convDen) * 100).toFixed(2) : 0;
        r.roi = r.meta_spend_brl > 0 ? +(r.rt_revenue_brl / r.meta_spend_brl).toFixed(2) : 0;

        // Sort days ascending for charts
        r.days.sort((a, b) => a.date.localeCompare(b.date));

        // Finalize UTM breakdown for this VSL — cruzamento via meta_campaign_id (preferencial) OU nome exato (fallback)
        const perVsl = utmAgg.get(r.key);
        if (perVsl) {
          const orphanIds: string[] = [];
          const orphanNames: string[] = [];
          // Lookup name (case-insensitive) → spend
          const spendByNameLower = new Map<string, { spend: number; clicks: number; impressions: number }>();
          for (const [name, s] of spendByCampaignName.entries()) {
            spendByNameLower.set(name.trim().toLowerCase(), s);
          }
          r.utms = Array.from(perVsl.values())
            .map((u) => {
              const w = u.views || 1;

              // ── Tier 1: Cruzamento Meta EXATO via campaign_id ──
              let metaCampaignName: string | null = null;
              let metaSpendBrl = 0;
              let isOrphan = false;
              let matchSource: "id" | "name" | null = null;

              if (u.meta_campaign_id) {
                const name = idToName.get(u.meta_campaign_id);
                if (name) {
                  metaCampaignName = name;
                  const s = spendByCampaignName.get(name);
                  metaSpendBrl = s ? +s.spend.toFixed(2) : 0;
                  matchSource = "id";
                } else {
                  isOrphan = true;
                  orphanIds.push(u.meta_campaign_id);
                }
              }

              // ── Tier 2: Fallback nome EXATO (utm_campaign ↔ campaign_name, case-insensitive) ──
              // Vale só quando o ID não veio E o utm parece ser o nome textual da campanha
              if (!matchSource && !u.meta_campaign_id) {
                const utmLower = u.utm_campaign.trim().toLowerCase();
                const s = spendByNameLower.get(utmLower);
                if (s) {
                  metaCampaignName = u.utm_campaign;
                  metaSpendBrl = +s.spend.toFixed(2);
                  matchSource = "name";
                } else if (u.utm_campaign !== "(sem utm)") {
                  orphanNames.push(u.utm_campaign);
                }
              }

              return {
                utm_campaign: u.utm_campaign,
                meta_campaign_id: u.meta_campaign_id ?? null,
                meta_campaign_name: metaCampaignName,
                meta_spend_brl: metaSpendBrl,
                is_orphan: isOrphan,
                views: u.views,
                unique_views: u.unique_views,
                plays: u.plays,
                pitch_pct: +(u._wPitch / w).toFixed(2),
                retention_50: +(u._wRet50 / w).toFixed(2),
                retention_avg: +(u._wRetAvg / w).toFixed(2),
                cta_clicks: u.cta_clicks,
                conversions: u.conversions,
                conv_rate: u._wConv > 0
                  ? +(u._wConv / w).toFixed(2)
                  : (u.cta_clicks > 0 ? +((u.conversions / u.cta_clicks) * 100).toFixed(2) : 0),
              } as VslUtmBreakdown;
            })
            .sort((a, b) => b.views - a.views);
          if (orphanIds.length > 0 || orphanNames.length > 0) {
            console.warn(
              `[performance-vsl] VSL ${r.vsl_name} (${r.vsl_id}) — ${orphanIds.length} órfã(s) por ID, ${orphanNames.length} sem match por nome:`,
              { orphanIds, orphanNames: orphanNames.slice(0, 5) },
            );
          }
        }
        return r;
      });

      // ── 6) Search filter ──
      const q = (search || "").trim().toLowerCase();
      const filtered = q
        ? rows.filter((r) =>
            (r.vsl_name || "").toLowerCase().includes(q) ||
            (r.vsl_id || "").toLowerCase().includes(q),
          )
        : rows;

      // Default sort: views desc
      filtered.sort((a, b) => b.views - a.views);

      return { rows: filtered, period: { start, end } };
    },
  });
}
