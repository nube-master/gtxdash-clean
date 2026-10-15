const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VTURB_API = "https://analytics.vturb.net";

import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth: require authenticated user
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const authClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: claimsData, error: claimsErr } = await authClient.auth.getClaims(authHeader.replace("Bearer ", ""));
  if (claimsErr || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const vturbApiKey = Deno.env.get("VTURB_API_KEY");
  if (!vturbApiKey) {
    return new Response(JSON.stringify({ error: "VTURB_API_KEY not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { player_id, start_date, end_date } = await req.json();

    if (!player_id) {
      return new Response(JSON.stringify({ error: "player_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // First get player info to know duration
    const playersRes = await fetch(`${VTURB_API}/players/list`, {
      headers: { "X-Api-Token": vturbApiKey, "X-Api-Version": "v1" },
    });

    let videoDuration = 3600; // fallback
    if (playersRes.ok) {
      const players = await playersRes.json();
      const player = Array.isArray(players) ? players.find((p: any) => p.id === player_id) : null;
      if (player?.duration) {
        videoDuration = player.duration;
      }
    }

    // Fetch engagement data
    const body: Record<string, unknown> = {
      player_id,
      video_duration: videoDuration,
      timezone: "America/Sao_Paulo",
    };
    if (start_date) body.start_date = start_date;
    if (end_date) body.end_date = end_date;

    const res = await fetch(`${VTURB_API}/times/user_engagement`, {
      method: "POST",
      headers: {
        "X-Api-Token": vturbApiKey,
        "X-Api-Version": "v1",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Vturb API ${res.status}: ${text}`);
    }

    const data = await res.json();

    // Transform grouped_timed into retention curve
    const grouped = data.grouped_timed || [];
    const maxUsers = grouped.length > 0 ? Math.max(...grouped.map((g: any) => g.total_users)) : 1;

    const curve = grouped.map((g: any) => ({
      seconds: g.timed,
      users: g.total_users,
      retention: maxUsers > 0 ? (g.total_users / maxUsers) * 100 : 0,
    }));

    return new Response(JSON.stringify({
      player_id,
      video_duration: videoDuration,
      average_watched_time: data.average_watched_time || 0,
      engagement_rate: data.engagement_rate || 0,
      curve,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("get-vsl-retention error:", err);
    return new Response(JSON.stringify({
      error: err instanceof Error ? err.message : "Unknown error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
