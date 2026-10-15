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
      if (!res.ok) { console.warn(`API ${api.url} error [${res.status}]`); continue; }
      const json: any = await res.json();
      const rate = api.parse(json);
      if (rate && !isNaN(rate) && rate > 0) {
        console.log(`USD→BRL rate: ${rate} (from ${api.url})`);
        return rate;
      }
    } catch (e) { console.warn(`API ${api.url} failed:`, e); }
  }
  return 5.15;
}

const FIELDS = [
  "ad_id", "adset_id", "campaign_id", "campaign_name", "adset_name", "ad_name",
  "spend", "impressions", "clicks", "cpc", "cpm", "ctr", "actions", "video_play_actions", "cost_per_action_type",
  "video_thruplay_watched_actions", "video_p25_watched_actions", "video_p50_watched_actions",
  "video_p75_watched_actions", "video_p100_watched_actions",
].join(",");

interface MetaInsight {
  ad_id: string; adset_id: string; campaign_id: string; campaign_name: string;
  adset_name: string; ad_name: string; spend: string; impressions: string;
  clicks: string; cpc: string; cpm: string; ctr: string; date_start: string;
  actions?: Array<{ action_type: string; value: string }>;
  video_play_actions?: Array<{ value: string }>;
  video_thruplay_watched_actions?: Array<{ value: string }>;
  video_p25_watched_actions?: Array<{ value: string }>;
  video_p50_watched_actions?: Array<{ value: string }>;
  video_p75_watched_actions?: Array<{ value: string }>;
  video_p100_watched_actions?: Array<{ value: string }>;
}

function sumValues(values: Array<{ value: string }> | undefined): number {
  if (!Array.isArray(values)) return 0;
  return values.reduce((sum, item) => sum + (Number.parseFloat(String(item?.value || "0")) || 0), 0);
}

function actionValue(actions: Array<{ action_type: string; value: string }> | undefined, types: string[]): number {
  if (!Array.isArray(actions)) return 0;
  const accepted = new Set(types);
  return actions.reduce((sum, item) => accepted.has(String(item?.action_type || ""))
    ? sum + (Number.parseFloat(String(item?.value || "0")) || 0)
    : sum, 0);
}

