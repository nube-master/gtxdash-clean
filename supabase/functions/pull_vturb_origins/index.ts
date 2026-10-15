// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function extractAdId(decoded: string): string {
  const matches = decoded.match(/\[([^\]]+)\]/g);
  if (!matches || matches.length < 2) return "?";
  return matches[1].replace(/[\[\]]/g, "").trim();
}

function todayInBrt(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date()); // YYYY-MM-DD
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const VTURB_TOKEN = Deno.env.get("VTURB_API_KEY") ?? Deno.env.get("VTURB_API_TOKEN");
  if (!VTURB_TOKEN) {
    return new Response(JSON.stringify({ error: "VTURB_API_KEY not set" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: any = {};
  try { body = await req.json(); } catch (_) {}
  const targetDate: string = body?.date || todayInBrt();
  const onlyPlayerId: string | undefined = body?.player_id;

  let q = supabase.from("vsl_players").select("*").eq("ativa", true);
  if (onlyPlayerId) q = q.eq("vturb_player_id", onlyPlayerId);
  const { data: players, error } = await q;
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const startDate = `${targetDate} 00:00:00`;
  const endDate = `${targetDate} 23:59:59`;

  let totalUpserts = 0;
  const errors: any[] = [];

  for (const player of players ?? []) {
    try {
      const resp = await fetch(
        "https://analytics.vturb.net/traffic_origin/stats",
        {
          method: "POST",
          headers: {
            "X-Api-Token": VTURB_TOKEN,
            "X-Api-Version": "v1",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            player_id: player.vturb_player_id,
            start_date: startDate,
            end_date: endDate,
            query_key: "utm_campaign",
            video_duration: player.video_duration_seconds || 4500,
            timezone: "America/Sao_Paulo",
            pitch_time: player.pitch_time_seconds || 1990,
          }),
        },
      );
      if (!resp.ok) {
        errors.push({ player: player.vturb_player_id, status: resp.status, body: await resp.text() });
        continue;
      }
      const items = await resp.json();
      if (!Array.isArray(items)) continue;

      const grouped = new Map<string, { v: number; s: number; p: number; c: number }>();
      for (const item of items) {
        const decoded = decodeURIComponent(
          String(item.grouped_field || "").replace(/\+/g, " "),
        );
        const adId = extractAdId(decoded);
        if (!grouped.has(adId)) grouped.set(adId, { v: 0, s: 0, p: 0, c: 0 });
        const g = grouped.get(adId)!;
        g.v += Number(item.total_viewed || 0);
        g.s += Number(item.total_started || 0);
        g.p += Number(item.total_over_pitch || 0);
        g.c += Number(item.total_clicked || 0);
      }

      const rows = Array.from(grouped.entries()).map(([adId, g]) => ({
        vsl_player_id: player.id,
        data_capturada: targetDate,
        ad_id: adId,
        total_viewed: g.v,
        total_started: g.s,
        total_over_pitch: g.p,
        total_clicked: g.c,
        play_rate: g.v > 0 ? Number(((g.s / g.v) * 100).toFixed(2)) : 0,
        pitch_rate: g.s > 0 ? Number(((g.p / g.s) * 100).toFixed(2)) : 0,
        updated_at: new Date().toISOString(),
      }));

      if (rows.length > 0) {
        const { error: upErr } = await supabase
          .from("vsl_origin_stats")
          .upsert(rows, { onConflict: "vsl_player_id,data_capturada,ad_id" });
        if (upErr) errors.push({ player: player.vturb_player_id, upsertError: upErr.message });
        else totalUpserts += rows.length;
      }
    } catch (e) {
      errors.push({ player: player.vturb_player_id, error: String(e) });
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      date: targetDate,
      players: players?.length ?? 0,
      upserts: totalUpserts,
      errors,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
