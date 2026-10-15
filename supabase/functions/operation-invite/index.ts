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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userErr } = await anonClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const { action, operation_id } = body;

    if (!operation_id) {
      return new Response(JSON.stringify({ error: "operation_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    // Verify caller is owner or admin of the operation
    const { data: callerMembership } = await adminClient
      .from("operation_members")
      .select("role")
      .eq("operation_id", operation_id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();

    // Also check super_admins
    const { data: isSA } = await adminClient
      .from("super_admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const isOwnerOrAdmin = callerMembership?.role === "owner" || callerMembership?.role === "admin" || !!isSA;
    if (!isOwnerOrAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── LIST MEMBERS ──
    if (action === "list") {
      const { data: members } = await adminClient
        .from("operation_members")
        .select("id, user_id, role, status, joined_at")
        .eq("operation_id", operation_id);

      const { data: invites } = await adminClient
        .from("operation_invites")
        .select("id, email, role, token, created_at, expires_at, accepted_at")
        .eq("operation_id", operation_id)
        .is("accepted_at", null);

      const userIds = (members || []).map(m => m.user_id);
      let profiles: any[] = [];
      let userEmails: Map<string, string> = new Map();
      let pagePerms: Map<string, string[] | null> = new Map();

      if (userIds.length > 0) {
        const [profilesRes, permsRes] = await Promise.all([
          adminClient.from("profiles").select("user_id, display_name, avatar_url").in("user_id", userIds),
          adminClient
            .from("user_page_permissions")
            .select("user_id, allowed_pages")
            .eq("operation_id", operation_id)
            .in("user_id", userIds),
        ]);
        profiles = profilesRes.data || [];
        for (const p of (permsRes.data || [])) {
          pagePerms.set(p.user_id, p.allowed_pages);
        }

        const { data: { users: authUsers } } = await adminClient.auth.admin.listUsers();
        for (const au of (authUsers || [])) {
          if (userIds.includes(au.id)) {
            userEmails.set(au.id, au.email || "");
          }
        }
      }

      const profileMap = new Map(profiles.map(p => [p.user_id, p]));

      const enrichedMembers = (members || []).map(m => ({
        ...m,
        email: userEmails.get(m.user_id) || "",
        display_name: profileMap.get(m.user_id)?.display_name || "",
        avatar_url: profileMap.get(m.user_id)?.avatar_url || null,
        allowed_pages: pagePerms.get(m.user_id) || null,
      }));

      return new Response(JSON.stringify({ members: enrichedMembers, invites: invites || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── CREATE MEMBER (with password) ──
    if (action === "create_member") {
      const { email, password, role, allowed_pages } = body;
      if (!email || !password) {
        return new Response(JSON.stringify({ error: "email and password required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Check plan member limit
      const { data: opData } = await adminClient
        .from("operations")
        .select("max_members")
        .eq("id", operation_id)
        .single();

      if (opData?.max_members != null) {
        const { count } = await adminClient
          .from("operation_members")
          .select("id", { count: "exact", head: true })
          .eq("operation_id", operation_id)
          .eq("status", "active");

        if ((count ?? 0) >= opData.max_members) {
          return new Response(
            JSON.stringify({ error: `Limite de ${opData.max_members} membros atingido. Faça upgrade do plano.` }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      const memberRole = role || "member";
      const displayName = email.split("@")[0];

      // Check if user already exists
      const { data: { users: existingUsers } } = await adminClient.auth.admin.listUsers();
      const existingUser = existingUsers?.find(u => u.email === email);

      if (existingUser) {
        // Check if already a member
        const { data: alreadyMember } = await adminClient
          .from("operation_members")
          .select("id")
          .eq("operation_id", operation_id)
          .eq("user_id", existingUser.id)
          .maybeSingle();

        if (alreadyMember) {
          return new Response(JSON.stringify({ error: "Usuário já é membro desta operação" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Add existing user directly
        await adminClient.from("operation_members").insert({
          operation_id,
          user_id: existingUser.id,
          role: memberRole,
          status: "active",
        });

        if (allowed_pages && Array.isArray(allowed_pages) && allowed_pages.length > 0 && memberRole !== "admin") {
          await adminClient.from("user_page_permissions").upsert({
            user_id: existingUser.id,
            operation_id,
            allowed_pages,
          }, { onConflict: "user_id,operation_id" });
        }

        return new Response(JSON.stringify({ success: true, user_id: existingUser.id }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Create new user with password
      const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: displayName },
      });

      if (createErr) {
        return new Response(JSON.stringify({ error: createErr.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Add as member
      await adminClient.from("operation_members").insert({
        operation_id,
        user_id: newUser.user.id,
        role: memberRole,
        status: "active",
      });

      // Set user_roles
      await adminClient.from("user_roles").insert({ user_id: newUser.user.id, role: memberRole });

      // Set page permissions
      if (allowed_pages && Array.isArray(allowed_pages) && allowed_pages.length > 0 && memberRole !== "admin") {
        await adminClient.from("user_page_permissions").upsert({
          user_id: newUser.user.id,
          operation_id,
          allowed_pages,
        }, { onConflict: "user_id,operation_id" });
      }

      return new Response(JSON.stringify({ success: true, user_id: newUser.user.id, created: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── INVITE ──
    if (action === "invite") {
      const { email, role, allowed_pages } = body;
      if (!email) {
        return new Response(JSON.stringify({ error: "email required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Check plan member limit
      const { data: opData } = await adminClient
        .from("operations")
        .select("max_members")
        .eq("id", operation_id)
        .single();

      if (opData?.max_members != null) {
        const { count } = await adminClient
          .from("operation_members")
          .select("id", { count: "exact", head: true })
          .eq("operation_id", operation_id)
          .eq("status", "active");

        if ((count ?? 0) >= opData.max_members) {
          return new Response(
            JSON.stringify({ error: `Limite de ${opData.max_members} membros atingido. Faça upgrade do plano.` }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      const memberRole = role || "member";
      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const { data: { users: existingUsers } } = await adminClient.auth.admin.listUsers();
      const existingUser = existingUsers?.find(u => u.email === email);
      
      if (existingUser) {
        const { data: alreadyMember } = await adminClient
          .from("operation_members")
          .select("id")
          .eq("operation_id", operation_id)
          .eq("user_id", existingUser.id)
          .maybeSingle();

        if (alreadyMember) {
          return new Response(JSON.stringify({ error: "Usuário já é membro desta operação" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        await adminClient.from("operation_members").insert({
          operation_id,
          user_id: existingUser.id,
          role: memberRole,
          status: "active",
        });

        // Set page permissions if provided
        if (allowed_pages && Array.isArray(allowed_pages) && allowed_pages.length > 0) {
          await adminClient.from("user_page_permissions").upsert({
            user_id: existingUser.id,
            operation_id,
            allowed_pages,
          }, { onConflict: "user_id,operation_id" });
        }

        return new Response(JSON.stringify({ success: true, added_directly: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: existingInvite } = await adminClient
        .from("operation_invites")
        .select("id")
        .eq("operation_id", operation_id)
        .eq("email", email)
        .is("accepted_at", null)
        .maybeSingle();

      if (existingInvite) {
        return new Response(JSON.stringify({ error: "Já existe um convite pendente para este email" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      await adminClient.from("operation_invites").insert({
        operation_id,
        email,
        role: memberRole,
        token,
        invited_by: user.id,
        expires_at: expiresAt,
      });

      const { error: createErr } = await adminClient.auth.admin.inviteUserByEmail(email);
      if (createErr) {
        console.warn("Invite email failed (user may need to sign up manually):", createErr.message);
      }

      return new Response(JSON.stringify({ success: true, invited: true, token }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── UPDATE ROLE ──
    if (action === "update_role") {
      const { member_id, new_role, allowed_pages } = body;
      if (!member_id || !new_role) {
        return new Response(JSON.stringify({ error: "member_id and new_role required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: target } = await adminClient
        .from("operation_members")
        .select("role, user_id")
        .eq("id", member_id)
        .single();

      if (target?.role === "owner") {
        return new Response(JSON.stringify({ error: "Não é possível alterar o papel do proprietário" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      await adminClient.from("operation_members").update({ role: new_role }).eq("id", member_id);

      // Update page permissions
      if (target?.user_id) {
        if (new_role === "admin") {
          // Admins get full access — remove restriction (only for this operation)
          await adminClient
            .from("user_page_permissions")
            .delete()
            .eq("user_id", target.user_id)
            .eq("operation_id", operation_id);
        } else if (allowed_pages && Array.isArray(allowed_pages)) {
          await adminClient.from("user_page_permissions").upsert({
            user_id: target.user_id,
            operation_id,
            allowed_pages,
          }, { onConflict: "user_id,operation_id" });
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── UPDATE PAGES ONLY ──
    if (action === "update_pages") {
      const { user_id: targetUserId, allowed_pages } = body;
      if (!targetUserId || !allowed_pages) {
        return new Response(JSON.stringify({ error: "user_id and allowed_pages required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      await adminClient.from("user_page_permissions").upsert({
        user_id: targetUserId,
        operation_id,
        allowed_pages,
      }, { onConflict: "user_id,operation_id" });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── REMOVE MEMBER ──
    if (action === "remove") {
      const { member_id } = body;
      if (!member_id) {
        return new Response(JSON.stringify({ error: "member_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: target } = await adminClient
        .from("operation_members")
        .select("role, user_id")
        .eq("id", member_id)
        .single();

      if (target?.role === "owner") {
        return new Response(JSON.stringify({ error: "Não é possível remover o proprietário" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      await adminClient.from("operation_members").delete().eq("id", member_id);
      // Also clean up page permissions FOR THIS OPERATION ONLY
      if (target?.user_id) {
        await adminClient
          .from("user_page_permissions")
          .delete()
          .eq("user_id", target.user_id)
          .eq("operation_id", operation_id);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── CANCEL INVITE ──
    if (action === "cancel_invite") {
      const { invite_id } = body;
      if (!invite_id) {
        return new Response(JSON.stringify({ error: "invite_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      await adminClient.from("operation_invites").delete().eq("id", invite_id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: unknown) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
