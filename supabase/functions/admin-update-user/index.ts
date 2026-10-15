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
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await anonClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerId = claimsData.claims.sub as string;

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: callerRoles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);
    const isAdmin = callerRoles?.some((r: any) => r.role === "admin");
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { user_id, password, display_name, role, allowed_pages } = await req.json();
    if (!user_id) {
      return new Response(JSON.stringify({ error: "Missing user_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const changes: Record<string, unknown> = {};

    // Update auth user (password and/or metadata)
    const authUpdate: any = {};
    if (password && password.length >= 6) {
      authUpdate.password = password;
      changes.password_changed = true;
    }
    if (display_name !== undefined) {
      authUpdate.user_metadata = { display_name };
      changes.display_name = display_name;
    }

    if (Object.keys(authUpdate).length > 0) {
      const { error: updateErr } = await adminClient.auth.admin.updateUserById(user_id, authUpdate);
      if (updateErr) {
        return new Response(JSON.stringify({ error: updateErr.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Update display_name in profiles table
    if (display_name !== undefined) {
      await adminClient
        .from("profiles")
        .update({ display_name })
        .eq("user_id", user_id);
    }

    // Update role if provided
    if (role) {
      changes.role = role;
      await adminClient
        .from("user_roles")
        .update({ role })
        .eq("user_id", user_id);
    }

    // Update page permissions if provided
    if (allowed_pages !== undefined) {
      changes.allowed_pages = allowed_pages;
      if (allowed_pages === null) {
        await adminClient
          .from("user_page_permissions")
          .delete()
          .eq("user_id", user_id);
      } else {
        await adminClient
          .from("user_page_permissions")
          .upsert({ user_id, allowed_pages }, { onConflict: "user_id" });
      }
    }

    // Log activity
    await logActivity(adminClient, callerId, "", "user_updated", {
      target_user_id: user_id,
      changes,
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
