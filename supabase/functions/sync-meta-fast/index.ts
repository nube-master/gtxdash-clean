import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const META_API = "https://graph.facebook.com/v22.0";

async function getUsdToBrlRate(): Promise<number> {
  const apis = [
    { url: "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json", parse: (json: any) => json?.usd?.brl },
    { url: "https://open.er-api.com/v6/latest/USD", parse: (json: any) => json?.rates?.BRL },
  ];
  for (const api of apis) {
    try {
      const res = await fetch(api.url);
      if (!res.ok) continue;
      const json = await res.json();
      const rate = api.parse(json);
      if (rate && !isNaN(rate) && rate > 0) return rate;
    } catch { /* skip */ }
  }
  return 5.15;
}

function hourToBrtDate(dateStr: string, hour: number, accountTz: string): string {
  try {
    const probe = new Date(`${dateStr}T${String(hour).padStart(2, "0")}:30:00Z`);
    const probeDateInAcc = new Intl.DateTimeFormat("en-CA", { timeZone: accountTz }).format(probe);
    const probeHourInAcc = parseInt(
      new Intl.DateTimeFormat("en-US", {
        timeZone: accountTz,
        hour: "numeric",
        hour12: false,
      }).format(probe),
      10,
    );
    const targetDayMs = new Date(`${dateStr}T00:00:00Z`).getTime();
    const probeDayMs = new Date(`${probeDateInAcc}T00:00:00Z`).getTime();
    const dayDiffHours = (probeDayMs - targetDayMs) / 3_600_000;
    const totalOffsetHours = dayDiffHours + probeHourInAcc - hour;
    const utcInstant = new Date(probe.getTime() - totalOffsetHours * 3_600_000);
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(utcInstant);
  } catch {
    return dateStr;
  }
}

