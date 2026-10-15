// Secure edge function to rotate META_ADS_ACCESS_TOKEN without pasting it in chat.
// - Requires a valid JWT (verified in code).
// - Caller must be listed in `super_admins`.
// - Token is validated against Meta `/me` before being persisted.
// - Stored in `app_settings.value->token` (jsonb), read by sync helpers.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "https://esm.sh/zod@3.23.8";

const BodySchema = z.object({
  token: z.string().trim().min(40).max(500),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  // 1. Verify caller JWT
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 2. Super-admin check (service role bypasses RLS)
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: sa } = await admin
    .from("super_admins")
    .select("user_id")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!sa) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 3. Validate body
  let body: unknown;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "invalid_token_format" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const token = parsed.data.token;

  // 4. Validate against Meta Graph API
  const probe = await fetch(
    `https://graph.facebook.com/v23.0/me?fields=id,name&access_token=${encodeURIComponent(token)}`
  );
  const probeBody = await probe.json().catch(() => ({}));
  if (!probe.ok || probeBody?.error) {
    return new Response(JSON.stringify({
      error: "meta_rejected_token",
      details: probeBody?.error?.message ?? `HTTP ${probe.status}`,
    }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 5. Persist
  const { error: upErr } = await admin.from("app_settings").upsert({
    key: "meta_ads_access_token",
    value: { token, rotated_at: new Date().toISOString(), rotated_by: userData.user.id },
    updated_by: userData.user.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: "key" });
  if (upErr) {
    return new Response(JSON.stringify({ error: "persist_failed", details: upErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({
    ok: true,
    meta_account: { id: probeBody.id, name: probeBody.name },
  }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
