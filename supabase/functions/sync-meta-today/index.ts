import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const META_API = "https://graph.facebook.com/v22.0";
const BRT_TZ = "America/Sao_Paulo";
const BATCH_SIZE = 15;
const CONCURRENCY = 5;

const FIELDS = [
  "ad_id", "adset_id", "campaign_id", "campaign_name", "adset_name", "ad_name",
  "spend", "impressions", "clicks", "cpc", "cpm", "ctr", "inline_link_clicks", "actions",
  "video_play_actions", "cost_per_action_type",
  "video_thruplay_watched_actions", "video_p25_watched_actions", "video_p50_watched_actions",
  "video_p75_watched_actions", "video_p100_watched_actions",
].join(",");

const LITE_FIELDS = ["ad_id", "adset_id", "campaign_id", "campaign_name", "adset_name", "ad_name", "spend", "impressions", "clicks", "inline_link_clicks", "actions", "video_play_actions", "cost_per_action_type", "video_thruplay_watched_actions"].join(",");
const BASIC_FIELDS = ["spend", "impressions", "clicks"].join(",");

const EDD_OPERATION_ID = "1dd606e3-dac2-4064-b863-9784307c9e98";
const GTX_OPERATION_ID = "0b758a2b-1b92-4769-b47b-416c567e320d";
const FAHTO_OPERATION_ID = "8707b3f8-ab41-4a63-902c-9ab97fe50c8a";
const ROY_OPERATION_ID = "72951a45-5fa5-4cea-841e-6ec26fdf25a3";

const OPERATIONS_WITHOUT_LEGACY_NAME_FILTER = new Set([
  EDD_OPERATION_ID,
  GTX_OPERATION_ID,
  FAHTO_OPERATION_ID,
  ROY_OPERATION_ID,
]);

const META_IC_ACTIONS = new Set([
  "offsite_conversion.fb_pixel_initiate_checkout",
  "offsite_conversion.fb_pixel_custom_event_initiated_checkout",
]);

const GENERIC_IC_ACTIONS = new Set([
  "initiate_checkout",
  "omni_initiated_checkout",
]);

const PURCHASE_ACTIONS = new Set([
  "purchase",
  "omni_purchase",
  "offsite_conversion.fb_pixel_purchase",
  "onsite_web_purchase",
  "onsite_web_app_purchase",
]);

const LPV_ACTIONS = new Set([
  "landing_page_view",
  "omni_landing_page_view",
  "offsite_conversion.fb_pixel_view_content",
  "view_content",
]);

const VIDEO_3S_ACTIONS = new Set([
  "video_view",
]);

