import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { operation_id, test_api_key } = await req.json().catch(() => ({}));
    if (!operation_id) {
      return new Response(JSON.stringify({ error: "operation_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: op } = await admin.from("operations").select("slug, vturb_api_key").eq("id", operation_id).maybeSingle();
    
    let key = test_api_key || op?.vturb_api_key;
    let secretName = test_api_key ? "Temporary Test Key" : (op?.vturb_api_key ? "Database (Operation Key)" : null);

    if (!key) {
      const resolved = resolveApiKey(op?.slug ?? null);
      key = resolved.key;
      secretName = resolved.secretName;
    }

    if (!key) {
      return new Response(JSON.stringify({
        error: "no_api_key",
        message: `Nenhuma API Key do Vturb encontrada. Configure VTURB_API_KEY_${(op?.slug ?? "").toUpperCase().replace(/[^A-Z0-9]+/g, "_")} nos segredos.`,
      }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const res = await fetch(`${VTURB_API}/players/list`, {
      headers: { "X-Api-Token": key, "X-Api-Version": "v1" },
    });
    if (!res.ok) {
      const text = await res.text();
      return new Response(JSON.stringify({ error: "vturb_error", status: res.status, details: text }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const players = await res.json();

    // Existing players in this operation
    const { data: existing } = await admin
      .from("vsl_players")
      .select("vturb_player_id")
      .eq("operation_id", operation_id);
    const existingIds = new Set((existing ?? []).map((p) => p.vturb_player_id));

    const enriched = (Array.isArray(players) ? players : []).map((p: any) => ({
      id: p.id,
      name: p.name ?? p.title ?? p.id,
      folder: p.folder ?? p.pasta ?? null,
      thumbnail: p.thumbnail ?? p.thumb ?? null,
      duration: p.duration ?? p.video_duration ?? null,
      created_at: p.created_at ?? p.createdAt ?? p.inserted_at ?? null,
      updated_at: p.updated_at ?? p.updatedAt ?? null,
      views: p.views ?? p.total_views ?? p.play_count ?? null,
      already_imported: existingIds.has(p.id),
    }));

    return new Response(JSON.stringify({
      success: true,
      operation_id,
      secret_used: secretName,
      count: enriched.length,
      players: enriched,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: "internal", details: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
