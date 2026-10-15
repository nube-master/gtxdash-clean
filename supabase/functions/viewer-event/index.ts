// viewer-event: eventos pontuais (vsl_start, pitch_reached, cta_click, exit, purchase)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const VALID = ["vsl_start", "pitch_reached", "cta_click", "exit", "timeout", "purchase"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    // sendBeacon may post text/plain — accept both
    const raw = await req.text();
    const body = JSON.parse(raw || "{}");
    const sessionId = String(body.session_id ?? "").slice(0, 128);
    const playerId = String(body.player_id ?? "").slice(0, 128);
    const eventType = String(body.event_type ?? "");
    if (!sessionId || !playerId || !VALID.includes(eventType)) {
      return new Response(JSON.stringify({ error: "invalid payload" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const second = Number(body.second_in_video ?? 0) || 0;

    // fetch existing viewer to inherit context
    const { data: existing } = await supabase
      .from("live_viewers")
      .select("operation_id, product, account_id, ad_id, country, device_type, clickid, utm_campaign")
      .eq("session_id", sessionId).eq("player_id", playerId).maybeSingle();

    await supabase.from("live_events").insert({
      session_id: sessionId,
      player_id: playerId,
      event_type: eventType,
      second_in_video: second,
      clickid: existing?.clickid ?? null,
      utm_campaign: existing?.utm_campaign ?? null,
      ad_id: existing?.ad_id ?? null,
      account_id: existing?.account_id ?? null,
      operation_id: existing?.operation_id ?? null,
      product: existing?.product ?? null,
      country: existing?.country ?? null,
      device_type: existing?.device_type ?? null,
      metadata: body.metadata ?? null,
    });

    // mutate live_viewers state when relevant
    if (existing) {
      const patch: Record<string, unknown> = { last_seen_at: new Date().toISOString() };
      if (eventType === "pitch_reached") patch.pitch_reached = true;
      if (eventType === "cta_click") { patch.cta_clicked = true; patch.exit_reason = "cta_click"; }
      if (eventType === "exit") patch.exit_reason = "exited";
      if (eventType === "purchase") patch.exit_reason = "purchase";
      await supabase.from("live_viewers").update(patch).eq("session_id", sessionId).eq("player_id", playerId);
    }

    return new Response(JSON.stringify({ status: "ok" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("viewer-event error", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
