const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VTURB_API = "https://analytics.vturb.net";

// Valid field values according to Vturb API
const VALID_FIELDS = new Set([
  "utm_campaign", "utm_source", "utm_medium", "utm_content", "utm_term",
  "country", "device_type", "browser", "src", "sck", "no_attribution",
]);

function toVturbField(group_by: string): string {
  return VALID_FIELDS.has(group_by) ? group_by : "utm_campaign";
}

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
    const { player_id, start_date, end_date, group_by = "utm_campaign" } = await req.json();

    if (!player_id) {
      return new Response(JSON.stringify({ error: "player_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const field = toVturbField(group_by);

    // Use /sessions/stats_by_field — the correct endpoint for UTM breakdown
    // video_duration is required by the API; we pass a large value and Vturb uses its own stored duration
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    // Vturb requires full datetime format: "YYYY-MM-DD HH:MM:SS"
    const toVturbDate = (d: string | undefined, isEnd = false) => {
      if (!d) return `${today} ${isEnd ? "23:59:59" : "00:00:00"}`;
      const base = d.split(" ")[0].split("T")[0]; // strip any existing time
      return `${base} ${isEnd ? "23:59:59" : "00:00:00"}`;
    };

    const body: Record<string, unknown> = {
      player_id,
      start_date: toVturbDate(start_date, false),
      end_date: toVturbDate(end_date, true),
      field,
      video_duration: 86400,
      timezone: "America/Sao_Paulo",
    };

    console.log(`Body: ${JSON.stringify(body)}`);

    console.log(`Calling /sessions/stats_by_field with field=${field}, player_id=${player_id}`);

    const res = await fetch(`${VTURB_API}/sessions/stats_by_field`, {
      method: "POST",
      headers: {
        "X-Api-Token": vturbApiKey,
        "X-Api-Version": "v1",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    console.log(`/sessions/stats_by_field -> ${res.status}: ${text.substring(0, 500)}`);

    if (res.ok) {
      let data: unknown;
      try { data = JSON.parse(text); } catch { data = text; }
      const rows = normalizeStatsRows(data, group_by);
      return new Response(JSON.stringify({ rows, group_by, endpoint: "/sessions/stats_by_field" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Endpoint /sessions/stats_by_field retornou ${res.status}: ${text.substring(0, 300)}`);
  } catch (err) {
    console.error("get-vsl-utm error:", err);
    return new Response(JSON.stringify({
      error: err instanceof Error ? err.message : "Unknown error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

interface StatsRow {
  grouped_field?: string;
  total_viewed?: number;
  total_viewed_device_uniq?: number;
  total_started?: number;
  total_started_device_uniq?: number;
  play_rate?: number;
  over_pitch_rate?: number;
  engagement_rate?: number;
  total_clicked?: number;
  total_clicked_device_uniq?: number;
  total_conversions?: number;
  [key: string]: unknown;
}

function normalizeStatsRows(data: unknown, group_by: string): UtmRow[] {
  if (!data) return [];

  // Response can be an array of rows or a single object (when only one group)
  const arr: StatsRow[] = Array.isArray(data) ? data : [data as StatsRow];

  return arr
    .filter((item) => item.grouped_field !== undefined || item.total_viewed !== undefined)
    .map((item) => ({
      utm_value: String(item.grouped_field ?? item[group_by] ?? "—"),
      total_views: Number(item.total_viewed || 0),
      unique_views: Number(item.total_viewed_device_uniq || 0),
      total_plays: Number(item.total_started || 0),
      unique_plays: Number(item.total_started_device_uniq || 0),
      play_rate: Number(item.play_rate || 0),
      retention_rate: Number(item.over_pitch_rate || item.engagement_rate || 0),
      button_clicks: Number(item.total_clicked_device_uniq || item.total_clicked || 0),
      checkout_clicks: Number(item.total_conversions || 0),
    }));
}

interface UtmRow {
  utm_value: string;
  total_views: number;
  unique_views: number;
  total_plays: number;
  unique_plays: number;
  play_rate: number;
  retention_rate: number;
  button_clicks: number;
  checkout_clicks: number;
}
