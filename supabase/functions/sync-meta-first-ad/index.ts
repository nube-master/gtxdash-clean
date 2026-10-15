// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const META_API = "https://graph.facebook.com/v21.0";

/**
 * Busca a data do PRIMEIRO anúncio veiculado em cada conta de farm.
 * Estratégia: pega o ad mais antigo da conta e usa o created_time
 * (na prática, é o primeiro anúncio publicado).
 *
 * Body opcional: { account_ids?: string[], category?: 'farm', force?: boolean }
 *  - Se nenhum filtro for passado, processa TODAS as contas categoria 'farm'.
 *  - force=true reprocessa contas que já têm first_ad_date.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const accessToken = Deno.env.get("META_ADS_ACCESS_TOKEN");
    if (!accessToken) {
      return json({ error: "META_ADS_ACCESS_TOKEN not configured" }, 500);
    }

    let accountIds: string[] | undefined;
    let category = "farm";
    let force = false;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (Array.isArray(body.account_ids)) accountIds = body.account_ids;
        if (typeof body.category === "string") category = body.category;
        if (body.force === true) force = true;
      } catch { /* no body */ }
    }

    let query = supabase
      .from("meta_ad_accounts")
      .select("account_id, account_name, first_ad_date")
      .eq("category", category);
    if (accountIds && accountIds.length) {
      query = query.in("account_id", accountIds);
    }
    const { data: accounts, error } = await query;
    if (error) throw error;

    const targets = (accounts || []).filter((a) =>
      force || !a.first_ad_date
    );

    console.log(
      `[sync-meta-first-ad] processing ${targets.length}/${accounts?.length ?? 0} accounts`,
    );

    const results: Array<{
      account_id: string;
      first_ad_date: string | null;
      status: "ok" | "no_ads" | "error";
      message?: string;
    }> = [];

    // Pequena concorrência para não estourar rate limit
    const CONCURRENCY = 4;
    let idx = 0;
    async function worker() {
      while (idx < targets.length) {
        const i = idx++;
        const acc = targets[i];
        try {
          const firstAd = await fetchFirstAdDate(acc.account_id, accessToken!);
          if (firstAd) {
            await supabase
              .from("meta_ad_accounts")
              .update({ first_ad_date: firstAd })
              .eq("account_id", acc.account_id);
            results.push({
              account_id: acc.account_id,
              first_ad_date: firstAd,
              status: "ok",
            });
          } else {
            results.push({
              account_id: acc.account_id,
              first_ad_date: null,
              status: "no_ads",
            });
          }
        } catch (err: any) {
          console.error(`[sync-meta-first-ad] ${acc.account_id} error:`, err?.message);
          results.push({
            account_id: acc.account_id,
            first_ad_date: null,
            status: "error",
            message: String(err?.message || err),
          });
        }
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    const ok = results.filter((r) => r.status === "ok").length;
    const noAds = results.filter((r) => r.status === "no_ads").length;
    const errors = results.filter((r) => r.status === "error").length;

    return json({
      processed: results.length,
      total: accounts?.length ?? 0,
      ok,
      no_ads: noAds,
      errors,
      results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message }, 500);
  }
});

async function fetchFirstAdDate(accountId: string, token: string): Promise<string | null> {
  // Pega o ad mais antigo (sort ascendente por created_time).
  // Limit baixo + sort ascendente devolve o primeiro anúncio criado.
  const url =
    `${META_API}/act_${accountId}/ads?fields=created_time&limit=1&date_preset=maximum&sort=created_time_ascending&access_token=${token}`;
  const res = await fetch(url);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Meta API ${res.status}: ${txt}`);
  }
  const json = await res.json();
  const ad = json?.data?.[0];
  if (!ad?.created_time) return null;
  return new Date(ad.created_time).toISOString();
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