function getActionValue(actions: any[] | undefined, accepted: Set<string>): number {
  if (!Array.isArray(actions)) return 0;
  return actions.reduce((sum, action) => {
    if (!accepted.has(String(action?.action_type || ""))) return sum;
    const value = Number.parseFloat(String(action?.value || "0"));
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
}

function getVideoValue(actions: any[] | undefined): number {
  if (!Array.isArray(actions)) return 0;
  return actions.reduce((sum, action) => {
    const value = Number.parseFloat(String(action?.value || "0"));
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
}

function mergeTrafficRows(rows: any[]): any[] {
  const byConflictKey = new Map<string, any>();
  const additiveFields = [
    "spend",
    "impressions",
    "clicks",
    "inline_link_clicks",
    "landing_page_views",
    "initiate_checkout",
    "fb_pixel_initiate_checkout",
    "purchase_count",
    "video_3s_views",
    "video_plays",
    "video_25_percent",
    "video_50_percent",
    "video_75_percent",
    "video_100_percent",
    "thruplays",
  ];

  for (const row of rows) {
    const key = [
      row.operation_id,
      row.account_id,
      row.campaign_name,
      row.adset_name,
      row.ad_name,
      row.date,
    ].join("||");
    const existing = byConflictKey.get(key);
    if (!existing) {
      byConflictKey.set(key, { ...row });
      continue;
    }

    for (const field of additiveFields) {
      existing[field] = Number(existing[field] || 0) + Number(row[field] || 0);
    }
    existing.ad_id = existing.ad_id || row.ad_id;
    existing.adset_id = existing.adset_id || row.adset_id;
    existing.campaign_id = existing.campaign_id || row.campaign_id;
    existing.status = existing.status === "ACTIVE" || row.status === "ACTIVE" ? "ACTIVE" : existing.status;
    existing.updated_at = row.updated_at;
  }

  return Array.from(byConflictKey.values()).map((row) => {
    const spend = Number(row.spend || 0);
    const clicks = Number(row.clicks || 0);
    const impressions = Number(row.impressions || 0);
    return {
      ...row,
      cpc: clicks > 0 ? spend / clicks : Number(row.cpc || 0),
      cpm: impressions > 0 ? (spend / impressions) * 1000 : Number(row.cpm || 0),
      ctr: impressions > 0 ? (clicks / impressions) * 100 : Number(row.ctr || 0),
    };
  });
}

function mergeAdStatusRows(rows: any[]): any[] {
  const byAdId = new Map<string, any>();
  for (const row of rows) {
    const adId = String(row.ad_id || "");
    if (!adId) continue;
    const existing = byAdId.get(adId);
    if (!existing) {
      byAdId.set(adId, { ...row });
      continue;
    }
    existing.spend_brl = Number(existing.spend_brl || 0) + Number(row.spend_brl || 0);
    existing.impressions = Number(existing.impressions || 0) + Number(row.impressions || 0);
    existing.clicks = Number(existing.clicks || 0) + Number(row.clicks || 0);
    existing.status = existing.status === "ACTIVE" || row.status === "ACTIVE" ? "ACTIVE" : existing.status;
    existing.effective_status = existing.effective_status === "ACTIVE" || row.effective_status === "ACTIVE" ? "ACTIVE" : existing.effective_status;
    existing.synced_at = row.synced_at;
    existing.updated_at = row.updated_at;
  }
  return Array.from(byAdId.values());
}

function buildDateList(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T12:00:00Z`);
  const end = new Date(`${endDate}T12:00:00Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

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
  return 5.21;
}

async function readMetaError(res: Response): Promise<string> {
  try {
    const json = await res.json();
    return JSON.stringify(json.error || json);
  } catch {
    return res.statusText;
  }
}

async function fetchInsightsWithFields(accountId: string, accessToken: string, date: string, fields: string, skipNameFilter = false): Promise<any[]> {
  const cleanId = accountId.toString().replace(/^(act_)+/, "");
  const actId = `act_${cleanId}`;
  
  const filters = JSON.stringify([
    { field: "campaign.name", operator: "CONTAIN", value: "top" },
    { field: "campaign.name", operator: "CONTAIN", value: "xxx" },
    { field: "campaign.name", operator: "CONTAIN", value: "EDD" },
    { field: "campaign.name", operator: "CONTAIN", value: "GTX" },
    { field: "campaign.name", operator: "CONTAIN", value: "F1" },
    { field: "campaign.name", operator: "CONTAIN", value: "F2" },
    { field: "campaign.name", operator: "CONTAIN", value: "F3" },
    { field: "campaign.name", operator: "CONTAIN", value: "BM" }
  ]);
  
  const timeRange = JSON.stringify({ since: date, until: date });
  // Escola do Dólar não usa a nomenclatura legada (F1/F2/BM...), então o filtro
  // por nome de campanha zerava o sync diário dela. Para essa operação puxamos tudo.
  const filterPart = skipNameFilter
    ? ""
    : `&filtering=${encodeURIComponent(filters)}&filtering_logic_type=any`;
  const url = `${META_API}/${actId}/insights?fields=${encodeURIComponent(fields)}&level=ad&time_range=${encodeURIComponent(timeRange)}&time_increment=1&limit=500&access_token=${accessToken}${filterPart}`;


  const all: any[] = [];
  let nextUrl: string | null = url;
  
  try {
    while (nextUrl) {
      const res = await fetch(nextUrl);
      if (!res.ok) throw new Error(`Meta API [${res.status}] ${await readMetaError(res)}`);
      const json: any = await res.json();
      if (json.data) all.push(...json.data);
      nextUrl = json.paging?.next || null;
    }
  } catch (e) {
    if (all.length > 0) return all;
    throw e;
  }
  return all;
}

async function fetchInsights(accountId: string, accessToken: string, date: string, skipNameFilter = false): Promise<any[]> {
  try {
    return await fetchInsightsWithFields(accountId, accessToken, date, FIELDS, skipNameFilter);
  } catch (richErr) {
    try {
      return await fetchInsightsWithFields(accountId, accessToken, date, LITE_FIELDS, skipNameFilter);
    } catch (liteErr) {
      return await fetchInsightsWithFields(accountId, accessToken, date, BASIC_FIELDS, skipNameFilter);
    }
  }
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ success: false, error: "Missing backend environment" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  
  const supabase = createClient(
    supabaseUrl,
    supabaseServiceKey,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const operation_id = body.operation_id;
    const defaultDate = new Intl.DateTimeFormat("en-CA", { timeZone: BRT_TZ }).format(new Date());
    const dateFrom = body.date_from || body.start_date || body.date || body.backfill_date || defaultDate;
    const dateTo = body.date_to || body.end_date || body.date || body.backfill_date || dateFrom;
    const targetDates = buildDateList(dateFrom, dateTo);
    const replaceSynthetic = body.replace_synthetic === true || body.replaceSynthetic === true;
    const requestedAccountIds = Array.isArray(body.account_ids)
      ? body.account_ids.map((id: unknown) => String(id).replace(/^(act_)+/, ""))
      : body.account_id
        ? [String(body.account_id).replace(/^(act_)+/, "")]
        : [];

    if (!operation_id) throw new Error("Missing operation_id");
    if (targetDates.length > 31) throw new Error("Date range too large; max 31 days");

    // TOKEN FEDERATION (fix EDD 2026-08-25):
    // antes usava SÓ o token único de app_settings; quando esse token é bloqueado
    // pela Meta ("API access blocked") a operação inteira parava de gravar daily
    // (caso da Escola do Dólar desde 20/08), enquanto o sync-meta-hourly seguia
    // funcionando porque resolve múltiplos tokens por operação.
    const { getAllMetaTokensForOperation } = await import("../_shared/getMetaToken.ts");
    const resolved = await getAllMetaTokensForOperation(operation_id);
    const tokens: { token: string; profile_key: string }[] = resolved.map((t: any) => ({
      token: t.token,
      profile_key: t.profile_key,
    }));

    const { data: opCred } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "meta_ads_access_token")
      .eq("operation_id", operation_id)
      .maybeSingle();
    const legacyToken = (opCred?.value as any)?.token || (typeof opCred?.value === "string" ? opCred.value : null);
    if (legacyToken && !tokens.some((t) => t.token === legacyToken)) {
      tokens.push({ token: legacyToken, profile_key: "legacy_app_settings" });
    }
    if (tokens.length === 0) throw new Error(`No token for operation ${operation_id}`);

    let accountsQuery = supabase
      .from("meta_ad_accounts")
      .select("account_id, account_name, currency")
      .eq("operation_id", operation_id)
      .eq("is_active", true);

    if (requestedAccountIds.length > 0) {
      accountsQuery = accountsQuery.in("account_id", requestedAccountIds.map((id) => `act_${id}`));
    }

    const { data: accounts } = await accountsQuery;

    if (!accounts || accounts.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No active accounts" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const usdToBrl = await getUsdToBrlRate();
    let totalSpend = 0;
    let records = 0;
    let adStatusRows = 0;
    const byDate: Record<string, { records: number; spend: number; video_3s_views: number; thruplays: number; initiate_checkout: number }> = {};

    for (const targetDate of targetDates) {
      byDate[targetDate] = { records: 0, spend: 0, video_3s_views: 0, thruplays: 0, initiate_checkout: 0 };

      for (const acc of accounts) {
        // Federação: tenta cada token da operação até um retornar dados.
        let insights: any[] | null = null;
        let lastErr = "";
        for (const { token, profile_key } of tokens) {
          try {
            insights = await fetchInsights(
              acc.account_id,
              token,
              targetDate,
              OPERATIONS_WITHOUT_LEGACY_NAME_FILTER.has(operation_id),
            );
            break;
          } catch (e) {
            lastErr = `${profile_key}: ${(e as Error).message}`;
            insights = null;
          }
        }
        if (!insights) {
          console.error(`[sync-meta-today] ${acc.account_id} ${targetDate} — nenhum token funcionou. Último erro: ${lastErr}`);
          continue;
        }
        if (insights.length === 0) continue;

        try {
          const accountId = `act_${acc.account_id.toString().replace(/^(act_)+/, "")}`;
          const rows = insights.map(row => {
            const actions = Array.isArray(row.actions) ? row.actions : [];
            const spend = parseFloat(row.spend || "0");
            const pixelIc = getActionValue(actions, META_IC_ACTIONS);
            const genericIc = getActionValue(actions, GENERIC_IC_ACTIONS);
            const initiateCheckout = pixelIc > 0 ? pixelIc : genericIc;
            const inlineClicksFromActions = getActionValue(actions, new Set(["link_click"]));
            // Hook Rate correto = 3-second video views / impressions.
            // Na Marketing API v22 o field `video_3_sec_watched_actions` não existe mais;
            // o valor correto vem de actions[action_type=video_view].
            // Já `video_play_actions` = reproduções iniciadas (autoplay, ~95% das impressões)
            // e vai para a coluna própria `video_plays` — NUNCA para hook rate.
            const videoPlays = getVideoValue(row.video_play_actions);
            const video3s = getActionValue(actions, VIDEO_3S_ACTIONS);
            const thruplays = getVideoValue(row.video_thruplay_watched_actions);
            const video25 = getVideoValue(row.video_p25_watched_actions);
            const video50 = getVideoValue(row.video_p50_watched_actions);
            const video75 = getVideoValue(row.video_p75_watched_actions);
            const video100 = getVideoValue(row.video_p100_watched_actions);

            totalSpend += spend;
            byDate[targetDate].spend += spend;
            byDate[targetDate].video_3s_views += video3s;
            byDate[targetDate].thruplays += thruplays;
            byDate[targetDate].initiate_checkout += initiateCheckout;
            return {
              operation_id,
              account_id: accountId,
              date: targetDate,
              campaign_name: row.campaign_name || "",
              adset_name: row.adset_name || "",
              ad_name: row.ad_name || "",
              ad_id: row.ad_id,
              adset_id: row.adset_id,
              campaign_id: row.campaign_id,
              status: row.status || "ACTIVE",
              spend,
              impressions: parseInt(row.impressions || "0"),
              clicks: parseInt(row.clicks || "0"),
              inline_link_clicks: parseInt(row.inline_link_clicks || "0") || inlineClicksFromActions,
              landing_page_views: getActionValue(actions, LPV_ACTIONS),
              initiate_checkout: initiateCheckout,
              fb_pixel_initiate_checkout: pixelIc,
              purchase_count: getActionValue(actions, PURCHASE_ACTIONS),
              video_3s_views: video3s,
              video_plays: videoPlays,
              video_25_percent: video25,
              video_50_percent: video50,
              video_75_percent: video75,
              video_100_percent: video100,
              thruplays,
              cpc: parseFloat(row.cpc || "0"),
              cpm: parseFloat(row.cpm || "0"),
              ctr: parseFloat(row.ctr || "0"),
              updated_at: new Date().toISOString()
            };
          });

          if (replaceSynthetic) {
            const { error: deleteErr } = await supabase
              .from("traffic_data")
              .delete()
              .eq("operation_id", operation_id)
              .eq("account_id", accountId)
              .eq("date", targetDate)
              .is("ad_id", null);
            if (deleteErr) throw deleteErr;
          }

          const mergedRows = mergeTrafficRows(rows);
          const { error: upsertErr } = await supabase.from("traffic_data").upsert(mergedRows, { 
            onConflict: "operation_id,account_id,campaign_name,adset_name,ad_name,date" 
          });
          if (upsertErr) throw upsertErr;
          records += mergedRows.length;
          byDate[targetDate].records += mergedRows.length;

          // meta_ad_status: nomes de anúncio a nível de ad (usado pela aba Criativos).
          const adRows = insights
            .filter((r: any) => r.ad_id && r.adset_id && r.campaign_id)
            .map((r: any) => ({
              operation_id,
              account_id: accountId,
              ad_id: String(r.ad_id),
              adset_id: String(r.adset_id),
              campaign_id: String(r.campaign_id),
              name: r.ad_name || "",
              status: r.status || "ACTIVE",
              effective_status: r.effective_status || r.status || "ACTIVE",
              spend_brl: acc.currency === "BRL"
                ? parseFloat(r.spend || "0")
                : parseFloat(r.spend || "0") * usdToBrl,
              impressions: parseInt(r.impressions || "0"),
              clicks: parseInt(r.clicks || "0"),
              synced_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }));

          if (adRows.length > 0) {
            const mergedAdRows = mergeAdStatusRows(adRows);
            const { error: adErr } = await supabase
              .from("meta_ad_status")
              .upsert(mergedAdRows, { onConflict: "ad_id" });
            if (adErr) console.warn(`[sync-meta-today] meta_ad_status upsert falhou: ${adErr.message}`);
            else adStatusRows += mergedAdRows.length;
          }
        } catch (e) {
          console.error(`[sync-meta-today] Error processing ${acc.account_id} ${targetDate}:`, (e as Error).message);
        }
      }

      // Refresh snapshot
      await supabase.rpc('refresh_daily_snapshot', { p_operation_id: operation_id, p_date: targetDate });
    }

    return new Response(JSON.stringify({ success: true, dates: targetDates, records, ad_status_rows: adStatusRows, total_spend: totalSpend, by_date: byDate }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });


  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
