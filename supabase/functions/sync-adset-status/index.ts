// sync-adset-status — Snapshot Meta adsets (bid_amount, bid_strategy, budget, optimization_goal)
// into public.meta_adset_status. Mirrors sync-campaign-status but at adset level.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getAllMetaTokensForOperation } from "../_shared/getMetaToken.ts";
import { requirePrivilegedAccess } from "../_shared/requirePrivilegedAccess.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const META_API = "https://graph.facebook.com/v21.0";
const FIELDS =
  "id,name,status,effective_status,campaign_id,campaign{name,bid_strategy},daily_budget,lifetime_budget,bid_strategy,bid_amount,optimization_goal,billing_event";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let operationFilter: string | null = null;
  try {
    const url = new URL(req.url);
    operationFilter = url.searchParams.get("operation_id") || null;
    if (!operationFilter) {
      const body = await req.clone().json().catch(() => null);
      operationFilter = body?.operation_id || null;
    }
  } catch { /* ignore */ }

  const guard = await requirePrivilegedAccess(req, operationFilter);
  if (!guard.ok) return guard.response;

  const supabase = createClient(

    // Only sync accounts that currently have ACTIVE campaigns — avoids scanning
    // 100+ dormant accounts and blowing the edge function timeout.
    let campQ = supabase
      .from("meta_campaign_status")
      .select("account_id")
      .eq("status", "ACTIVE");
    if (operationFilter) campQ = campQ.eq("operation_id", operationFilter);
    const { data: activeCamps } = await campQ.limit(10000);
    const activeAccIds = [...new Set((activeCamps ?? []).map((c: any) => c.account_id))];
    if (!activeAccIds.length) {
      return new Response(
        JSON.stringify({ success: true, adsets: 0, message: "No accounts with active campaigns" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let accountsQ = supabase
      .from("meta_ad_accounts")
      .select("account_id, account_name, currency, operation_id")
      .eq("is_active", true)
      .in("account_id", activeAccIds);
    if (operationFilter) accountsQ = accountsQ.eq("operation_id", operationFilter);
    const { data: accounts } = await accountsQ;
    if (!accounts?.length) {
      return new Response(
        JSON.stringify({ success: true, adsets: 0, message: "No active accounts" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // FX
    const fx = new Map<string, number>([["BRL", 1]]);
    const { data: rates } = await supabase
      .from("exchange_rates_cache")
      .select("base_currency,target_currency,rate,fetched_at")
      .eq("target_currency", "BRL")
      .order("fetched_at", { ascending: false });
    for (const r of rates ?? []) {
      const c = String(r.base_currency).toUpperCase();
      if (!fx.has(c) && Number(r.rate) > 0) fx.set(c, Number(r.rate));
    }
    if (!fx.has("USD")) fx.set("USD", 5.15);
    if (!fx.has("EUR")) fx.set("EUR", 5.60);
    const toBrl = (major: number, cur: string) => {
      if (!(major > 0)) return 0;
      const rate = fx.get(String(cur || "USD").toUpperCase()) ?? 1;
      return Number((major * rate).toFixed(4));
    };

    const tokenCache = new Map<string, string[]>();
    async function tokens(opId?: string | null) {
      const k = opId || "__legacy__";
      if (!tokenCache.has(k)) {
        const t = await getAllMetaTokensForOperation(opId || "");
        tokenCache.set(k, t.map((x) => x.token));
      }
      return tokenCache.get(k) ?? [];
    }

    const errors: string[] = [];
    let insertedTotal = 0;

    async function upsertBatch(rows: any[]) {
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500);
        const { error } = await supabase
          .from("meta_adset_status")
          .upsert(batch, { onConflict: "account_id,adset_id" });
        if (error) errors.push(`upsert: ${error.message}`);
        else insertedTotal += batch.length;
      }
    }

    const CONCURRENCY = 25;
    async function processAccount(acc: any) {
      const rows: any[] = [];
      const actId = `act_${acc.account_id}`;
      const toks = await tokens(acc.operation_id);
      if (!toks.length) { errors.push(`${acc.account_name}: no token`); return rows; }

      for (const tk of toks) {
        try {
          let nextUrl: string | null =
            `${META_API}/${actId}/adsets?fields=${encodeURIComponent(FIELDS)}&limit=300&access_token=${tk}`;
          let ok = false;
          while (nextUrl) {
            const res: Response = await fetch(nextUrl);
            if (!res.ok) break;
            const json: any = await res.json();
            ok = true;
            for (const a of json.data || []) {
              const rawBid = a.bid_amount != null ? Number(a.bid_amount) : NaN;
              const bidMajor = isFinite(rawBid) && rawBid > 0 ? rawBid / 100 : null;
              const bidBrl = bidMajor != null ? toBrl(bidMajor, acc.currency) : null;
              const dailyMajor = a.daily_budget ? Number(a.daily_budget) / 100 : 0;
              const lifeMajor = a.lifetime_budget ? Number(a.lifetime_budget) / 100 : 0;
              rows.push({
                account_id: acc.account_id,
                adset_id: String(a.id),
                campaign_id: String(a.campaign_id || a.campaign?.id || ""),
                campaign_name: a.campaign?.name || null,
                adset_name: a.name || "",
                status: a.status || "UNKNOWN",
                effective_status: a.effective_status || "UNKNOWN",
                daily_budget: toBrl(dailyMajor, acc.currency),
                lifetime_budget: toBrl(lifeMajor, acc.currency),
                bid_strategy: a.bid_strategy || a.campaign?.bid_strategy || null,
                bid_amount: bidBrl,
                bid_amount_currency: acc.currency || null,
                optimization_goal: a.optimization_goal || null,
                billing_event: a.billing_event || null,
                operation_id: acc.operation_id || null,
                updated_at: new Date().toISOString(),
              });
            }
            nextUrl = json.paging?.next || null;
          }
          if (ok) break;
        } catch (e) {
          console.warn(`[sync-adset-status] ${acc.account_name}:`, e);
        }
      }
      return rows;
    }

    async function runAll() {
      for (let i = 0; i < accounts.length; i += CONCURRENCY) {
        const chunk = accounts.slice(i, i + CONCURRENCY);
        const results = await Promise.all(chunk.map(processAccount));
        const flat = results.flat();
        if (flat.length) await upsertBatch(flat);
      }
    }

    // Fire-and-forget in background so client isn't blocked by 150s edge timeout.
    // @ts-ignore EdgeRuntime is available in Supabase Edge Runtime
    if (typeof EdgeRuntime !== "undefined" && (EdgeRuntime as any).waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(runAll().catch((e) => console.error("bg", e)));
      return new Response(
        JSON.stringify({ success: true, queued: true, accounts: accounts.length }),
        { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    await runAll();
    return new Response(
      JSON.stringify({ success: true, adsets: insertedTotal, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: String((e as Error).message || e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
