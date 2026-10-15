import { createClient } from "npm:@supabase/supabase-js@2";
import { getMetaTokenForOperation } from "../_shared/getMetaToken.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const META_API = "https://graph.facebook.com/v21.0";

async function getUsdToBrlRate(): Promise<number> {
  const apis = [
    { url: "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json", parse: (json: any) => json?.usd?.brl },
    { url: "https://open.er-api.com/v6/latest/USD", parse: (json: any) => json?.rates?.BRL },
  ];
  for (const api of apis) {
    try {
      const res = await fetch(api.url);
      if (!res.ok) continue;
      const json: any = await res.json();
      const rate = api.parse(json);
      if (rate && !isNaN(rate) && rate > 0) return rate;
    } catch { /* skip */ }
  }
  return 5.15;
}

// Breakdown-specific fields: spend, impressions, clicks + action-based conversions/revenue
const BREAKDOWN_FIELDS = [
  "campaign_name", "campaign_id", "spend", "impressions", "clicks", "inline_link_clicks", "cpc", "cpm",
  "actions", "action_values",
].join(",");

interface BreakdownInsight {
  campaign_name: string;
  campaign_id?: string;
  spend: string;
  impressions: string;
  clicks: string;
  inline_link_clicks?: string;
  cpc: string;
  cpm: string;
  date_start: string;
  actions?: Array<{ action_type: string; value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
  // Breakdown dimensions
  age?: string;
  gender?: string;
  publisher_platform?: string;
  platform_position?: string;
  country?: string;

}

function getActionValue(actions: Array<{ action_type: string; value: string }> | undefined, type: string): number {
  if (!actions) return 0;
  const a = actions.find((x) => x.action_type === type);
  return a ? parseFloat(a.value) || 0 : 0;
}

async function fetchAllPages(url: string, timeoutMs = 15000): Promise<BreakdownInsight[]> {
  const all: BreakdownInsight[] = [];
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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  try {
    const brFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
    const now = new Date();
    const todayBrazil = brFmt.format(now);

    // Default: sync last 2 days (today + yesterday)
    let dateFrom = todayBrazil;
    let dateTo = todayBrazil;
    let operationFilter: string | null = null;
    let typesFilter: string[] | null = null;

    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body.date_from) dateFrom = body.date_from;
        if (body.date_to) dateTo = body.date_to;
        if (body.operation_id) operationFilter = body.operation_id;
        if (Array.isArray(body.types)) typesFilter = body.types;
      } catch { /* use defaults */ }
    }

    const usdToBrl = await getUsdToBrlRate();
    console.log(`[sync-meta-breakdowns] Syncing ${dateFrom} to ${dateTo}, USD→BRL: ${usdToBrl}`);

    let accountsQuery = supabase
      .from("meta_ad_accounts")
      .select("account_id, account_name, currency, operation_id")
      .eq("is_active", true);
    if (operationFilter) accountsQuery = accountsQuery.eq("operation_id", operationFilter);
    const { data: accounts } = await accountsQuery;

    if (!accounts || accounts.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No active accounts" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalRecords = 0;
    const errors: string[] = [];
    const PARALLEL_BATCH = 5;
    const TIME_LIMIT_MS = 45_000;
    const startTime = Date.now();

    // Two breakdown types to fetch
    const breakdownConfigs = [
      { type: "demographic", breakdown: "age,gender" },
      { type: "placement", breakdown: "publisher_platform,platform_position" },
      { type: "country", breakdown: "country", level: "campaign" },
    ].filter((c) => !typesFilter || typesFilter.includes(c.type));

    for (let i = 0; i < accounts.length; i += PARALLEL_BATCH) {
      if (Date.now() - startTime > TIME_LIMIT_MS) {
        console.log(`Time limit reached, stopping at account ${i}`);
        break;
      }

      const batch = accounts.slice(i, i + PARALLEL_BATCH);
      const results = await Promise.allSettled(
        batch.map(async (acc) => {
          const actId = `act_${acc.account_id}`;
          const rate = acc.currency === "BRL" ? 1 : usdToBrl;
          let accountRecords = 0;
          const accessToken = await getMetaTokenForOperation((acc as any).operation_id, acc.account_id);

          for (const config of breakdownConfigs) {
            try {
              const url = `${META_API}/${actId}/insights?fields=${BREAKDOWN_FIELDS}&level=${(config as any).level || "account"}&breakdowns=${config.breakdown}&time_range=${encodeURIComponent(JSON.stringify({ since: dateFrom, until: dateTo }))}&time_increment=1&limit=500&access_token=${accessToken}`;
              const insights = await fetchAllPages(url);

              if (insights.length === 0) continue;

              // Delete existing breakdown data for this account+dates+type
              const dates = [...new Set(insights.map(r => r.date_start))];
              for (const dt of dates) {
                await supabase
                  .from("traffic_breakdowns")
                  .delete()
                  .eq("account_id", acc.account_id)
                  .eq("date", dt)
                  .eq("breakdown_type", config.type);
              }

              const rows = insights.map((row) => {
                const spend = (parseFloat(row.spend) || 0) * rate;
                const conversions = Math.round(getActionValue(row.actions, "purchase") + getActionValue(row.actions, "offsite_conversion.fb_pixel_purchase"));
                const revenue = (getActionValue(row.action_values, "purchase") + getActionValue(row.action_values, "offsite_conversion.fb_pixel_purchase")) * rate;
                
                // Specialized metrics
                const initiate_checkouts = Math.round(getActionValue(row.actions, "offsite_conversion.fb_pixel_initiate_checkout"));
                const lp_views = Math.round(getActionValue(row.actions, "landing_page_view"));

                return {
                  date: row.date_start,
                  account_id: acc.account_id,
                  campaign_name: row.campaign_name || "",
                  breakdown_type: config.type,
                  age: row.age || null,
                  gender: row.gender || null,
                  publisher_platform: row.publisher_platform || null,
                  platform_position: row.platform_position || null,
                  country: row.country || null,
                  operation_id: (acc as any).operation_id,
                  spend,
                  impressions: parseInt(row.impressions) || 0,
                  clicks: parseInt(row.clicks) || 0,
                  inline_link_clicks: parseInt(row.inline_link_clicks || "0") || 0,
                  conversions,
                  revenue,
                  cpc: (parseFloat(row.cpc) || 0) * rate,
                  cpm: (parseFloat(row.cpm) || 0) * rate,
                };
              });

              // Special path for Country: Also upsert to meta_country_insights
              if (config.type === "country") {
                const countryRows = insights.map((row) => {
                  const spend = (parseFloat(row.spend) || 0) * rate;
                  const purchases = Math.round(getActionValue(row.actions, "purchase") + getActionValue(row.actions, "offsite_conversion.fb_pixel_purchase"));
                  const revenue = (getActionValue(row.action_values, "purchase") + getActionValue(row.action_values, "offsite_conversion.fb_pixel_purchase")) * rate;
                  
                  // specialized metrics for meta_country_insights
                  const initiate_checkouts = Math.round(getActionValue(row.actions, "offsite_conversion.fb_pixel_initiate_checkout"));
                  const lp_views = Math.round(getActionValue(row.actions, "landing_page_view"));
                  const impressions = parseInt(row.impressions) || 0;
                  const clicks = parseInt(row.clicks) || 0;
                  const link_clicks = parseInt(row.inline_link_clicks || "0") || 0;

                  return {
                    date: row.date_start,
                    operation_id: acc.operation_id,
                    account_id: acc.account_id,
                    campaign_id: row.campaign_id || "",
                    campaign_name: row.campaign_name || "",
                    country_code: row.country || "UNKNOWN",
                    spend,
                    impressions,
                    clicks,
                    link_clicks,
                    lp_views,
                    initiate_checkouts,
                    purchases,
                    revenue
                  };
                });

                if (countryRows.length > 0) {
                  // Chunk country upserts to avoid payload limits
                  for (let k = 0; k < countryRows.length; k += 500) {
                    const countryBatch = countryRows.slice(k, k + 500);
                    const { error: upsertErr } = await supabase.from("meta_country_insights").upsert(countryBatch, { 
                      onConflict: "date,operation_id,account_id,campaign_id,country_code" 
                    });
                    if (upsertErr) {
                      console.error(`[${acc.account_name}] Country upsert error:`, upsertErr.message);
                      errors.push(`${acc.account_name} Country Upsert: ${upsertErr.message}`);
                    }
                  }
                }
              }

              // Insert in batches
              for (let j = 0; j < rows.length; j += 500) {
                const insertBatch = rows.slice(j, j + 500);
                const { error } = await supabase.from("traffic_breakdowns").insert(insertBatch);
                if (error) {
                  console.error(`Insert error ${acc.account_name} ${config.type}:`, error.message);
                  errors.push(`${acc.account_name} ${config.type}: ${error.message}`);
                } else {
                  accountRecords += insertBatch.length;
                }
              }
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              console.error(`[${acc.account_name}] ${config.type} error:`, msg);
              errors.push(`${acc.account_name} ${config.type}: ${msg}`);
            }
          }

          return accountRecords;
        })
      );

      for (let j = 0; j < results.length; j++) {
        if (results[j].status === "fulfilled") {
          totalRecords += (results[j] as PromiseFulfilledResult<number>).value;
        } else {
          const msg = (results[j] as PromiseRejectedResult).reason?.message || "Unknown";
          errors.push(`${batch[j].account_name}: ${msg}`);
        }
      }
    }

    await supabase.from("integration_logs").insert({
      integration: "meta-breakdowns",
      status: errors.length > 0 ? "partial" : "success",
      message: `Breakdowns sync: ${totalRecords} records from ${accounts.length} accounts (${errors.length} errors)`,
      records_processed: totalRecords,
    });

    console.log(`[sync-meta-breakdowns] Done: ${totalRecords} records, ${errors.length} errors`);

    return new Response(JSON.stringify({
      success: true,
      records: totalRecords,
      accounts: accounts.length,
      errors: errors.length,
      error_details: errors.slice(0, 5),
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sync-meta-breakdowns] Fatal:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
