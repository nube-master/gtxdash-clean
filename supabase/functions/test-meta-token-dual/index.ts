// TEMPORÁRIA — F8.B.5 dual-read test. Deletar após validação.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getMetaAccessToken, getMetaTokenForOperation } from "../_shared/getMetaToken.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type, apikey",
      },
    });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "XXX_NO_MATCH";
  let ok = authHeader.includes(serviceKey);
  if (!ok && authHeader.startsWith("Bearer ")) {
    try {
      const jwt = authHeader.replace(/^Bearer\s+/i, "");
      const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
      const { data: u } = await admin.auth.getUser(jwt);
      if (u?.user) {
        const { data: sa } = await admin
          .from("super_admins").select("user_id").eq("user_id", u.user.id).maybeSingle();
        ok = !!sa;
      }
    } catch { /* ignore */ }
  }
  if (!ok) {
    return new Response(JSON.stringify({ error: "unauthorized — service_role or super_admin required" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const opId = url.searchParams.get("op_id") ?? "0b758a2b-1b92-4769-b47b-416c567e320d";
  const accountId = url.searchParams.get("account_id") ?? undefined;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Check flag current state (for context)
  const { data: flagRow } = await supabase
    .from("feature_flags")
    .select("key, enabled, operation_ids")
    .eq("key", "operation_credentials_vault")
    .maybeSingle();

  const results: Record<string, unknown> = {
    inputs: { op_id: opId, account_id: accountId ?? null },
    flag_state: flagRow ?? null,
  };

  const summarize = (t: string | null) =>
    t
      ? {
          ok: true,
          length: t.length,
          first_char: t.charAt(0),
          last_char: t.charAt(t.length - 1),
          fingerprint_first8: t.slice(0, 8),
          fingerprint_last8: t.slice(-8),
        }
      : { ok: false, error: "null token" };

  // Test 1: legacy path
  try {
    const t = await getMetaAccessToken(supabase);
    results.legacy = summarize(t);
  } catch (e) {
    results.legacy = { ok: false, error: (e as Error).message };
  }

  // Test 2: multi-tenant aware — behavior depends on flag
  try {
    const t = await getMetaTokenForOperation(opId, accountId);
    results.for_operation = summarize(t);
  } catch (e) {
    results.for_operation = { ok: false, error: (e as Error).message };
  }

  // Compare
  const legacy = results.legacy as any;
  const forOp = results.for_operation as any;
  if (legacy?.ok && forOp?.ok) {
    results.match = {
      same_fingerprint:
        legacy.fingerprint_first8 === forOp.fingerprint_first8 &&
        legacy.fingerprint_last8 === forOp.fingerprint_last8,
      same_length: legacy.length === forOp.length,
    };
  }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { "content-type": "application/json" },
  });
});
