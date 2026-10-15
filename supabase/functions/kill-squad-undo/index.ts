// kill-squad-undo — Reverte uma ação do Kill Squad: renomeia [xxx]→[top] e reativa.
// Auth: super_admin. Aceita { log_id } ou { batch_id }. Só reverte ações das últimas 24h.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  getAllMetaAccessTokens,
  getAllMetaTokensForOperation,
  getOperationFromContext,
} from "../_shared/getMetaToken.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function renameXxxToTop(name: string): string {
  if (/\[top\]|-\s*top\b/i.test(name)) return name;
  if (/\[xxx\]/i.test(name)) return name.replace(/\[xxx\]/i, "[top]");
  return name.replace(/(-\s*)xxx\b/i, "$1top");
}

async function callMetaRestore(campaignId: string, newName: string, token: string) {
  const url = `https://graph.facebook.com/v21.0/${campaignId}`;
  const body = new URLSearchParams({ name: newName, status: "ACTIVE", access_token: token });
  const res = await fetch(url, { method: "POST", body });
  const j = await res.json();
  if (!res.ok || j.error) throw new Error(j.error?.message ?? `Meta API ${res.status}`);
  return j;
}

function isTokenPermIssue(msg: string): boolean {
  return /does not exist|missing permissions|permission|OAuth|expired|invalid|access|#100|#200|#190/i.test(msg);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "unauthorized" }, 401);

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
      { global: { headers: { Authorization: `Bearer ${jwt}` } } },
    );
    const { data: userData, error: userErr } = await supabaseAuth.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
    const userId = userData.user.id;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: adminRow } = await supabase
      .from("super_admins")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!adminRow) return json({ error: "forbidden: super_admin only" }, 403);

    const body = await req.json() as { log_id?: string; batch_id?: string };
    if (!body?.log_id && !body?.batch_id) return json({ error: "log_id or batch_id required" }, 400);

    // Carrega logs candidatos (últimas 24h, kill_squad, success=true)
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    let q = supabase
      .from("pacing_action_log")
      .select("id,campaign_id,campaign_name,account_id,batch_id,meta_response,triggered_at,success")
      .eq("action_type", "kill_squad")
      .eq("success", true)
      .gte("triggered_at", cutoff);
    if (body.log_id) q = q.eq("id", body.log_id);
    if (body.batch_id) q = q.eq("batch_id", body.batch_id);

    const { data: logs, error: logsErr } = await q;
    if (logsErr) return json({ error: logsErr.message }, 500);
    if (!logs?.length) return json({ error: "no eligible actions found (must be <24h old, success)" }, 404);
    if (logs.length > 100) return json({ error: "batch max 100" }, 400);

    // Prepara tokens
    const { operationId: rootOpId } = await getOperationFromContext({ accountId: logs[0].account_id });
    const tokensWithMeta = await getAllMetaTokensForOperation(rootOpId);
    let tokenPool: string[] = tokensWithMeta.map((t) => t.token);
    if (tokenPool.length === 0) tokenPool = await getAllMetaAccessTokens(supabase as any);
    if (tokenPool.length === 0) return json({ error: "no_meta_token_configured" }, 500);

    const results: Array<{ log_id: string; campaign_id: string; ok: boolean; new_name?: string; error?: string }> = [];
    const undoBatchId = crypto.randomUUID();

    for (const log of logs) {
      const prevName = (log.meta_response as any)?.previous_name as string | undefined;
      const currentName = (log.meta_response as any)?.new_name as string | undefined ?? log.campaign_name;
      const restoredName = prevName ?? renameXxxToTop(currentName);

      let lastErr: string | null = null;
      let ok = false;
      for (const token of tokenPool) {
        try {
          await callMetaRestore(log.campaign_id, restoredName, token);
          ok = true;
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e instanceof Error ? e.message : String(e);
          if (!isTokenPermIssue(lastErr)) break;
        }
      }

      // Log da reversão
      await supabase.from("pacing_action_log").insert({
        campaign_id: log.campaign_id,
        campaign_name: restoredName,
        account_id: log.account_id,
        action_type: "resume",
        reason: `↩️ Undo Kill Squad (log ${log.id.slice(0, 8)})`,
        dry_run: false,
        success: ok,
        batch_id: undoBatchId,
        killed_by: userId,
        region: (log.meta_response as any)?.region ?? null,
        meta_response: {
          undo_of_log_id: log.id,
          undo_of_batch_id: log.batch_id,
          restored_name: restoredName,
          previous_kill_name: currentName,
          error: lastErr,
        },
      });

      if (ok) {
        // Remove sticky cooldown
        await supabase.from("pacing_cooldowns").delete().eq("campaign_id", log.campaign_id);
        // Atualiza cache local
        await supabase
          .from("meta_campaign_status")
          .update({
            campaign_name: restoredName,
            status: "ACTIVE",
            effective_status: "ACTIVE",
            updated_at: new Date().toISOString(),
          })
          .eq("campaign_id", log.campaign_id);
        results.push({ log_id: log.id, campaign_id: log.campaign_id, ok: true, new_name: restoredName });
      } else {
        results.push({ log_id: log.id, campaign_id: log.campaign_id, ok: false, error: lastErr ?? "unknown" });
      }
    }

    const restored = results.filter((r) => r.ok).length;
    return json({ success: true, undo_batch_id: undoBatchId, restored, failed: results.length - restored, results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[kill-squad-undo]", msg);
    return json({ error: msg }, 500);
  }
});
