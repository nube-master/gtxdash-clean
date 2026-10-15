// refresh-meta-account-names
// Busca na Meta o nome real das contas que ficaram com nome provisório
// ("Conta act_...") e atualiza meta_ad_accounts.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getAllMetaTokensForOperation, getAllMetaAccessTokens } from "../_shared/getMetaToken.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const GRAPH = "https://graph.facebook.com/v21.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({} as any));
    const operationId = body?.operation_id as string | undefined;
    if (!operationId) return json({ error: "operation_id_required" }, 400);

    const { data: accounts, error: accErr } = await supabase
      .from("meta_ad_accounts")
      .select("account_id, account_name")
      .eq("operation_id", operationId)
      .like("account_name", "Conta act_%");
    if (accErr) throw accErr;
    const targets = (accounts ?? []) as Array<{ account_id: string; account_name: string }>;
    if (targets.length === 0) return json({ ok: true, pending: 0, updated: 0 });

    const pool = await getAllMetaTokensForOperation(operationId);
    let tokens = pool.map((t) => t.token);
    if (tokens.length === 0) tokens = await getAllMetaAccessTokens(supabase as any);
    if (tokens.length === 0) return json({ error: "no_tokens" }, 400);

    const resolved = new Map<string, string>();
    const failures: Array<{ account_id: string; error: string }> = [];

    for (const t of targets) {
      const id = String(t.account_id).startsWith("act_") ? t.account_id : `act_${t.account_id}`;
      let name: string | null = null;
      let lastErr = "not_found";
      for (const token of tokens) {
        try {
          const res = await fetch(
            `${GRAPH}/${id}?fields=name,currency,timezone_name&access_token=${encodeURIComponent(token)}`,
          );
          const j = await res.json();
          if (j?.error) { lastErr = j.error.message ?? "graph_error"; continue; }
          if (j?.name) { name = String(j.name); break; }
        } catch (e) {
          lastErr = e instanceof Error ? e.message : String(e);
        }
      }
      if (name) resolved.set(t.account_id, name);
      else failures.push({ account_id: t.account_id, error: lastErr });
    }

    let updated = 0;
    for (const [accountId, name] of resolved) {
      const { error } = await supabase
        .from("meta_ad_accounts")
        .update({ account_name: name, updated_at: new Date().toISOString() })
        .eq("operation_id", operationId)
        .eq("account_id", accountId);
      if (!error) updated++;
    }

    return json({ ok: true, pending: targets.length, updated, failures });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[refresh-meta-account-names]", msg);
    return json({ error: msg }, 500);
  }
});
