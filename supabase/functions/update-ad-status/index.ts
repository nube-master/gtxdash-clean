// update-ad-status — pausar/ativar 1..N anúncios individuais na Meta.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getAllMetaTokensForOperation } from "../_shared/getMetaToken.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Item {
  ad_id: string;
  account_id: string;
  status: "ACTIVE" | "PAUSED";
}
interface Payload { items: Item[]; reason?: string }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function metaPost(adId: string, params: Record<string, string>, token: string) {
  const body = new URLSearchParams({ ...params, access_token: token });
  const res = await fetch(`https://graph.facebook.com/v21.0/${adId}`, { method: "POST", body });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || (j as any).error) throw new Error((j as any).error?.message ?? `Meta ${res.status}`);
  return j;
}

import { requireSuperAdmin } from "../_shared/requireSuperAdmin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const guard = await requireSuperAdmin(req);
  if (!guard.ok) return guard.response;



  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: Payload;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const items = Array.isArray(body?.items) ? body.items : [];
  if (!items.length) return json({ error: "no_items" }, 400);

  const accountIds = [...new Set(items.map((i) => i.account_id).filter(Boolean))];
  const { data: accs } = await supabase.from("meta_ad_accounts")
    .select("account_id, operation_id").in("account_id", accountIds);
  const accMap = new Map<string, { operation_id: string | null }>();
  for (const a of accs ?? []) accMap.set(a.account_id, { operation_id: (a as any).operation_id ?? null });

  const tokenCache = new Map<string, string[]>();
  async function tokens(opId?: string | null) {
    const k = opId || "__legacy__";
    if (!tokenCache.has(k)) {
      const t = await getAllMetaTokensForOperation(opId || "");
      tokenCache.set(k, t.map((x) => x.token));
    }
    return tokenCache.get(k) ?? [];
  }

  const results: any[] = [];
  for (const it of items) {
    try {
      if (it.status !== "ACTIVE" && it.status !== "PAUSED") throw new Error("invalid_status");
      const acc = accMap.get(it.account_id);
      const toks = await tokens(acc?.operation_id);
      if (!toks.length) throw new Error("no_meta_token");

      let lastErr: any = null;
      let done = false;
      for (const tk of toks) {
        try { await metaPost(it.ad_id, { status: it.status }, tk); done = true; break; }
        catch (e) { lastErr = e; }
      }
      if (!done) throw lastErr ?? new Error("meta_update_failed");

      await supabase.from("meta_ad_status").update({
        status: it.status,
        effective_status: it.status,
        updated_at: new Date().toISOString(),
      }).eq("ad_id", it.ad_id);

      await supabase.from("pacing_action_log").insert({
        action_type: it.status === "PAUSED" ? "pause_ad" : "activate_ad",
        campaign_id: it.ad_id,
        campaign_name: `ad:${it.ad_id}`,
        success: true,
        dry_run: false,
        reason: body.reason ?? "manual_ad_status",
        meta: { account_id: it.account_id, operation_id: acc?.operation_id },
      } as any).catch(() => {});

      results.push({ ad_id: it.ad_id, ok: true });
    } catch (e) {
      results.push({ ad_id: it.ad_id, ok: false, error: String((e as Error).message || e) });
    }
  }

  return json({ success: true, results });
});
