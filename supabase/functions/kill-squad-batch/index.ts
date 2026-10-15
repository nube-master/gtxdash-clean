// kill-squad-batch — Renomeia [top]→[xxx] E pausa múltiplas campanhas no Meta.
// Auth: exige JWT válido de super_admin. Log em pacing_action_log (action_type='kill_squad').
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

interface KillItem {
  campaign_id: string;
  account_id: string;
  campaign_name: string;
  region: "eu" | "us";
  spend3d: number;
  sales3d: number;
  cpa3d: number;
  reason: string;
}

interface Payload {
  items: KillItem[];
}

interface ItemResult {
  campaign_id: string;
  campaign_name: string;
  ok: boolean;
  new_name?: string;
  error?: string;
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function renameTopToXxx(name: string): string {
  if (/\[xxx\]|-\s*xxx\b/i.test(name)) return name;
  if (/\[top\]/i.test(name)) return name.replace(/\[top\]/i, "[xxx]");
  return name.replace(/(-\s*)top\b/i, "$1xxx");
}

async function callMetaRename(campaignId: string, newName: string, token: string) {
  const url = `https://graph.facebook.com/v21.0/${campaignId}`;
  const body = new URLSearchParams({ name: newName, status: "PAUSED", access_token: token });
  const res = await fetch(url, { method: "POST", body });
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(json.error?.message ?? `Meta API ${res.status}`);
  }
  return json;
}

function isTokenPermIssue(msg: string): boolean {
  return /does not exist|missing permissions|permission|OAuth|expired|invalid|access|#100|#200|#190/i.test(msg);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // ── Auth: valida JWT + super_admin ────────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return jsonResponse({ error: "unauthorized" }, 401);

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
      { global: { headers: { Authorization: `Bearer ${jwt}` } } },
    );
    const { data: userData, error: userErr } = await supabaseAuth.auth.getUser(jwt);
    if (userErr || !userData?.user) return jsonResponse({ error: "unauthorized" }, 401);
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
    if (!adminRow) return jsonResponse({ error: "forbidden: super_admin only" }, 403);

    // ── Kill switch global ────────────────────────────────────────────────
    const { data: killSwitch } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "kill_squad_disabled")
      .maybeSingle();
    if (killSwitch?.value === true || (killSwitch?.value as any)?.enabled === true) {
      return jsonResponse({ error: "kill_squad_disabled globally" }, 423);
    }

    // ── Payload ───────────────────────────────────────────────────────────
    const body = (await req.json()) as Payload;
    if (!body?.items?.length) return jsonResponse({ error: "no items" }, 400);
    if (body.items.length > 100) return jsonResponse({ error: "batch max 100" }, 400);

    // ── Loop ─────────────────────────────────────────────────────────────
    const batchId = crypto.randomUUID();
    const results: ItemResult[] = [];
    // Pré-carrega tokens uma vez (todas as contas usam mesmo pool na prática)
    const { operationId: rootOpId } = await getOperationFromContext({ accountId: body.items[0].account_id });
    const tokensWithMeta = await getAllMetaTokensForOperation(rootOpId);
    let tokenPool: string[] = tokensWithMeta.map((t) => t.token);
    if (tokenPool.length === 0) tokenPool = await getAllMetaAccessTokens(supabase as any);

    if (tokenPool.length === 0) {
      return jsonResponse({ error: "no_meta_token_configured" }, 500);
    }

    for (const item of body.items) {
      // Skip órfãs
      if (!/^\d+$/.test(item.campaign_id)) {
        results.push({ campaign_id: item.campaign_id, campaign_name: item.campaign_name, ok: false, error: "invalid campaign_id" });
        continue;
      }

      const newName = renameTopToXxx(item.campaign_name);
      if (newName === item.campaign_name) {
        // já é [xxx] — só pausar mesmo assim
      }

      // Chama Meta com fallback de tokens
      let lastErr: string | null = null;
      let ok = false;
      for (const token of tokenPool) {
        try {
          await callMetaRename(item.campaign_id, newName, token);
          ok = true;
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e instanceof Error ? e.message : String(e);
          if (!isTokenPermIssue(lastErr)) break;
        }
      }

      // Log em pacing_action_log
      await supabase.from("pacing_action_log").insert({
        campaign_id: item.campaign_id,
        campaign_name: item.campaign_name,
        account_id: item.account_id,
        action_type: "kill_squad",
        reason: item.reason,
        spend_at_action: item.spend3d,
        sales_last_hour: null,
        dry_run: false,
        success: ok,
        batch_id: batchId,
        killed_by: userId,
        region: item.region,
        meta_response: {
          region: item.region,
          new_name: newName,
          previous_name: item.campaign_name,
          spend3d: item.spend3d,
          sales3d: item.sales3d,
          cpa3d: item.cpa3d,
          error: lastErr,
          killed_by: userId,
          batch_id: batchId,
        } as Record<string, unknown>,
      });

      if (ok) {
        // Sticky cooldown pra bloquear regras de religar automático
        const stickyUntil = new Date();
        stickyUntil.setUTCFullYear(stickyUntil.getUTCFullYear() + 100);
        await supabase.from("pacing_cooldowns").delete().eq("campaign_id", item.campaign_id);
        await supabase.from("pacing_cooldowns").insert({
          campaign_id: item.campaign_id,
          rule_id: null,
          snoozed_until: stickyUntil.toISOString(),
          reason: `Kill Squad — ${item.reason}`,
          set_by: "manual",
        });

        // Cache local
        await supabase
          .from("meta_campaign_status")
          .update({
            campaign_name: newName,
            status: "PAUSED",
            effective_status: "PAUSED",
            updated_at: new Date().toISOString(),
          })
          .eq("campaign_id", item.campaign_id);

        results.push({ campaign_id: item.campaign_id, campaign_name: item.campaign_name, ok: true, new_name: newName });
      } else {
        results.push({ campaign_id: item.campaign_id, campaign_name: item.campaign_name, ok: false, error: lastErr ?? "unknown" });
      }
    }

    const killed = results.filter((r) => r.ok).length;
    const failed = results.length - killed;

    return jsonResponse({
      success: true,
      batch_id: batchId,
      killed,
      failed,
      results,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[kill-squad-batch]", msg);
    return jsonResponse({ error: msg }, 500);
  }
});
