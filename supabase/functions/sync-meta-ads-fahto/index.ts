import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const META_API = "https://graph.facebook.com/v22.0";

const FIELDS = [
  "ad_id", "ad_name", "adset_id", "adset_name", "campaign_id", "campaign_name",
  "spend", "clicks", "impressions", "inline_link_clicks", "actions",
  "video_play_actions", "cost_per_action_type", "video_thruplay_watched_actions",
  "video_p25_watched_actions", "video_p50_watched_actions",
  "video_p75_watched_actions", "video_p100_watched_actions",
].join(",");

function sumValues(values: any[] | undefined): number {
  if (!Array.isArray(values)) return 0;
  return values.reduce((sum, item) => sum + (Number.parseFloat(String(item?.value || "0")) || 0), 0);
}

function actionValue(actions: any[] | undefined, types: string[]): number {
  if (!Array.isArray(actions)) return 0;
  const accepted = new Set(types);
  return actions.reduce((sum, item) => {
    if (!accepted.has(String(item?.action_type || ""))) return sum;
    return sum + (Number.parseFloat(String(item?.value || "0")) || 0);
  }, 0);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = await req.json().catch(() => ({}));
    const operationId = body.operation_id || "8707b3f8-ab41-4a63-902c-9ab97fe50c8a"; // Default FAHTO
    const backfillDate = body.backfill_date; // YYYY-MM-DD
    
    const { getAllMetaTokensForOperation } = await import("../_shared/getMetaToken.ts");
    const accessTokens = await getAllMetaTokensForOperation(operationId);
    const accessToken = accessTokens.length > 0 ? accessTokens[0].token : Deno.env.get("META_ADS_ACCESS_TOKEN");

    if (!accessToken) throw new Error("Meta access token not found");

    const accRes = await fetch(`${META_API}/me/adaccounts?fields=id,name,currency&limit=50&access_token=${accessToken}`);
    const accJson = await accRes.json();
    if (accJson.error) throw new Error(`Discovery Error: ${accJson.error.message}`);

    const accounts = accJson.data || [];
    let adsProcessed = 0;
    let trafficProcessed = 0;
    const errors: string[] = [];

    const todayStr = backfillDate || new Date().toISOString().split('T')[0];

    for (const acc of accounts) {
      console.log(`Syncing for account ${acc.id} on date ${todayStr}...`);
      
      const timeRange = JSON.stringify({ since: todayStr, until: todayStr });
      const insightsRes = await fetch(
        `${META_API}/${acc.id}/insights?fields=${FIELDS}&level=ad&time_range=${timeRange}&access_token=${accessToken}&limit=1000`
      );
      const insightsJson = await insightsRes.json();
      
      if (insightsJson.data?.length > 0) {
        const trafficRows = insightsJson.data.map((row: any) => ({
          operation_id: operationId,
          date: todayStr,
          account_id: acc.id,
          ad_id: row.ad_id,
          ad_name: row.ad_name,
          adset_id: row.adset_id,
          adset_name: row.adset_name,
          campaign_id: row.campaign_id,
          campaign_name: row.campaign_name,
          spend: parseFloat(row.spend || "0"),
          clicks: parseInt(row.inline_link_clicks?.[0]?.value || row.clicks || "0"),
          impressions: parseInt(row.impressions || "0"),
          initiate_checkout: actionValue(row.actions, ["initiate_checkout", "omni_initiated_checkout", "offsite_conversion.fb_pixel_initiate_checkout"]),
          landing_page_views: actionValue(row.actions, ["landing_page_view", "omni_landing_page_view"]),
          purchase_count: actionValue(row.actions, ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"]),
          video_3s_views: actionValue(row.actions, ["video_view"]),
          video_plays: sumValues(row.video_play_actions),
          thruplays: sumValues(row.video_thruplay_watched_actions),
          video_25_percent: sumValues(row.video_p25_watched_actions),
          video_50_percent: sumValues(row.video_p50_watched_actions),
          video_75_percent: sumValues(row.video_p75_watched_actions),
          video_100_percent: sumValues(row.video_p100_watched_actions),
          updated_at: new Date().toISOString()
        }));

        const { error: delErr } = await supabase.from("traffic_data")
          .delete()
          .match({ operation_id: operationId, date: todayStr, account_id: acc.id });
        if (delErr) console.error(`Delete Error for ${acc.id}:`, delErr);

        const { error: insErr } = await supabase.from("traffic_data").insert(trafficRows);
        if (insErr) {
          console.error(`Insert Error for ${acc.id}:`, insErr);
          errors.push(`${acc.id}: ${insErr.message}`);
        } else {
          trafficProcessed += trafficRows.length;
        }

        const statusRows = insightsJson.data.map((row: any) => ({
          ad_id: row.ad_id,
          name: row.ad_name,
          adset_id: row.adset_id,
          campaign_id: row.campaign_id,
          account_id: acc.id,
          operation_id: operationId,
          updated_at: new Date().toISOString()
        }));
        await supabase.from("meta_ad_status").upsert(statusRows, { onConflict: "ad_id" });
        adsProcessed += statusRows.length;
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      date: todayStr,
      ads_metadata: adsProcessed, 
      traffic_rows: trafficProcessed,
      errors: errors.length > 0 ? errors : undefined
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
