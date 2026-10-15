import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

function sumValues(values: any[] | undefined): number {
  if (!Array.isArray(values)) return 0
  return values.reduce((sum, item) => sum + (Number.parseFloat(String(item?.value || "0")) || 0), 0)
}

function actionValue(actions: any[] | undefined, types: string[]): number {
  if (!Array.isArray(actions)) return 0
  const accepted = new Set(types)
  return actions.reduce((sum, item) => accepted.has(String(item?.action_type || ""))
    ? sum + (Number.parseFloat(String(item?.value || "0")) || 0)
    : sum, 0)
}

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  )

  const FAHTO_OP = "8707b3f8-ab41-4a63-902c-9ab97fe50c8a"
  const { data: setting } = await supabase
    .from("app_settings")
    .select("value")
    .eq("operation_id", FAHTO_OP)
    .eq("key", "meta_ads_access_token")
    .single()
  
  const token = (setting?.value as any)?.token || (typeof setting?.value === "string" ? setting.value : null);
  if (!token) return new Response(JSON.stringify({error:"no token"}), {status:500})

  const accRes = await fetch(
    `https://graph.facebook.com/v22.0/me/adaccounts?fields=id,name,account_status,currency&limit=500&access_token=${token}`
  )
  const accData = await accRes.json()
  if (accData.error) return new Response(JSON.stringify({error:accData.error}), {status:500})
  const accounts = (accData.data || []).filter((a:any) => a.account_status === 1)

  const todayBRT = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo"
  }).format(new Date())

  const rows = []
  const errors = []
  
  // Aumentar concorrência para processar contas em paralelo
  const BATCH_SIZE = 5;
  for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
    const batch = accounts.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (acc: any) => {
      try {
        // level=campaign para permitir atribuição por bracket no dashboard
        const insRes = await fetch(
          `https://graph.facebook.com/v22.0/${acc.id}/insights?time_range={"since":"${todayBRT}","until":"${todayBRT}"}&level=ad&fields=campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,inline_link_clicks,actions,video_play_actions,cost_per_action_type,video_thruplay_watched_actions,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions&limit=500&access_token=${token}`
        )
        const insJson = await insRes.json()
        if (insJson.error) { errors.push({acc: acc.id, err: insJson.error.message}); return }
        
        const insights = insJson.data || []
        for (const insight of insights) {
          const actions = insight.actions || []
          const ic = actionValue(actions, ["initiate_checkout", "omni_initiated_checkout", "offsite_conversion.fb_pixel_initiate_checkout"])
          const pur = actionValue(actions, ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"])
          const lpv = actionValue(actions, ["landing_page_view", "omni_landing_page_view"])
          
          rows.push({
            operation_id: FAHTO_OP,
            account_id: acc.id,
            campaign_id: insight.campaign_id,
            date: todayBRT,
            campaign_name: insight.campaign_name || "[CAMPANHA SEM NOME]", 
            adset_name: insight.adset_name || "[OVERVIEW]", 
            ad_name: insight.ad_name || "[OVERVIEW]",
            ad_id: insight.ad_id,
            adset_id: insight.adset_id,
            status: "ACTIVE",
            spend: parseFloat(insight.spend || "0"),
            impressions: parseInt(insight.impressions || "0"),
            clicks: parseInt(insight.clicks || "0"),
            inline_link_clicks: parseInt(insight.inline_link_clicks || "0"),
            landing_page_views: lpv,
            initiate_checkout: ic,
            purchase_count: pur,
            video_3s_views: actionValue(actions, ["video_view"]),
            video_plays: sumValues(insight.video_play_actions),
            thruplays: sumValues(insight.video_thruplay_watched_actions),
            video_25_percent: sumValues(insight.video_p25_watched_actions),
            video_50_percent: sumValues(insight.video_p50_watched_actions),
            video_75_percent: sumValues(insight.video_p75_watched_actions),
            video_100_percent: sumValues(insight.video_p100_watched_actions),
            updated_at: new Date().toISOString(),
          })
        }
      } catch (e:any) {
        errors.push({acc: acc.id, err: e.message})
      }
    }));
  }

  if (rows.length > 0) {
    // UPSERT baseado no traffic_data_unique_key (operation_id, account_id, campaign_name, adset_name, ad_name, date)
    const { error: upErr } = await supabase.from("traffic_data").upsert(rows, {
      onConflict: "operation_id,account_id,campaign_name,adset_name,ad_name,date"
    })
    if (upErr) return new Response(JSON.stringify({error:upErr, rows: rows.length}), {status:500})
  }

  // 6. Invalidar snapshot
  await supabase.from("daily_totals_snapshot")
    .delete()
    .eq("operation_id", FAHTO_OP)
    .eq("date", todayBRT)

  return new Response(JSON.stringify({
    ok: true,
    date: todayBRT,
    accounts: accounts.length,
    rows: rows.length,
    total_spend: rows.reduce((s,r) => s+r.spend, 0),
    errors,
  }), {status:200, headers:{"content-type":"application/json"}})
})