// Shared JWT + operation/super_admin guard for privileged edge functions.
// Usage:
//   const guard = await requirePrivilegedAccess(req, operationId);
//   if (!guard.ok) return guard.response;
//   const { supabase, userId } = guard;
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export type PrivilegedGuardResult =
  | { ok: true; supabase: SupabaseClient; userId: string }
  | { ok: false; response: Response };

/**
 * Checks if the user is a non-restricted Super Admin OR has a specific role in the target operation.
 */
export async function requirePrivilegedAccess(
  req: Request, 
  operationId?: string | null
): Promise<PrivilegedGuardResult> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return { ok: false, response: jsonResponse({ error: "unauthorized" }, 401) };

  const supabaseAuth = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
    { global: { headers: { Authorization: `Bearer ${jwt}` } } },
  );
  const { data: userData, error: userErr } = await supabaseAuth.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return { ok: false, response: jsonResponse({ error: "unauthorized" }, 401) };
  }
  const userId = userData.user.id;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 1. Check if user is a Global Super Admin (unrestricted)
  const { data: adminRow } = await supabase
    .from("super_admins")
    .select("user_id, is_restricted")
    .eq("user_id", userId)
    .maybeSingle();

  if (adminRow && !adminRow.is_restricted) {
    return { ok: true, supabase, userId };
  }

  // 2. If not a global super admin, check for direct membership in the operation
  if (operationId) {
    const { data: member } = await supabase
      .from("operation_members")
      .select("role")
      .eq("operation_id", operationId)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();

    if (member && (member.role === "admin" || member.role === "owner" || member.role === "manager")) {
      return { ok: true, supabase, userId };
    }
  }

  return { ok: false, response: jsonResponse({ error: "forbidden: insufficient privileges for this operation" }, 403) };
}

/** 
 * Legacy alias to avoid breaking imports immediately, but now uses the smarter check.
 * @deprecated Use requirePrivilegedAccess
 */
export const requireSuperAdmin = (req: Request) => requirePrivilegedAccess(req);
