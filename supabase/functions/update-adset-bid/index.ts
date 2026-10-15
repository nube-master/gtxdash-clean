// update-adset-bid — Atualiza bid_amount (BRL) e/ou bid_strategy de 1..N adsets Meta.
// Converte BRL -> moeda da conta -> centavos.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getAllMetaTokensForOperation } from "../_shared/getMetaToken.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Item {
  adset_id: string;
  account_id: string;
  bid_amount_brl?: number | null; // null clears the cap
  bid_strategy?: string | null;   // LOWEST_COST_WITHOUT_CAP | LOWEST_COST_WITH_BID_CAP | COST_CAP | LOWEST_COST_WITH_MIN_ROAS
}

interface Payload {
  items: Item[];
  reason?: string;
}

const ALLOWED_STRATEGIES = new Set([
  "LOWEST_COST_WITHOUT_CAP",
  "LOWEST_COST_WITH_BID_CAP",
  "COST_CAP",
  "LOWEST_COST_WITH_MIN_ROAS",
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function metaPost(adsetId: string, params: Record<string, string>, token: string) {
  const body = new URLSearchParams({ ...params, access_token: token });
  const res = await fetch(`https://graph.facebook.com/v21.0/${adsetId}`, {
    method: "POST",
    body,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || (j as any).error) {
    throw new Error((j as any).error?.message ?? `Meta ${res.status}`);
  }
  return j;
}

import { requirePrivilegedAccess } from "../_shared/requirePrivilegedAccess.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: Payload;
  try {
    const clone = req.clone();
    body = await clone.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const items = Array.isArray(body?.items) ? body.items : [];
  if (!items.length) return json({ error: "no_items" }, 400);

  const supabaseService = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // We check the first item's account to resolve the operation_id for the guard
  const firstAccountId = items[0].account_id;
  const { data: accData } = await supabaseService
    .from("meta_ad_accounts")
    .select("operation_id")
    .eq("account_id", firstAccountId)
    .maybeSingle();

  const guard = await requirePrivilegedAccess(req, accData?.operation_id);
  if (!guard.ok) return guard.response;

  const supabase = supabaseService;

  // FX
  const fx = new Map<string, number>([["BRL", 1]]);
  const { data: rates } = await supabase
    .from("exchange_rates_cache")
    .select("base_currency,rate,fetched_at")
    .eq("target_currency", "BRL")
    .order("fetched_at", { ascending: false });
  for (const r of rates ?? []) {
    const c = String(r.base_currency).toUpperCase();
    if (!fx.has(c) && Number(r.rate) > 0) fx.set(c, Number(r.rate));
  }
  if (!fx.has("USD")) fx.set("USD", 5.15);
  if (!fx.has("EUR")) fx.set("EUR", 5.60);

  // Fetch account currencies + operation_ids for the touched accounts
  const accountIds = [...new Set(items.map((i) => i.account_id).filter(Boolean))];
  const { data: accs } = await supabase
    .from("meta_ad_accounts")
    .select("account_id, currency, operation_id, account_name")
    .in("account_id", accountIds);
  const accMap = new Map<string, { currency: string; operation_id: string | null; account_name: string }>();
  for (const a of accs ?? []) {
    accMap.set(a.account_id, {
      currency: a.currency || "USD",
      operation_id: (a as any).operation_id ?? null,
      account_name: (a as any).account_name ?? a.account_id,
    });
  }

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
      const acc = accMap.get(it.account_id);
      if (!acc) throw new Error(`account_not_found:${it.account_id}`);
      const toks = await tokens(acc.operation_id);
      if (!toks.length) throw new Error("no_meta_token");

      const params: Record<string, string> = {};
      if (it.bid_strategy !== undefined && it.bid_strategy !== null) {
        if (!ALLOWED_STRATEGIES.has(it.bid_strategy)) {
          throw new Error(`invalid_bid_strategy:${it.bid_strategy}`);
        }
        params.bid_strategy = it.bid_strategy;
      }
      if (it.bid_amount_brl !== undefined) {
        if (it.bid_amount_brl === null || it.bid_amount_brl === 0) {
          // clear cap
          params.bid_amount = "0";
        } else {
          const rate = fx.get(acc.currency.toUpperCase()) ?? 1;
          const majorAcct = it.bid_amount_brl / rate;
          const cents = Math.max(1, Math.round(majorAcct * 100));
          params.bid_amount = String(cents);
        }
      }
      if (Object.keys(params).length === 0) throw new Error("nothing_to_update");

      let lastErr: any = null;
      let done = false;
      for (const tk of toks) {
        try { await metaPost(it.adset_id, params, tk); done = true; break; }
        catch (e) { lastErr = e; }
      }
      if (!done) throw lastErr ?? new Error("meta_update_failed");

      // Optimistic local update
      const patch: any = { updated_at: new Date().toISOString() };
      if (it.bid_strategy !== undefined) patch.bid_strategy = it.bid_strategy;
      if (it.bid_amount_brl !== undefined) patch.bid_amount = it.bid_amount_brl ?? null;
      await supabase.from("meta_adset_status").update(patch)
        .eq("account_id", it.account_id).eq("adset_id", it.adset_id);

      try {
        const { error: logErr } = await supabase.from("pacing_action_log").insert({
          action_type: "alert",
          campaign_id: it.adset_id,
          campaign_name: `adset:${it.adset_id}`,
          account_id: it.account_id,
          operation_id: acc.operation_id,
          success: true,
          dry_run: false,
          reason: body.reason ?? "manual_adset_bid_update",
          meta_response: { params, account_id: it.account_id, adset_id: it.adset_id } as Record<string, unknown>,
        } as any);
        if (logErr) console.error("[update-adset-bid] falha ao gravar pacing_action_log", logErr);
      } catch (_) { /* log best-effort */ }


      results.push({ adset_id: it.adset_id, ok: true });
    } catch (e) {
      results.push({ adset_id: it.adset_id, ok: false, error: String((e as Error).message || e) });
    }
  }

  return json({ success: true, results });
});
