import { createClient } from "npm:@supabase/supabase-js@2";
import { mapVslToProject } from "../_shared/vslProjectMapping.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VTURB_API = "https://analytics.vturb.net";

function resolveApiKey(slug: string | null): { key: string | null; secretName: string | null } {
  const candidates: string[] = [];
  if (slug) {
    const upper = slug.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
    candidates.push(`VTURB_API_KEY_${upper}`);
    const first = upper.split("_")[0];
    if (first && first !== upper) candidates.push(`VTURB_API_KEY_${first}`);
  }
  candidates.push("VTURB_API_KEY");
  for (const name of candidates) {
    const v = Deno.env.get(name);
    if (v) return { key: v, secretName: name };
  }
  return { key: null, secretName: null };
}

// ─── Vturb API helpers ────────────────────────────────────────────────────────
async function vturbPost(endpoint: string, body: Record<string, unknown>, apiKey: string, retries = 2) {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${VTURB_API}${endpoint}`, {
        method: "POST",
        headers: {
          "X-Api-Token": apiKey,
          "X-Api-Version": "v1",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Vturb POST ${endpoint} ${res.status}: ${text}`);
      }
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      }
    }
  }
  throw lastErr;
}

async function vturbGet(endpoint: string, apiKey: string, params?: Record<string, string>, retries = 2) {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const url = new URL(`${VTURB_API}${endpoint}`);
      if (params) {
        for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
      }
      const res = await fetch(url.toString(), {
        method: "GET",
        headers: { "X-Api-Token": apiKey, "X-Api-Version": "v1" },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Vturb GET ${endpoint} ${res.status}: ${text}`);
      }
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      }
    }
  }
  throw lastErr;
}

// ─── Date range helper ────────────────────────────────────────────────────────
function getDateRange(startDate: Date, endDate: Date): string[] {
  const dates: string[] = [];
  const current = new Date(startDate);
  while (current <= endDate) {
    dates.push(current.toISOString().split("T")[0]);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

// ─── Mock fallback (testing only) ─────────────────────────────────────────────
function buildMockRows(date: string, operationId: string | null) {
  const mockVsls = [
    { id: "mock-ndm-001", name: "Neurocept VSL Premium", utm: "ndm-prime-vsl1" },
    { id: "mock-erx-001", name: "ERX Master Lead", utm: "erx-master-001" },
    { id: "mock-glp-001", name: "GLP Conversion Hero", utm: "glp-hero-vsl" },
  ];
  return mockVsls.map((v) => {
    const views = 800 + Math.floor(Math.random() * 1200);
    const r25 = Math.floor(views * 0.6);
    const r50 = Math.floor(views * 0.35);
    const r75 = Math.floor(views * 0.18);
    const r100 = Math.floor(views * 0.08);
    const ctaClicks = Math.floor(views * (0.04 + Math.random() * 0.04));
    const conversions = Math.floor(ctaClicks * (0.15 + Math.random() * 0.15));
    return {
      date,
      vsl_id: v.id,
      vsl_name: v.name,
      project: mapVslToProject(v.name) || "",
      utm_campaign: v.utm,
      views,
      unique_views: Math.floor(views * 0.85),
      retention_25: views ? (r25 / views) * 100 : 0,
      retention_50: views ? (r50 / views) * 100 : 0,
      retention_75: views ? (r75 / views) * 100 : 0,
      retention_100: views ? (r100 / views) * 100 : 0,
      retention_avg: 35 + Math.random() * 25,
      cta_clicks: ctaClicks,
      conversions,
      conversion_rate: ctaClicks ? (conversions / ctaClicks) * 100 : 0,
      retention_curve: Array.from({ length: 30 }, (_, i) => ({
        seconds: i * 30,
        retention: Math.max(5, 100 - i * 3 - Math.random() * 5),
      })),
      is_mock: true,
      operation_id: operationId,
    };
  });
}

// ─── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const url = new URL(req.url);
  const useMock = url.searchParams.get("mock") === "1";
  const daysParam = parseInt(url.searchParams.get("days") || "2");
  const syncDays = Math.min(Math.max(daysParam, 1), 30);
  const operationFilter = url.searchParams.get("operation_id"); // optional single-op backfill

  // RECOVERY MODE guard
  const { data: rm } = await supabase
    .from("app_settings").select("value").eq("key", "recovery_mode").maybeSingle();
  if (rm?.value === true) {
    return new Response(JSON.stringify({ skipped: true, reason: "recovery_mode" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── Discover all active operations ──
  const opsQuery = supabase
    .from("operations")
    .select("id, slug, name")
    .eq("status", "active")
    .order("created_at", { ascending: true });
  const { data: ops } = operationFilter
    ? await opsQuery.eq("id", operationFilter)
    : await opsQuery;

  if (!ops || ops.length === 0) {
    return new Response(JSON.stringify({ success: true, operations: 0, records: 0 }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Mock mode: uses first op
  if (useMock) {
    const defaultOperationId = ops[0].id;
    const now = new Date();
    const start = new Date(now); start.setDate(start.getDate() - (syncDays - 1));
    const dates = getDateRange(start, now);
    let totalRows = 0;
    for (const date of dates) {
      const rows = buildMockRows(date, defaultOperationId);
      const { error } = await supabase
        .from("vturb_performance_daily")
        .upsert(rows, { onConflict: "date,vsl_id,utm_campaign" });
      if (!error) totalRows += rows.length;
    }
    return new Response(JSON.stringify({ success: true, mock: true, records: totalRows }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── Real sync per operation ──
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - (syncDays - 1));
  const dates = getDateRange(startDate, now);
  console.log(`Vturb v2 sync: ${dates[0]} → ${dates[dates.length - 1]} (${dates.length} days) × ${ops.length} ops`);

  const opSummaries: any[] = [];
  const consumedGeneric = new Set<string>();
  let grandTotal = 0;

  for (const op of ops) {
    const resolved = resolveApiKey(op.slug);
    if (!resolved.key) {
      opSummaries.push({ operation_id: op.id, slug: op.slug, skipped: "no_api_key" });
      continue;
    }
    // Prevent multiple ops from grabbing the generic legacy key
    if (resolved.secretName === "VTURB_API_KEY") {
      if (consumedGeneric.size > 0) {
        opSummaries.push({ operation_id: op.id, slug: op.slug, skipped: "generic_key_taken" });
        continue;
      }
      consumedGeneric.add(op.id);
    }
    const vturbApiKey = resolved.key;
    const defaultOperationId = op.id;

    try {
      // Fetch player names
      const playerNames = new Map<string, string>();
      try {
        const playersList = await vturbGet("/players/list", vturbApiKey);
        if (Array.isArray(playersList)) {
          for (const p of playersList) if (p.id && p.name) playerNames.set(p.id, p.name);
        }
      } catch (err) {
        console.warn(`[${op.slug}] players/list failed:`, err instanceof Error ? err.message : err);
      }


      // Discover players in window for this op
      const fullStart = `${dates[0]} 00:00:00`;
      const fullEnd = `${today} 23:59:59`;
      const playersData = await vturbPost("/events/total_by_company_players", {
        events: ["viewed", "started"],
        start_date: fullStart,
        end_date: fullEnd,
        timezone: "America/Sao_Paulo",
      }, vturbApiKey);

      const playerIds: string[] = [];
      if (Array.isArray(playersData)) {
        const seen = new Set<string>();
        for (const item of playersData) {
          if (item.player_id && !seen.has(item.player_id)) {
            seen.add(item.player_id);
            playerIds.push(item.player_id);
          }
        }
      }
      console.log(`[${op.slug}] Found ${playerIds.length} players`);

      if (playerIds.length === 0) {
        opSummaries.push({ operation_id: op.id, slug: op.slug, players: 0, records: 0 });
        continue;
      }

      let totalRecords = 0;
      const BATCH_SIZE = 5;
      const VIDEO_DURATION = 86400;

      function decodeGroupedField(raw: string | null | undefined): { utm: string; metaCampaignId: string | null } {
        if (!raw) return { utm: "(sem utm)", metaCampaignId: null };
        const str = String(raw).trim();
        if (/^\d{10,}$/.test(str)) return { utm: str, metaCampaignId: str };
        const idMatch = str.match(/\|(\d{10,})$/);
        const metaCampaignId = idMatch ? idMatch[1] : null;
        const utmPart = idMatch ? str.slice(0, str.length - idMatch[0].length) : str;
        let utm = utmPart;
        try { utm = decodeURIComponent(utmPart.replace(/\+/g, " ")); } catch { utm = utmPart; }
        utm = utm.trim();
        if (!utm) utm = "(sem utm)";
        return { utm, metaCampaignId };
      }

      for (const date of dates) {
        const dayStart = `${date} 00:00:00`;
        const dayEnd = `${date} 23:59:59`;

        for (let i = 0; i < playerIds.length; i += BATCH_SIZE) {
          const batch = playerIds.slice(i, i + BATCH_SIZE);
          const upsertRows: Record<string, unknown>[] = [];

          await Promise.all(batch.map(async (playerId) => {
            try {
              const vslName = playerNames.get(playerId) || `Player ${playerId}`;
              const project = mapVslToProject(vslName) || "";

              // 1) Sessions aggregate (source of truth para totais do player no dia)
              let agg: any = null;
              try {
                agg = await vturbPost("/sessions/stats", {
                  player_id: playerId,
                  start_date: dayStart,
                  end_date: dayEnd,
                  timezone: "America/Sao_Paulo",
                }, vturbApiKey, 1);
              } catch (err) {
                console.warn(`[${op.slug}] sessions/stats falhou ${playerId} ${date}:`, err instanceof Error ? err.message : err);
              }
              const aggViews = Number(agg?.total_viewed ?? 0);

              // 2) UTM split
              let utmRows: any[] | null = null;
              try {
                const resp = await vturbPost("/traffic_origin/stats", {
                  player_id: playerId,
                  start_date: dayStart,
                  end_date: dayEnd,
                  video_duration: VIDEO_DURATION,
                  timezone: "America/Sao_Paulo",
                  query_key: "utm_campaign",
                }, vturbApiKey, 1);
                if (Array.isArray(resp)) utmRows = resp;
                else if (resp && Array.isArray((resp as any).data)) utmRows = (resp as any).data;
              } catch (err) {
                console.warn(`[${op.slug}] traffic_origin/stats falhou ${playerId} ${date}:`, err instanceof Error ? err.message : err);
              }

              let sumUtmViews = 0, sumUtmPlays = 0, sumUtmUniq = 0, sumUtmCta = 0, sumUtmConv = 0, sumUtmOverPitch = 0;
              if (utmRows && utmRows.length > 0) {
                for (const row of utmRows) {
                  const { utm, metaCampaignId } = decodeGroupedField(row.grouped_field);
                  const views = Number(row.total_viewed ?? 0);
                  if (views <= 0) continue;
                  const plays = Number(row.total_started ?? 0);
                  const uniqueViews = Number(row.total_viewed_device_uniq ?? 0);
                  const ctaClicks = Number(row.total_clicked_device_uniq ?? row.total_clicked ?? 0);
                  const overPitch = Number(row.total_over_pitch ?? 0);
                  const pitchPct = views > 0 ? +(overPitch / views * 100).toFixed(2) : 0;
                  const conversions = Number(row.total_finished ?? row.total_conversions ?? 0);
                  const convRate = views > 0 ? +(conversions / views * 100).toFixed(2) : 0;
                  const rAvg = Number(row.engagement_rate ?? 0);

                  sumUtmViews += views; sumUtmPlays += plays; sumUtmUniq += uniqueViews;
                  sumUtmCta += ctaClicks; sumUtmConv += conversions; sumUtmOverPitch += overPitch;

                  upsertRows.push({
                    date, vsl_id: playerId, vsl_name: vslName, project,
                    utm_campaign: utm, meta_campaign_id: metaCampaignId,
                    views, plays, pitch_pct: pitchPct, unique_views: uniqueViews,
                    retention_25: 0, retention_50: 0, retention_75: 0, retention_100: 0,
                    retention_avg: rAvg, cta_clicks: ctaClicks, conversions,
                    conversion_rate: convRate, retention_curve: [], is_mock: false,
                    operation_id: defaultOperationId,
                  });
                }
              }

              // 3) Fallback: se agregado do player > soma do split UTM, insere linha "(direct)"
              // com o delta — cobre views orgânicas/diretas sem utm_campaign, que ficariam
              // sem plays/pitch/play_rate no dashboard.
              const deltaViews = aggViews - sumUtmViews;
              if (agg && deltaViews > 0) {
                const dPlays = Math.max(0, Number(agg.total_started ?? 0) - sumUtmPlays);
                const dUniq = Math.max(0, Number(agg.total_viewed_device_uniq ?? 0) - sumUtmUniq);
                const dCta = Math.max(0, Number(agg.total_clicked_device_uniq ?? agg.total_clicked ?? 0) - sumUtmCta);
                const dConv = Math.max(0, Number(agg.total_finished ?? agg.total_conversions ?? 0) - sumUtmConv);
                const dOverPitch = Math.max(0, Number(agg.total_over_pitch ?? 0) - sumUtmOverPitch);
                const pitchPct = agg.over_pitch_rate != null && sumUtmViews === 0
                  ? +Number(agg.over_pitch_rate).toFixed(2)
                  : (deltaViews > 0 ? +(dOverPitch / deltaViews * 100).toFixed(2) : 0);
                const convRate = deltaViews > 0 ? +(dConv / deltaViews * 100).toFixed(2) : 0;
                const rAvg = Number(agg.engagement_rate ?? 0);

                upsertRows.push({
                  date, vsl_id: playerId, vsl_name: vslName, project,
                  utm_campaign: "(direct)", meta_campaign_id: null,
                  views: deltaViews, plays: dPlays, pitch_pct: pitchPct,
                  unique_views: dUniq,
                  retention_25: 0, retention_50: 0, retention_75: 0, retention_100: 0,
                  retention_avg: rAvg, cta_clicks: dCta, conversions: dConv,
                  conversion_rate: convRate, retention_curve: [], is_mock: false,
                  operation_id: defaultOperationId,
                });
              }
            } catch (err) {
              console.error(`[${op.slug}] Error ${playerId} ${date}:`, err instanceof Error ? err.message : err);
            }
          }));



          if (upsertRows.length > 0) {
            // Dedupe por (date, vsl_id, utm_campaign) somando métricas — evita
            // "ON CONFLICT DO UPDATE command cannot affect row a second time"
            // quando múltiplos rows do traffic_origin decodificam pro mesmo utm.
            const dedup = new Map<string, any>();
            for (const r of upsertRows) {
              const k = `${r.date}|${r.vsl_id}|${r.utm_campaign}`;
              const prev = dedup.get(k);
              if (!prev) { dedup.set(k, r); continue; }
              const v = Number(prev.views) + Number(r.views);
              const p = Number(prev.plays) + Number(r.plays);
              const u = Number(prev.unique_views) + Number(r.unique_views);
              const cta = Number(prev.cta_clicks) + Number(r.cta_clicks);
              const conv = Number(prev.conversions) + Number(r.conversions);
              const opp = (Number(prev.pitch_pct) * Number(prev.views) + Number(r.pitch_pct) * Number(r.views));
              dedup.set(k, {
                ...prev,
                views: v, plays: p, unique_views: u, cta_clicks: cta, conversions: conv,
                pitch_pct: v > 0 ? +(opp / v).toFixed(2) : 0,
                conversion_rate: v > 0 ? +(conv / v * 100).toFixed(2) : 0,
                retention_avg: Math.max(Number(prev.retention_avg||0), Number(r.retention_avg||0)),
              });
            }
            const final = Array.from(dedup.values());
            const { error } = await supabase
              .from("vturb_performance_daily")
              .upsert(final, { onConflict: "date,vsl_id,utm_campaign" });
            if (error) console.error(`[${op.slug}] Upsert error:`, error.message);
            else totalRecords += final.length;
          }

        }
      }

      opSummaries.push({
        operation_id: op.id, slug: op.slug,
        secret: resolved.secretName,
        players: playerIds.length, days: dates.length, records: totalRecords,
      });
      grandTotal += totalRecords;
    } catch (err) {
      console.error(`[${op.slug}] Vturb v2 op error:`, err);
      opSummaries.push({
        operation_id: op.id, slug: op.slug,
        error: err instanceof Error ? err.message : "Unknown",
      });
    }
  }

  await supabase.from("integration_logs").insert({
    integration: "vturb_v2", status: "success",
    message: `${ops.length} ops sincronizadas — ${grandTotal} registros`,
    records_processed: grandTotal,
  });

  return new Response(
    JSON.stringify({ success: true, operations: ops.length, records: grandTotal, summaries: opSummaries }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});

