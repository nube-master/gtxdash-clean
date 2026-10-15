// sync-ad-status — Snapshot Meta ads (creative, thumb, 7d insights) into public.meta_ad_status.
import { createClient } from "npm:@supabase/supabase-js@2";
import { getAllMetaTokensForOperation } from "../_shared/getMetaToken.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const META_API = "https://graph.facebook.com/v21.0";
const FIELDS =
  "id,name,status,effective_status,adset_id,campaign_id,creative{id,thumbnail_url},preview_shareable_link,insights.date_preset(last_7d){spend,impressions,clicks,actions,action_values}";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    let operationFilter: string | null = null;
    let campaignFilter: string | null = null;
    let adsetFilter: string | null = null;
    try {
      const url = new URL(req.url);
      operationFilter = url.searchParams.get("operation_id") || null;
      campaignFilter = url.searchParams.get("campaign_id") || null;
      adsetFilter = url.searchParams.get("adset_id") || null;
      const body = await req.clone().json().catch(() => null);
      operationFilter = operationFilter || body?.operation_id || null;
      campaignFilter = campaignFilter || body?.campaign_id || null;
      adsetFilter = adsetFilter || body?.adset_id || null;
    } catch { /* ignore */ }

    // Pick adsets to sync — default to ACTIVE only (avoids scanning thousands of dormant adsets)
    let adsetsQ = supabase.from("meta_adset_status")
      .select("adset_id, campaign_id, account_id, operation_id, status")
      .eq("status", "ACTIVE")
      .limit(2000);
    if (operationFilter) adsetsQ = adsetsQ.eq("operation_id", operationFilter);
    if (campaignFilter) adsetsQ = adsetsQ.eq("campaign_id", campaignFilter);
    if (adsetFilter) adsetsQ = adsetsQ.eq("adset_id", adsetFilter).select("adset_id, campaign_id, account_id, operation_id, status");
    const { data: adsets } = await adsetsQ;
    if (!adsets?.length) {
      return new Response(JSON.stringify({ success: true, ads: 0, message: "No adsets" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

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

    // Currency per account
    const accIds = [...new Set(adsets.map((a) => a.account_id))];
    const { data: accs } = await supabase.from("meta_ad_accounts")
      .select("account_id, currency, operation_id").in("account_id", accIds);
    const accMap = new Map<string, { currency: string; operation_id: string | null }>();
    for (const a of accs ?? []) accMap.set(a.account_id,
      { currency: (a as any).currency || "USD", operation_id: (a as any).operation_id ?? null });

    const toBrl = (major: number, cur: string) =>
      Number(((fx.get((cur || "USD").toUpperCase()) ?? 1) * (major || 0)).toFixed(4));

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
        const { error } = await supabase.from("meta_ad_status")
          .upsert(batch, { onConflict: "ad_id" });
        if (error) errors.push(`upsert: ${error.message}`);
        else insertedTotal += batch.length;
      }
    }

    const CONCURRENCY = 25;
    async function processAdset(ads: any) {
      const rows: any[] = [];
      const acc = accMap.get(ads.account_id);
      const currency = acc?.currency || "USD";
      const toks = await tokens(acc?.operation_id ?? ads.operation_id);
      if (!toks.length) return rows;

      let done = false;
      for (const tk of toks) {
        try {
          let nextUrl: string | null =
            `${META_API}/${ads.adset_id}/ads?fields=${encodeURIComponent(FIELDS)}&limit=200&access_token=${tk}`;
          while (nextUrl) {
            const res: Response = await fetch(nextUrl);
            if (!res.ok) break;
            const json: any = await res.json();
            done = true;
            for (const a of json.data || []) {
              const ins = (a.insights?.data || [])[0] || {};
              const spendMajor = Number(ins.spend || 0);
              const purchases = (() => {
                const acts = ins.actions || [];
                const p = acts.find((x: any) =>
                  x.action_type === "purchase" || x.action_type === "omni_purchase");
                return p ? Number(p.value || 0) : 0;
              })();
              const revenueMajor = (() => {
                const vals = ins.action_values || [];
                const v = vals.find((x: any) =>
                  x.action_type === "purchase" || x.action_type === "omni_purchase");
                return v ? Number(v.value || 0) : 0;
              })();
              rows.push({
                ad_id: String(a.id),
                adset_id: String(a.adset_id || ads.adset_id),
                campaign_id: String(a.campaign_id || ads.campaign_id),
                account_id: ads.account_id,
                operation_id: acc?.operation_id ?? ads.operation_id,
                name: a.name || "",
                status: a.status || "UNKNOWN",
                effective_status: a.effective_status || "UNKNOWN",
                creative_id: a.creative?.id ?? null,
                preview_url: a.preview_shareable_link ?? null,
                thumbnail_url: a.creative?.thumbnail_url ?? null,
                spend_brl: toBrl(spendMajor, currency),
                impressions: Number(ins.impressions || 0),
                clicks: Number(ins.clicks || 0),
                purchases,
                revenue_brl: toBrl(revenueMajor, currency),
                synced_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              });
            }
            nextUrl = json.paging?.next || null;
          }
          if (done) break;
        } catch (e) {
          errors.push(`adset ${ads.adset_id}: ${String((e as Error).message || e)}`);
        }
      }
      return rows;
    }

    async function runAll() {
      for (let i = 0; i < adsets.length; i += CONCURRENCY) {
        const chunk = adsets.slice(i, i + CONCURRENCY);
        const results = await Promise.all(chunk.map(processAdset));
        const flat = results.flat();
        if (flat.length) await upsertBatch(flat);
      }
    }

    // @ts-ignore EdgeRuntime is Supabase-specific
    if (typeof EdgeRuntime !== "undefined" && (EdgeRuntime as any).waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(runAll().catch((e) => console.error("bg", e)));
      return new Response(
        JSON.stringify({ success: true, queued: true, adsets: adsets.length }),
        { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await runAll();
    return new Response(JSON.stringify({ success: true, ads: insertedTotal, errors: errors.slice(0, 20) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: String((e as Error).message || e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