async function fetchAllPages(url: string, timeoutMs = 25000): Promise<MetaInsight[]> {
  const all: MetaInsight[] = [];
  let nextUrl: string | null = url;
  while (nextUrl) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res: Response = await fetch(nextUrl, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Meta API error [${res.status}]: ${err}`);
      }
      const json: any = await res.json();
      if (json.data) all.push(...json.data);
      nextUrl = json.paging?.next || null;
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  }
  return all;
}

Deno.serve(async (req) => {
  
  
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const operationId = body.operation_id;
    
    // 1. Resolve Access Token (Priority: Operation specific > Master > ENV)
    const { getAllMetaTokensForOperation } = await import("../_shared/getMetaToken.ts");
    const accessTokens = await getAllMetaTokensForOperation(operationId || "");
    let accessToken = accessTokens.length > 0 ? accessTokens[0].token : Deno.env.get("META_ADS_ACCESS_TOKEN");

    if (!accessToken) throw new Error("META_ADS_ACCESS_TOKEN not configured");

    // 2. Setup Dates
    let dateFrom: string, dateTo: string;
    const brFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
    dateTo = body.date_to || brFormatter.format(new Date());
    dateFrom = body.date_from || brFormatter.format(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));

    const usdToBrl = body.exchange_rate || await getUsdToBrlRate();
    
    // 3. Resolve Accounts (Auto-discovery via Meta API to ensure zero hardcoding)
    let accountsToProcess: any[] = [];
    if (body.account_ids) {
      const ids = Array.isArray(body.account_ids) ? body.account_ids : [body.account_ids];
      accountsToProcess = ids.map(id => ({ id: id.startsWith("act_") ? id : `act_${id}`, currency: "USD" }));
    } else {
      let url = `${META_API}/me/adaccounts?fields=id,name,account_status,currency&limit=500&access_token=${accessToken}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.error) throw new Error(`Meta Account Discovery Error: ${json.error.message}`);
      
      accountsToProcess = (json.data || [])
        .filter((a: any) => a.account_status === 1)
        .map((a: any) => ({ id: a.id, currency: a.currency }));
    }

    console.log(`Processing ${accountsToProcess.length} accounts for ${operationId || 'ALL'} from ${dateFrom} to ${dateTo}`);

    let totalRecords = 0;
    const errors: string[] = [];

    for (const acc of accountsToProcess) {
      try {
        
        const cleanId = acc.id.toString().replace(/^(act_)+/, "");
        const actId = `act_${cleanId}`;
        const baseUrl = `${META_API}/${actId}/insights?fields=${FIELDS}&level=ad&time_range=${encodeURIComponent(JSON.stringify({ since: dateFrom, until: dateTo }))}&time_increment=1&limit=500&access_token=`;

        // Tenta cada token do pool: o primeiro pode não ter acesso a esta conta
        const tokenPool = accessTokens.length > 0 ? accessTokens.map((t: any) => t.token) : [accessToken];
        let insights: MetaInsight[] = [];
        let lastErr: any = null;
        for (const tk of tokenPool) {
          try {
            insights = await fetchAllPages(baseUrl + tk, 15000);
            lastErr = null;
            if (insights.length > 0) break;
          } catch (e) { lastErr = e; }
        }
        if (lastErr && insights.length === 0) throw lastErr;
        
        if (insights.length === 0) continue;

        // Group by date, account_id and operation_id before upserting
        const dailyAggregates = new Map<string, any>();

        insights.forEach(row => {
          const key = `${row.date_start}||${row.campaign_name || ""}||${row.adset_name || ""}||${row.ad_name || ""}`;
          const existing = dailyAggregates.get(key);
          
          const spend = parseFloat(row.spend) || 0;
          const impressions = parseInt(row.impressions) || 0;
          const clicks = parseInt(row.clicks) || 0;
          const inlineLinkClicks = (row.actions?.find(a => a.action_type === 'link_click')?.value) ? parseInt(row.actions.find(a => a.action_type === 'link_click')!.value) : 0;

          if (existing) {
            existing.spend += spend;
            existing.impressions += impressions;
            existing.clicks += clicks;
            existing.inline_link_clicks += inlineLinkClicks;
            existing.video_3s_views += actionValue(row.actions, ["video_view"]);
            existing.video_plays += sumValues(row.video_play_actions);
            existing.thruplays += sumValues(row.video_thruplay_watched_actions);
            existing.video_25_percent += sumValues(row.video_p25_watched_actions);
            existing.video_50_percent += sumValues(row.video_p50_watched_actions);
            existing.video_75_percent += sumValues(row.video_p75_watched_actions);
            existing.video_100_percent += sumValues(row.video_p100_watched_actions);
          } else {
            dailyAggregates.set(key, {
              account_id: acc.id,
              date: row.date_start,
              campaign_name: row.campaign_name || "",
              adset_name: row.adset_name || "",
              ad_name: row.ad_name || "",
              operation_id: operationId,
              spend,
              impressions,
              clicks,
              inline_link_clicks: inlineLinkClicks,
              video_3s_views: actionValue(row.actions, ["video_view"]),
              video_plays: sumValues(row.video_play_actions),
              thruplays: sumValues(row.video_thruplay_watched_actions),
              video_25_percent: sumValues(row.video_p25_watched_actions),
              video_50_percent: sumValues(row.video_p50_watched_actions),
              video_75_percent: sumValues(row.video_p75_watched_actions),
              video_100_percent: sumValues(row.video_p100_watched_actions),
              status: "ACTIVE",
              updated_at: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date()).replace(', ', 'T')
            });
          }
        });

        const rows = Array.from(dailyAggregates.values());

        const { error: upsertErr } = await supabase.from("traffic_data").upsert(rows, { onConflict: "operation_id,account_id,campaign_name,adset_name,ad_name,date" });
        if (upsertErr) throw upsertErr;
        totalRecords += rows.length;

        // Trigger manual refresh for this specific date and operation if we have data
        if (rows.length > 0 && operationId) {
          await supabase.rpc('refresh_daily_snapshot', { 
            p_operation_id: operationId, 
            p_date: rows[0].date
          });
        }
      } catch (e) {
        console.error(`Error in ${acc.id}:`, e.message);
        errors.push(`${acc.id}: ${e.message}`);
      }
    }

    // Diagnostic logging
    if (operationId) {
      await supabase.from("automated_reports_log").insert({
        operation_id: operationId,
        report_type: "meta_sync_diagnostic",
        report_text: `Sync completed: ${totalRecords} records for ${accountsToProcess.length} accounts. Errors: ${errors.length}`
      });
    }

    return new Response(JSON.stringify({ success: true, records: totalRecords, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
