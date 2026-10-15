import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { 
      campaign_ids, 
      date_preset, 
      status, 
      name_contains, 
      filtro_rapido, 
      operation_id 
    } = await req.json();

    let query = supabase
      .from("meta_adsets")
      .select("*");

    if (operation_id) {
      query = query.eq("operation_id", operation_id);
    }

    if (campaign_ids && campaign_ids.length > 0) {
      query = query.in("campaign_id", campaign_ids);
    }

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    if (name_contains) {
      query = query.ilike("name", `%${name_contains}%`);
    }

    const { data: adsets, error } = await query;

    if (error) throw error;

    // TODO: Merge with traffic_data for metrics
    // For now returning the structural data
    return new Response(JSON.stringify({ adsets: adsets || [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
