import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { operation_id, players } = await req.json();
    if (!operation_id || !Array.isArray(players) || players.length === 0) {
      return new Response(JSON.stringify({ error: "operation_id and players[] required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const rows = players.map((p: any) => ({
      operation_id,
      vturb_player_id: String(p.id),
      nome_vsl: String(p.name ?? p.id),
      pasta_vturb: p.folder ?? null,
      video_duration_seconds: Number.isFinite(p.duration) ? Math.round(p.duration) : 4500,
      pitch_time_seconds: 1990,
      ativa: true,
    }));

    const { data, error } = await admin
      .from("vsl_players")
      .upsert(rows, { onConflict: "vturb_player_id" })
      .select("id, vturb_player_id, nome_vsl");
    if (error) {
      return new Response(JSON.stringify({ error: "upsert_failed", details: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ success: true, imported: data?.length ?? 0, players: data }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: "internal", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
