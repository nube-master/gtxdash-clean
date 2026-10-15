import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const body = await req.json().catch(() => ({}));
    const { start, end, operation_id: opId } = body;
    const { data, error } = await supabase.rpc("get_total_traffic_metrics", {
      p_start_date: start,
      p_end_date: end,
      p_campaign_keyword: "top",
      p_strict_keyword: true,
      ...(opId ? { p_operation_id: opId } : {}),
    });
    if (error) throw error;
    const row = data?.[0] || {};
    return new Response(JSON.stringify({
      totalSpend: Number(row.total_spend || 0),
      totalRevenue: Number(row.total_revenue || 0),
      totalConversions: Number(row.total_purchase || 0),
      initiatedCheckouts: Number(row.total_ic || 0),
      ts: new Date().toISOString()
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
