import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: claimsData, error: claimsErr } = await anonClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const callerId = claimsData.claims.sub;
    const { data: callerRoles } = await anonClient.from("user_roles").select("role").eq("user_id", callerId);
    if (!callerRoles?.some((r: any) => r.role === "admin")) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: { users }, error } = await adminClient.auth.admin.listUsers();
    if (error) throw error;

    // Get all roles, profiles, and page permissions
    const { data: allRoles } = await adminClient.from("user_roles").select("user_id, role");
    const { data: allProfiles } = await adminClient.from("profiles").select("user_id, display_name");
    const { data: allPerms } = await adminClient.from("user_page_permissions").select("user_id, allowed_pages");

    const rolesMap = new Map<string, string[]>();
    for (const r of (allRoles || [])) {
      if (!rolesMap.has(r.user_id)) rolesMap.set(r.user_id, []);
      rolesMap.get(r.user_id)!.push(r.role);
    }

    const namesMap = new Map<string, string>();
    for (const p of (allProfiles || [])) {
      namesMap.set(p.user_id, p.display_name || "");
    }

    const permsMap = new Map<string, string[]>();
    for (const p of (allPerms || [])) {
      permsMap.set(p.user_id, p.allowed_pages || []);
    }

    const result = users.map((u) => ({
      id: u.id,
      email: u.email,
      display_name: namesMap.get(u.id) || "",
      roles: rolesMap.get(u.id) || [],
      allowed_pages: permsMap.get(u.id) || null,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at || null,
    }));

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: unknown) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
