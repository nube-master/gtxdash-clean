import { createClient } from "npm:@supabase/supabase-js@2";
import { getAllMetaTokensForOperation } from "../_shared/getMetaToken.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const META_API = "https://graph.facebook.com/v21.0";

interface MetaAd {
  id: string;
  name?: string;
  effective_status?: string;
  campaign_id?: string;
  campaign?: { id: string; name?: string };
  creative?: {
    effective_object_story_id?: string;
    object_story_spec?: { page_id?: string };
  };
}

async function fetchAllPages(url: string, timeoutMs = 20000): Promise<MetaAd[]> {
  const all: MetaAd[] = [];
  let nextUrl: string | null = url;
  while (nextUrl) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res: Response = await fetch(nextUrl, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error(`Meta API [${res.status}]: ${await res.text()}`);
      const json: any = await res.json();
      if (json.data) all.push(...json.data);
      nextUrl = json.paging?.next || null;
    } catch (e) { clearTimeout(t); throw e; }
  }
  return all;
}

function extractPageId(ad: MetaAd): string | null {
  const spec: any = ad.creative?.object_story_spec;
  if (spec?.page_id) return String(spec.page_id);
  const eos = ad.creative?.effective_object_story_id;
  if (eos && eos.includes("_")) return eos.split("_")[0];
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  // Tokens por operação (Vault multi-tenant). Cache por operation_id.
  const tokensByOp = new Map<string, string[]>();
  async function tokensForOp(opId: string | null): Promise<string[]> {
    const key = opId ?? "__none__";
    const cached = tokensByOp.get(key);
    if (cached) return cached;
    const entries = opId ? await getAllMetaTokensForOperation(opId) : [];
    const tokens = entries.map((e) => e.token);
    tokensByOp.set(key, tokens);
    return tokens;
  }




  try {
    let offset = 0, batchSize = 20;
    let filterAccountIds: string[] | null = null;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (typeof body.offset === "number") offset = body.offset;
        if (typeof body.batch_size === "number") batchSize = body.batch_size;
        if (Array.isArray(body.account_ids)) filterAccountIds = body.account_ids;
      } catch {}
    }

    const { data: accts } = await supabase
      .from("meta_ad_accounts")
      .select("account_id, account_name, operation_id")
      .eq("is_active", true);

    let activeAccounts = (accts || []).map((a: any) => ({
      id: `act_${String(a.account_id).replace(/^act_/, "")}`, name: a.account_name, operation_id: a.operation_id || null,
    }));
    if (filterAccountIds) {
      const s = new Set(filterAccountIds);
      activeAccounts = activeAccounts.filter((a) => s.has(a.id));
    }
    const batch = filterAccountIds
      ? activeAccounts
      : activeAccounts.slice(offset, offset + batchSize);
    const isLast = filterAccountIds ? true : offset + batchSize >= activeAccounts.length;

    let totalAds = 0;
    const pageIds = new Set<string>();
    const errors: string[] = [];
    const startTime = Date.now();
    const TIME_LIMIT = 50_000;

    // Batch-fetch page names later, collect (page_id → name) globally
    const pageNames = new Map<string, string>();

    async function processAccount(a: { id: string; name: string; operation_id: string | null }) {
      const fields = "id,name,effective_status,campaign{id,name},creative{effective_object_story_id,object_story_spec}";
      const filtering = encodeURIComponent(JSON.stringify([{ field: "ad.effective_status", operator: "IN", value: ["ACTIVE"] }]));
      let ads: MetaAd[] | null = null;
      let lastErr = "";
      const accountTokens = await tokensForOp(a.operation_id);
      if (!accountTokens.length) throw new Error(`No Meta token for operation ${a.operation_id}`);
      for (const tk of accountTokens) {
        const url = `${META_API}/${a.id}/ads?fields=${fields}&filtering=${filtering}&limit=500&access_token=${tk}`;
        try {
          ads = await fetchAllPages(url);
          break;
        } catch (e) {
          lastErr = e instanceof Error ? e.message : String(e);
          // Try next token on OAuth/permission errors, else abort
          if (!/\b(190|200|100|OAuthException|permission)\b/i.test(lastErr)) {
            console.error(`[${a.name}] ${lastErr}`);
            throw e;
          }
        }
      }
      if (!ads) throw new Error(`All tokens failed: ${lastErr}`);
      if (!ads.length) return 0;


      const rows = ads.map((ad) => {
        const pid = extractPageId(ad);
        if (pid) pageIds.add(pid);
        return {
          account_id: a.id,
          ad_id: ad.id,
          ad_name: ad.name || null,
          campaign_id: ad.campaign?.id || null,
          campaign_name: ad.campaign?.name || null,
          page_id: pid,
          page_name: null as string | null,
          effective_status: ad.effective_status || "ACTIVE",
          operation_id: a.operation_id,
          last_synced_at: new Date().toISOString(),
        };
      });

      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await supabase
          .from("meta_ad_pages")
          .upsert(rows.slice(i, i + 500), { onConflict: "account_id,ad_id" });
        if (error) errors.push(`${a.name}: ${error.message}`);
      }
      // Anúncios da conta que NÃO vieram como ACTIVE na Meta não estão mais ativos.
      const activeIds = rows.map((r) => r.ad_id);
      if (activeIds.length) {
        for (let i = 0; i < activeIds.length; i += 500) {
          await supabase
            .from("meta_ad_pages")
            .update({ effective_status: "PAUSED", last_synced_at: new Date().toISOString() })
            .eq("account_id", a.id)
            .eq("effective_status", "ACTIVE")
            .not("ad_id", "in", `(${activeIds.slice(i, i + 500).join(",")})`);
        }
      } else {
        await supabase
          .from("meta_ad_pages")
          .update({ effective_status: "PAUSED", last_synced_at: new Date().toISOString() })
          .eq("account_id", a.id)
          .eq("effective_status", "ACTIVE");
      }
      return rows.length;
    }

    const SUB = 6;
    for (let i = 0; i < batch.length; i += SUB) {
      if (Date.now() - startTime > TIME_LIMIT) break;
      const results = await Promise.allSettled(batch.slice(i, i + SUB).map(processAccount));
      for (let j = 0; j < results.length; j++) {
        const r = results[j];
        if (r.status === "fulfilled") totalAds += r.value;
        else errors.push(`${batch[i + j].name}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
      }
    }

    // Resolve page names (batch of 50)
    const pageArr = Array.from(pageIds);
    for (let i = 0; i < pageArr.length; i += 50) {
      if (Date.now() - startTime > TIME_LIMIT) break;
      const ids = pageArr.slice(i, i + 50).join(",");
      const anyTokens = tokensByOp.values().next().value ?? [];
      for (const tk of anyTokens) {
        try {
          const res = await fetch(`${META_API}/?ids=${ids}&fields=id,name&access_token=${tk}`);
          if (res.ok) {
            const j: any = await res.json();
            let got = false;
            for (const k of Object.keys(j)) if (j[k]?.name) { pageNames.set(k, j[k].name); got = true; }
            if (got) break;
          }
        } catch {}
      }

    }
    if (pageNames.size) {
      for (const [pid, pname] of pageNames) {
        await supabase.from("meta_ad_pages").update({ page_name: pname }).eq("page_id", pid);
      }
    }

    await supabase.from("integration_logs").insert({
      integration: "meta-ad-pages",
      status: errors.length ? "partial" : "success",
      message: `offset=${offset}: ${totalAds} ads, ${pageIds.size} pages${errors.length ? ` (${errors.length} errors)` : ""}`,
      records_processed: totalAds,
    });

    return new Response(JSON.stringify({
      success: true, ads: totalAds, pages: pageIds.size,
      accounts: batch.length, offset, next_offset: isLast ? 0 : offset + batchSize, done: isLast,
      errors: errors.length, error_samples: errors.slice(0, 3),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
