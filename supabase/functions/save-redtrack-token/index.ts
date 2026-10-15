import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization")!;
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const url = new URL(req.url);
  const operationId = url.searchParams.get("operation_id");
  const apiKey = url.searchParams.get("api_key");

  if (!operationId || !apiKey) {
    return new Response(JSON.stringify({ error: "Missing params" }), { status: 400, headers: corsHeaders });
  }

  // 1. Test connection
  // 1. Test connection (RedTrack logs API returns 400 if per=0, but /logs or /campaigns is safer)
  try {
    const res = await fetch(`https://api.redtrack.io/campaigns?api_key=${encodeURIComponent(apiKey)}&limit=1`);
    if (!res.ok) {
      // If /campaigns fails, try /logs as fallback
      const logsRes = await fetch(`https://api.redtrack.io/logs?api_key=${encodeURIComponent(apiKey)}&limit=1`);
      if (!logsRes.ok) {
        return new Response(JSON.stringify({ error: `RedTrack API returned ${logsRes.status} on validation` }), { status: 400, headers: corsHeaders });
      }
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }

  // 2. Save to app_settings
  const { error: saveError } = await supabase.from("app_settings").upsert({
    operation_id: operationId,
    key: "redtrack_api_key",
    value: apiKey,
    updated_at: new Date().toISOString()
  }, { onConflict: "operation_id,key" });

  if (saveError) {
    return new Response(JSON.stringify({ error: saveError.message }), { status: 500, headers: corsHeaders });
  }

  return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
});