async function fetchDailySpend(accountId: string, accessToken: string): Promise<{ spend: number; impressions: number; clicks: number; landing_page_views: number; purchase_count: number; initiated_checkouts: number } | null> {
  const filters = JSON.stringify([
    { field: "campaign.name", operator: "CONTAIN", value: "top" },
    { field: "campaign.name", operator: "CONTAIN", value: "xxx" },
    { field: "campaign.name", operator: "CONTAIN", value: "EDD" },
    { field: "campaign.name", operator: "CONTAIN", value: "GTX" },
    { field: "campaign.name", operator: "CONTAIN", value: "BMMS" },
    { field: "campaign.name", operator: "CONTAIN", value: "BMRW" },
    { field: "campaign.name", operator: "CONTAIN", value: "F1" },
    { field: "campaign.name", operator: "CONTAIN", value: "F3" },
    { field: "campaign.name", operator: "CONTAIN", value: "BM" },
    { field: "campaign.name", operator: "CONTAIN", value: "[AQUECIMENTO]" },
    { field: "campaign.name", operator: "CONTAIN", value: "KEST" },
    { field: "campaign.name", operator: "CONTAIN", value: "SENS" },
    { field: "campaign.name", operator: "CONTAIN", value: "FOLI" },
    { field: "campaign.name", operator: "CONTAIN", value: "FASE" }
  ]);
  const cleanId = accountId.toString().replace(/^(act_)+/, "");
  const actId = `act_${cleanId}`;
  const timeRange = JSON.stringify({ since: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()), until: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()) });
  const url = `${META_API}/${actId}/insights?fields=spend,impressions,clicks,actions&time_range=${encodeURIComponent(timeRange)}&level=account&filtering=${encodeURIComponent(filters)}&filtering_logic_type=any&access_token=${accessToken}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = await res.json();
    const row = json.data?.[0];
    if (!row) return { spend: 0, impressions: 0, clicks: 0, landing_page_views: 0, purchase_count: 0, initiated_checkouts: 0 };
    
    const lpActions = row.actions?.filter((a: any) => 
      ["landing_page_view", "omni_landing_page_view", "offsite_conversion.fb_pixel_view_content", "view_content"].includes(a.action_type)
    ) || [];
    const lpViews = lpActions.reduce((s: number, a: any) => s + (parseInt(a.value) || 0), 0);

    const icActions = row.actions?.filter((a: any) => 
      ["initiate_checkout", "omni_initiated_checkout", "offsite_conversion.fb_pixel_initiate_checkout", "offsite_conversion.fb_pixel_custom_event_initiated_checkout"].includes(a.action_type)
    ) || [];
    const icCount = icActions.reduce((s: number, a: any) => s + (parseInt(a.value) || 0), 0);

    const purActions = row.actions?.filter((a: any) => 
      ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase", "onsite_web_purchase", "onsite_web_app_purchase"].includes(a.action_type)
    ) || [];
    const purCount = purActions.reduce((s: number, a: any) => s + (parseInt(a.value) || 0), 0);
    
    return {
      spend: parseFloat(row.spend || "0"),
      impressions: parseInt(row.impressions || "0", 10),
      clicks: parseInt(row.clicks || "0", 10),
      landing_page_views: parseInt(lpViews, 10),
      purchase_count: parseInt(purCount, 10),
      initiated_checkouts: parseInt(icCount, 10),
    };
  } catch { return null; }
}

async function fetchHourlyNormalized(
  accountId: string, accountTz: string, accessToken: string, todaySP: string
): Promise<{ spend: number; impressions: number; clicks: number; landing_page_views: number; purchase_count: number; initiated_checkouts: number } | null> {
  const accFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: accountTz });
  const now = new Date();
  const accToday = accFormatter.format(now);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const accYesterday = accFormatter.format(yesterday);
  const accTomorrow = accFormatter.format(tomorrow);

  const datesToFetch = new Set([accYesterday, accToday, accTomorrow]);
  let totalSpend = 0, totalImpressions = 0, totalClicks = 0, totalLpViews = 0, totalPurchaseCount = 0, totalIc = 0;

  for (const targetDate of datesToFetch) {
    const filters = JSON.stringify([
      { field: "campaign.name", operator: "CONTAIN", value: "top" },
      { field: "campaign.name", operator: "CONTAIN", value: "xxx" },
      { field: "campaign.name", operator: "CONTAIN", value: "EDD" },
      { field: "campaign.name", operator: "CONTAIN", value: "GTX" },
      { field: "campaign.name", operator: "CONTAIN", value: "BMMS" },
      { field: "campaign.name", operator: "CONTAIN", value: "BMRW" },
      { field: "campaign.name", operator: "CONTAIN", value: "F1" },
      { field: "campaign.name", operator: "CONTAIN", value: "F3" },
      { field: "campaign.name", operator: "CONTAIN", value: "BM" },
      { field: "campaign.name", operator: "CONTAIN", value: "[AQUECIMENTO]" },
      { field: "campaign.name", operator: "CONTAIN", value: "KEST" },
      { field: "campaign.name", operator: "CONTAIN", value: "SENS" },
      { field: "campaign.name", operator: "CONTAIN", value: "FOLI" },
      { field: "campaign.name", operator: "CONTAIN", value: "FASE" }
    ]);
    const cleanId = accountId.toString().replace(/^(act_)+/, "");
    const actId = `act_${cleanId}`;
    const url = `${META_API}/${actId}/insights?` +

      `fields=spend,impressions,clicks,actions` +
      `&time_range=${encodeURIComponent(JSON.stringify({ since: targetDate, until: targetDate }))}` +
      `&breakdowns=hourly_stats_aggregated_by_advertiser_time_zone` +
      `&filtering=${encodeURIComponent(filters)}&filtering_logic_type=any` +
      `&level=account&limit=500&access_token=${accessToken}`;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) continue;
      const json = await res.json();
      const rows = json.data || [];

      for (const row of rows) {
        const hourStr = row.hourly_stats_aggregated_by_advertiser_time_zone || "";
        const hourMatch = hourStr.match(/^(\d{2}):/);
        const hour = hourMatch ? parseInt(hourMatch[1], 10) : 0;
        const brtDate = hourToBrtDate(targetDate, hour, accountTz);
        if (brtDate === todaySP) {
          totalSpend += parseFloat(row.spend || "0");
          totalImpressions += parseInt(row.impressions || "0", 10);
          totalClicks += parseInt(row.clicks || "0", 10);
          const lpActions = row.actions?.filter((a: any) => 
            ["landing_page_view", "omni_landing_page_view", "offsite_conversion.fb_pixel_view_content", "view_content"].includes(a.action_type)
          ) || [];
          totalLpViews += lpActions.reduce((s: number, a: any) => s + (parseInt(a.value) || 0), 0);
          const purActions = row.actions?.filter((a: any) => 
            ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase", "onsite_web_purchase", "onsite_web_app_purchase"].includes(a.action_type)
          ) || [];
          totalPurchaseCount += purActions.reduce((s: number, a: any) => s + (parseInt(a.value) || 0), 0);
          const icActions = row.actions?.filter((a: any) => 
            ["initiate_checkout", "omni_initiated_checkout", "offsite_conversion.fb_pixel_initiate_checkout", "offsite_conversion.fb_pixel_custom_event_initiated_checkout"].includes(a.action_type)
          ) || [];
          totalIc += icActions.reduce((s: number, a: any) => s + (parseInt(a.value) || 0), 0);
        }
      }
    } catch { continue; }
  }
  return { spend: totalSpend, impressions: totalImpressions, clicks: totalClicks, landing_page_views: totalLpViews, purchase_count: totalPurchaseCount, initiated_checkouts: totalIc };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { getAllMetaTokensForOperation } = await import("../_shared/getMetaToken.ts");
  const tokenCache = new Map<string, { token: string; profile_key: string }[]>();
  async function tokensForOperation(operationId?: string | null): Promise<{ token: string; profile_key: string }[]> {
    const key = operationId || "__legacy__";
    if (!tokenCache.has(key)) {
      const tokensWithMeta = await getAllMetaTokensForOperation(operationId || "");
      tokenCache.set(key, tokensWithMeta.map((t) => ({ token: t.token, profile_key: t.profile_key })));
    }
    return tokenCache.get(key) ?? [];
  }

  async function tryTokensDaily(accountId: string, operationId?: string | null) {
    const accessTokens = await tokensForOperation(operationId);
    if (accessTokens.length === 0) return null;
    for (const { token } of accessTokens) {
      const data = await fetchDailySpend(accountId, token);
      if (data && (data.spend > 0 || data.impressions > 0 || data.clicks > 0)) return data;
    }
    return await fetchDailySpend(accountId, accessTokens[0].token);
  }

  async function tryTokensHourly(accountId: string, tz: string, todaySP: string, operationId?: string | null) {
    const accessTokens = await tokensForOperation(operationId);
    if (accessTokens.length === 0) return null;
    for (const { token } of accessTokens) {
      const data = await fetchHourlyNormalized(accountId, tz, token, todaySP);
      if (data && (data.spend > 0 || data.impressions > 0 || data.clicks > 0)) return data;
    }
    return await fetchHourlyNormalized(accountId, tz, accessTokens[0].token, todaySP);
  }

  try {
    let operationFilter: string | null = null;
    try {
      const url = new URL(req.url);
      operationFilter = url.searchParams.get("operation_id") || null;
      if (!operationFilter) {
        const body = await req.clone().json().catch(() => null);
        operationFilter = body?.operation_id || null;
      }
    } catch { /* ignore */ }

    const { data: rm } = await supabase.from("app_settings").select("value").eq("key", "recovery_mode").maybeSingle();
    if (rm?.value === true) {
      return new Response(JSON.stringify({ skipped: true, reason: "recovery_mode" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const brFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });
    const todaySP = brFormatter.format(new Date());

    // F9-DIA3: Filtra contas por gasto recente (3 dias)
    const cutoff3d = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data: recentSpendIds } = await supabase
      .from("traffic_data")
      .select("account_id")
      .gte("date", cutoff3d)
      .gt("spend", 0);
    const accountsWithRecentSpend = new Set(recentSpendIds?.map(r => r.account_id) ?? []);

    let accountsQuery = supabase
      .from("meta_ad_accounts")
      .select("account_id, currency, timezone, operation_id, disable_reason")
      .eq("is_active", true);
    if (operationFilter) accountsQuery = accountsQuery.eq("operation_id", operationFilter);

    let { data: accountsRaw, error: accErr } = await accountsQuery;
    if (accErr) throw accErr;

    let accounts = (accountsRaw ?? []).filter((a: any) => {
      const hasRecentSpend = accountsWithRecentSpend.has(a.account_id);
      const dr = String(a.disable_reason || "").toLowerCase();
      const noAccess = dr.includes("sem permissão api") || dr.includes("sem acesso via api") || dr.includes("api access blocked");
      return (operationFilter || hasRecentSpend) && !noAccess;
    });

    if (!accounts || accounts.length === 0) {
      return new Response(JSON.stringify({ message: "No active accounts" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const hasUsd = accounts.some((a) => a.currency === "USD");
    const usdRate = hasUsd ? await getUsdToBrlRate() : 1;
    const SP_TZ = "America/Sao_Paulo";

    const nowBrt = new Date(new Date().toLocaleString("en-US", { timeZone: SP_TZ }));
    const brtHour = nowBrt.getHours();
    
    // Any account not in Sao Paulo timezone MUST use hourly breakdown to avoid leakage.
    // Accounts in Sao Paulo can use the daily endpoint for speed, but only after 01:00 BRT
    // to avoid the unstable 00:00-01:00 window.
    const spAccounts = brtHour >= 1 ? accounts.filter(a => a.timezone === SP_TZ || a.timezone === "America/Bahia") : [];
    const nonSpAccounts = accounts.filter(a => a.timezone !== SP_TZ && a.timezone !== "America/Bahia");


    const results: any[] = [];
    const BATCH = 10;
    for (let i = 0; i < spAccounts.length; i += BATCH) {
      const batch = spAccounts.slice(i, i + BATCH);
      const promises = batch.map(async (acc) => {
        const rate = acc.currency === "BRL" ? 1 : usdRate;
        const data = await tryTokensDaily(acc.account_id, acc.operation_id);
        if (!data) return null;
        return {
          account_id: acc.account_id,
          spend_brl: data.spend, // Mantido nome spend_brl para compatibilidade, mas agora grava USD real (API get_total_traffic_metrics converte)
          impressions: data.impressions,
          clicks: data.clicks,
          landing_page_views: data.landing_page_views,
          purchase_count: data.purchase_count,
          initiated_checkouts: data.initiated_checkouts,
          operation_id: acc.operation_id || null,
        };
      });
      for (const r of await Promise.all(promises)) if (r) results.push(r);
    }
    for (let i = 0; i < nonSpAccounts.length; i += BATCH) {
      const batch = nonSpAccounts.slice(i, i + BATCH);
      const promises = batch.map(async (acc) => {
        const rate = acc.currency === "BRL" ? 1 : usdRate;
        const data = await tryTokensHourly(acc.account_id, acc.timezone, todaySP, acc.operation_id);
        if (!data) return null;
        return {
          account_id: acc.account_id,
          spend_brl: data.spend,
          impressions: data.impressions,
          clicks: data.clicks,
          landing_page_views: data.landing_page_views,
          purchase_count: data.purchase_count,
          initiated_checkouts: data.initiated_checkouts,
          operation_id: acc.operation_id || null,
        };
      });
      for (const r of await Promise.all(promises)) if (r) results.push(r);
    }

    if (results.length > 0) {
      const inserts = results.map((r) => ({
        account_id: r.account_id,
        spend_brl: r.spend_brl,
        impressions: r.impressions,
        clicks: r.clicks,
        landing_page_views: r.landing_page_views,
        purchase_count: r.purchase_count,
        initiated_checkouts: r.initiated_checkouts,
        sp_date: todaySP,
        fetched_at: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date()).replace(', ', 'T'),
        operation_id: r.operation_id || null,
      }));
      await supabase.from("meta_spend_realtime_safe").upsert(inserts, { onConflict: "account_id,sp_date" });
    }

    const totalSpend = results.reduce((s, r) => s + r.spend_brl, 0);
    return new Response(JSON.stringify({
      success: true,
      accounts: results.length,
      total_spend_brl: totalSpend,
      date: todaySP,
      operation_id: operationFilter,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
