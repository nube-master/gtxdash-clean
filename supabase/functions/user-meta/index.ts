import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing auth header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims?.sub) {
      console.error("[user-meta] getClaims failed:", claimsError?.message);
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;

    const adminClient = createClient(supabaseUrl, serviceKey);

    const [profileRes, rolesRes, permsRes] = await Promise.all([
      adminClient.from("profiles").select("display_name, email, avatar_url").eq("user_id", userId).single(),
      adminClient.from("user_roles").select("role").eq("user_id", userId),
      adminClient.from("user_page_permissions").select("operation_id, allowed_pages").eq("user_id", userId),
    ]);

    const roles = (rolesRes.data || []).map((r: any) => r.role);
    const isAdmin = roles.includes("admin");

    // Build per-operation permissions map. `allowedPages` (legacy) stays null so
    // clients fall back to `permissionsByOperation` scoped to the active op.
    const permissionsByOperation: Record<string, string[]> = {};
    for (const row of (permsRes.data || [])) {
      if (row?.operation_id && Array.isArray(row?.allowed_pages)) {
        permissionsByOperation[row.operation_id] = row.allowed_pages;
      }
    }

    // Log login activity (fire-and-forget)
    adminClient.from("user_activity_logs").insert({
      user_id: userId,
      user_email: profileRes.data?.email || "",
      action: "login",
      details: {},
    }).then(() => {}, () => {});

    return new Response(
      JSON.stringify({
        displayName: profileRes.data?.display_name || "",
        avatarUrl: profileRes.data?.avatar_url || null,
        roles,
        allowedPages: null,
        permissionsByOperation: isAdmin ? {} : permissionsByOperation,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("[user-meta] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
