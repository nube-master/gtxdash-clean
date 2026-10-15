import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const FAHTO_OPERATION_ID = "8707b3f8-ab41-4a63-902c-9ab97fe50c8a";
const GTX_TOKEN = "REDACTED_META_TOKEN";

const ACCOUNT_IDS = [
  "965450841285437", 
  "914902035011378", 
  "274220817263544", 
  "278746817263544",
  "4518416995113290", 
  "992398967122465", 
  "1246531708323610",
  "3404569216370409",
  "1744662910062100",
  "2001512933899143",
  "2447877529027535",
  "1648237836725143",
  "1064270952620022",
  "1157423260787127",
  "1300776715534571",
  "1484845673350590",
  "1344786119964883",
  "412124157768876",
  "1056576076838554",
  "1678452126568980"
];
const SINCE = "2026-08-11";
const UNTIL = "2026-08-15";

async function runBackfill() {
  console.log(`Force backfill for ${ACCOUNT_IDS.length} FAHTO accounts using GTX token...`);

  for (const accId of ACCOUNT_IDS) {
    const fullId = `act_${accId}`;
    console.log(`Requesting insights for ${fullId}...`);
    
    const url = `https://graph.facebook.com/v22.0/${fullId}/insights?access_token=${GTX_TOKEN}&time_range=${encodeURIComponent(JSON.stringify({ since: SINCE, until: UNTIL }))}&time_increment=1&fields=spend,date_start,impressions,clicks,actions&level=account&limit=1000`;
    
    try {
      const res = await fetch(url);
      const json = await res.json();
      
      if (json.error) {
        console.error(`- act_${accId}: ${json.error.message}`);
        continue;
      }

      const data = json.data || [];
      console.log(`- act_${accId}: found ${data.length} days.`);

      for (const row of data) {
        const spendUsd = parseFloat(row.spend);
        if (spendUsd <= 0) continue;
        
        const actions = row.actions || [];
        const ic = actions.find(a => a.action_type === 'offsite_conversion.fb_pixel_initiate_checkout')?.value || 0;
        const purchases = (parseInt(actions.find(a => a.action_type === 'offsite_conversion.fb_pixel_purchase')?.value || 0)) +
                          (parseInt(actions.find(a => a.action_type === 'omni_purchase')?.value || 0));

        const upsertData = {
          operation_id: FAHTO_OPERATION_ID,
          campaign_name: `[BACKFILL] ${fullId} Account Total HT`,
          account_id: fullId,
          date: row.date_start,
          spend: spendUsd * 5.5,
          impressions: parseInt(row.impressions) || 0,
          clicks: parseInt(row.clicks) || 0,
          inline_link_clicks: parseInt(row.clicks) || 0,
          fb_pixel_initiate_checkout: parseInt(ic) || 0,
          purchase_count: purchases || 0,
          updated_at: new Date().toISOString()
        };

        const { error } = await supabase.from("traffic_data").upsert(upsertData, { 
          onConflict: 'operation_id,account_id,date,campaign_name' 
        });
        if (error) console.error(`  ! Upsert error act_${accId} ${row.date_start}: ${error.message}`);
      }
    } catch (e) {
      console.error(`  ! Fetch error act_${accId}: ${e.message}`);
    }
  }
}

Deno.serve(async () => {
  await runBackfill();
  return new Response(JSON.stringify({ success: true }));
});
