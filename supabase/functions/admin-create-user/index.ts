import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function logActivity(adminClient: any, userId: string, userEmail: string, action: string, details: Record<string, unknown> = {}) {
  try {
    await adminClient.from("user_activity_logs").insert({ user_id: userId, user_email: userEmail, action, details });
  } catch (e) {
    console.error("[activity-log] failed:", e);
  }
}

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
    const isAdmin = callerRoles?.some((r: any) => r.role === "admin");
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { email, password, display_name, role, allowed_pages, invite } = await req.json();
    if (!email || !role) {
      return new Response(JSON.stringify({ error: "Missing email or role" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // If not invite mode, password is required
    if (!invite && !password) {
      return new Response(JSON.stringify({ error: "Missing password" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let userId: string;

    if (invite) {
      // Invite mode: create user and send invitation email
      const { data: inviteData, error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(email, {
        data: { display_name: display_name || email.split("@")[0] },
      });

      if (inviteErr) {
        return new Response(JSON.stringify({ error: inviteErr.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      userId = inviteData.user.id;
    } else {
      // Direct creation with password
      const { data: userData, error: createErr } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: display_name || email.split("@")[0] },
      });

      if (createErr) {
        return new Response(JSON.stringify({ error: createErr.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      userId = userData.user.id;
    }

    await adminClient.from("user_roles").insert({ user_id: userId, role });

    if (allowed_pages && Array.isArray(allowed_pages) && role !== "admin") {
      await adminClient.from("user_page_permissions").upsert({
        user_id: userId,
        allowed_pages,
      }, { onConflict: "user_id" });
    }

    // Log activity
    await logActivity(adminClient, callerId as string, "", "user_created", {
      target_user_id: userId,
      target_email: email,
      role,
      display_name: display_name || email.split("@")[0],
      method: invite ? "invite" : "password",
    });

    return new Response(JSON.stringify({ success: true, user_id: userId, invited: !!invite }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: unknown) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
