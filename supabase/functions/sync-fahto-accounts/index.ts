import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const META_API = "https://graph.facebook.com/v21.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const OP = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a';
    
    // 1. Get Token from app_settings
    const { data: opToken } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "meta_ads_access_token")
      .eq("operation_id", OP)
      .maybeSingle();
    
    const accessToken = opToken?.value?.token;
    if (!accessToken) throw new Error("META_ADS_ACCESS_TOKEN not found for FAHTO in app_settings");

    // 2. Discover Accounts
    const url = `${META_API}/me/adaccounts?fields=id,name,account_status,currency,timezone_name&limit=500&access_token=${accessToken}`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.error) throw new Error(`Meta Discovery Error: ${json.error.message}`);
    
    const accounts = json.data || [];
    const activeAccounts = accounts.filter((a: any) => a.account_status === 1);

    // 3. Upsert into meta_ad_accounts
    const rows = activeAccounts.map((a: any) => ({
      operation_id: OP,
      account_id: a.id,
      account_name: a.name,
      account_status: a.account_status,
      currency: a.currency,
      timezone: a.timezone_name,
      is_active: true,
      updated_at: new Date().toISOString()
    }));

    const { error: upsertErr } = await supabase
      .from("meta_ad_accounts")
      .upsert(rows, { onConflict: "operation_id,account_id" });
    
    if (upsertErr) throw upsertErr;

    return new Response(JSON.stringify({ 
      success: true, 
      total_discovered: accounts.length, 
      active_discovered: activeAccounts.length,
      upserted: rows.length 
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
