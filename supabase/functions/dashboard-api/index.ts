import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Autenticação via API Key
  const url = new URL(req.url);
  const keyFromQuery = url.searchParams.get("key");
  const authHeader = req.headers.get("Authorization");
  const apiKey = Deno.env.get("DASHBOARD_API_KEY");

  const isAuthorized =
    authHeader === `Bearer ${apiKey}` || keyFromQuery === apiKey;

  if (!isAuthorized) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const operation_id = url.searchParams.get("operation_id");
  const days = parseInt(url.searchParams.get("days") || "7");

  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - days);
  const startDateStr = startDate.toISOString().split("T")[0];
  const todayStr = today.toISOString().split("T")[0];

  // Busca snapshots históricos
  let snapshotQuery = supabase
    .from("daily_totals_snapshot")
    .select("*")
    .gte("date", startDateStr)
    .lte("date", todayStr)
    .order("date", { ascending: false });

  if (operation_id) {
    snapshotQuery = snapshotQuery.eq("operation_id", operation_id);
  }

  const { data: snapshots, error: snapshotError } = await snapshotQuery;

  if (snapshotError) {
    return new Response(
      JSON.stringify({ error: snapshotError.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Busca gastos em tempo real de hoje
  let realtimeQuery = supabase
    .from("meta_spend_realtime_safe")
    .select("*")
    .eq("sp_date", todayStr);

  if (operation_id) {
    realtimeQuery = realtimeQuery.eq("operation_id", operation_id);
  }

  const { data: realtimeSpend } = await realtimeQuery;

  // Agrega totais do período
  const totals = (snapshots || []).reduce(
    (acc, row) => ({
      total_spend: acc.total_spend + (row.total_spend || 0),
      total_revenue: acc.total_revenue + (row.total_revenue || 0),
      lucro_bruto: acc.lucro_bruto + (row.lucro_bruto || 0),
      total_conversions: acc.total_conversions + (row.total_conversions || 0),
      total_clicks: acc.total_clicks + (row.total_clicks || 0),
    }),
    { total_spend: 0, total_revenue: 0, lucro_bruto: 0, total_conversions: 0, total_clicks: 0 }
  );

  const avgRoas =
    (snapshots || []).length > 0
      ? (snapshots || []).reduce((acc, r) => acc + (r.roas || 0), 0) / (snapshots || []).length
      : 0;

  const realtimeSpendTotal = (realtimeSpend || []).reduce(
    (acc, r) => acc + (r.spend_brl || 0),
    0
  );

  const response = {
    periodo: { inicio: startDateStr, fim: todayStr, dias: days },
    totais: {
      ...totals,
      roas_medio: parseFloat(avgRoas.toFixed(2)),
    },
    hoje: {
      data: todayStr,
      spend_realtime_brl: parseFloat(realtimeSpendTotal.toFixed(2)),
      contas_ativas: (realtimeSpend || []).length,
    },
    historico_diario: (snapshots || []).map((row) => ({
      date: row.date,
      spend: row.total_spend,
      revenue: row.total_revenue,
      lucro_bruto: row.lucro_bruto,
      roas: row.roas,
      conversions: row.total_conversions,
      cac: row.cac,
      ticket_medio: row.ticket_medio,
    })),
  };

  return new Response(JSON.stringify(response, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
