import { createClient } from "npm:@supabase/supabase-js@2";

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

async function vturbPost(endpoint: string, body: Record<string, unknown>, apiKey: string) {
  const res = await fetch(`${VTURB_API}${endpoint}`, {
    method: "POST",
    headers: { "X-Api-Token": apiKey, "X-Api-Version": "v1", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Vturb ${endpoint} ${res.status}: ${await res.text()}`);
  return res.json();
}

async function vturbGet(endpoint: string, apiKey: string) {
  const res = await fetch(`${VTURB_API}${endpoint}`, {
    headers: { "X-Api-Token": apiKey, "X-Api-Version": "v1" },
  });
  if (!res.ok) throw new Error(`Vturb GET ${endpoint} ${res.status}: ${await res.text()}`);
  return res.json();
}

function getDateRange(startDate: Date, endDate: Date): string[] {
  const dates: string[] = [];
  const current = new Date(startDate);
  while (current <= endDate) {
    dates.push(current.toISOString().split("T")[0]);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { data: rm } = await supabase.from("app_settings").select("value").eq("key", "recovery_mode").maybeSingle();
    if (rm?.value === true) {
      return new Response(JSON.stringify({ skipped: true, reason: "recovery_mode" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const daysParam = parseInt(url.searchParams.get("days") || "2");
    const syncDays = Math.min(Math.max(daysParam, 1), 30);
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - (syncDays - 1));
    const dates = getDateRange(startDate, now);
    const today = now.toISOString().split("T")[0];

    // Iterate every active operation. Each op uses its own key when available; the
    // first op that resolves to the generic VTURB_API_KEY consumes it (legacy GTX).
    const { data: ops } = await supabase
      .from("operations")
      .select("id, slug, name")
      .eq("status", "active")
      .order("created_at", { ascending: true });

    const opSummaries: any[] = [];
    let totalRecords = 0;
    const consumedGeneric = new Set<string>();

    for (const op of ops || []) {
      const resolved = resolveApiKey(op.slug);
      if (!resolved.key) {
        opSummaries.push({ operation_id: op.id, slug: op.slug, skipped: "no_api_key" });
        continue;
      }
      // Prevent two operations both grabbing the generic VTURB_API_KEY
      if (resolved.secretName === "VTURB_API_KEY") {
        if (consumedGeneric.size > 0) {
          opSummaries.push({ operation_id: op.id, slug: op.slug, skipped: "no_dedicated_key" });
          continue;
        }
        consumedGeneric.add(op.id);
      }

      // Names cache
      const playerNames = new Map<string, string>();
      try {
        const list = await vturbGet("/players/list", resolved.key);
        if (Array.isArray(list)) for (const p of list) if (p?.id && p?.name) playerNames.set(p.id, p.name);
      } catch (err) {
        console.warn(`[${op.slug}] players/list failed:`, err instanceof Error ? err.message : err);
      }

      // If this operation has an explicit vsl_players allow-list, restrict to it.
      const { data: allowRows } = await supabase
        .from("vsl_players")
        .select("vturb_player_id, nome_vsl, ativa")
        .eq("operation_id", op.id)
        .eq("ativa", true);
      const allowList = (allowRows || []).map((r) => r.vturb_player_id);
      const allowNames = new Map((allowRows || []).map((r) => [r.vturb_player_id, r.nome_vsl] as const));

      let playerIds: string[] = [];
      if (allowList.length > 0) {
        playerIds = allowList;
      } else {
        try {
          const discovered = await vturbPost("/events/total_by_company_players", {
            events: ["viewed", "started"],
            start_date: `${dates[0]} 00:00:00`,
            end_date: `${today} 23:59:59`,
            timezone: "America/Sao_Paulo",
          }, resolved.key);
          if (Array.isArray(discovered)) {
            const seen = new Set<string>();
            for (const item of discovered) {
              if (item?.player_id && !seen.has(item.player_id)) {
                seen.add(item.player_id);
                playerIds.push(item.player_id);
              }
            }
          }
        } catch (err) {
          console.warn(`[${op.slug}] discovery failed:`, err instanceof Error ? err.message : err);
        }
      }

      if (playerIds.length === 0) {
        opSummaries.push({ operation_id: op.id, slug: op.slug, players: 0, records: 0 });
        continue;
      }

      let opRecords = 0;
      for (const date of dates) {
        const dayStart = `${date} 00:00:00`;
        const dayEnd = `${date} 23:59:59`;
        const BATCH = 5;
        for (let i = 0; i < playerIds.length; i += BATCH) {
          const batch = playerIds.slice(i, i + BATCH);
          await Promise.all(batch.map(async (playerId) => {
            try {
              const stats = await vturbPost("/sessions/stats", {
                player_id: playerId,
                start_date: dayStart,
                end_date: dayEnd,
                timezone: "America/Sao_Paulo",
              }, resolved.key!);
              if (!stats || typeof stats !== "object") return;

              const videoName = allowNames.get(playerId) || playerNames.get(playerId) || `Player ${playerId}`;

              const row = {
                video_id: playerId,
                video_name: videoName,
                date,
                total_views: Number(stats.total_viewed || 0),
                unique_views: Number(stats.total_viewed_device_uniq || 0),
                average_watch_time: Number(stats.engagement_rate || 0),
                retention_rate: Number(stats.over_pitch_rate || 0),
                button_clicks: Number(stats.total_clicked_device_uniq || 0),
                checkout_clicks: Number(stats.total_conversions || 0),
                revenue: Number(stats.total_amount_brl || 0) / 100,
                operation_id: op.id,
              };

              const { data: existing } = await supabase
                .from("vsl_data")
                .select("id")
                .eq("video_id", row.video_id)
                .eq("date", row.date)
                .eq("operation_id", op.id)
                .maybeSingle();

              if (existing) await supabase.from("vsl_data").update(row).eq("id", existing.id);
              else await supabase.from("vsl_data").insert(row);
              opRecords++;
            } catch (err) {
              console.error(`[${op.slug}] ${playerId} ${date}:`, err instanceof Error ? err.message : err);
            }
          }));
        }
      }

      totalRecords += opRecords;
      opSummaries.push({
        operation_id: op.id,
        slug: op.slug,
        secret: resolved.secretName,
        players: playerIds.length,
        allow_list: allowList.length > 0,
        records: opRecords,
      });
    }

    await supabase.from("integration_logs").insert({
      integration: "vturb", status: "success",
      message: `Sync multi-op concluído (${opSummaries.length} operações, ${totalRecords} registros)`,
      records_processed: totalRecords,
    });

    return new Response(
      JSON.stringify({ success: true, days: dates.length, records: totalRecords, operations: opSummaries }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Vturb sync error:", err);
    await supabase.from("integration_logs").insert({
      integration: "vturb", status: "error",
      message: `Sync error: ${err instanceof Error ? err.message : "Unknown"}`,
      records_processed: 0,
    });
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
