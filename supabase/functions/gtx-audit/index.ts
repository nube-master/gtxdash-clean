import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    const today = new Date();
    const fmt = (d: Date) => d.toISOString().split("T")[0];
    const d0 = fmt(today);
    const d2 = new Date(today);
    d2.setDate(d2.getDate() - 2);
    const startDate = fmt(d2);

    // Fetch traffic (last 3 days)
    const { data: traffic } = await sb
      .from("traffic_data")
      .select("campaign_name, spend, date, account_id")
      .gte("date", startDate)
      .lte("date", d0);

    // Fetch sales
    const { data: salesData } = await sb
      .from("sales_data")
      .select("utm_campaign, revenue, date, status")
      .gte("date", startDate)
      .lte("date", d0)
      .eq("status", "approved");

    const { data: redtrackData } = await sb
      .from("redtrack_events")
      .select("utm_campaign, amount, occurred_at, event_type")
      .in("event_type", ["purchase", "upsell"])
      .gte("occurred_at", `${startDate}T03:00:00Z`);

    // Aggregate by campaign
    const campSpend = new Map<string, number>();
    for (const t of traffic ?? []) {
      campSpend.set(t.campaign_name, (campSpend.get(t.campaign_name) ?? 0) + Number(t.spend));
    }

    const campRevenue = new Map<string, number>();
    const campSales = new Map<string, number>();
    for (const s of salesData ?? []) {
      const key = s.utm_campaign?.split("|")[0]?.trim() ?? "";
      if (!key) continue;
      campRevenue.set(key, (campRevenue.get(key) ?? 0) + Number(s.revenue));
      campSales.set(key, (campSales.get(key) ?? 0) + 1);
    }
    for (const r of redtrackData ?? []) {
      if (Number(r.amount) <= 0) continue;
      const key = r.utm_campaign?.split("|")[0]?.trim() ?? "";
      if (!key) continue;
      campRevenue.set(key, (campRevenue.get(key) ?? 0) + Number(r.amount));
      campSales.set(key, (campSales.get(key) ?? 0) + 1);
    }

    // Build warnings
    const warnings: any[] = [];

    // Check campaigns with spend but no revenue attribution
    for (const [camp, spend] of campSpend.entries()) {
      if (spend > 50 && !campRevenue.has(camp) && !campSales.has(camp)) {
        warnings.push({
          tipo_erro: "SEM_ATRIBUICAO",
          entidade: "campanha",
          campaign_id: camp,
          descricao: `Gasto R$ ${Math.round(spend)} sem vendas atribuídas (3 dias)`,
        });
      }
    }

    // Check revenue without spend (orphan sales)
    for (const [camp, rev] of campRevenue.entries()) {
      if (rev > 0 && !campSpend.has(camp)) {
        warnings.push({
          tipo_erro: "VENDA_ORFA",
          entidade: "venda",
          campaign_id: camp,
          descricao: `Receita R$ ${rev.toFixed(2)} sem dados de tráfego`,
        });
      }
    }

    // Check revenue = 0 but sales > 0
    for (const [camp, count] of campSales.entries()) {
      const rev = campRevenue.get(camp) ?? 0;
      if (count > 0 && rev === 0) {
        warnings.push({
          tipo_erro: "CRUZAMENTO_INVALIDO",
          entidade: "campanha",
          campaign_id: camp,
          descricao: `${count} venda(s) mas receita = R$ 0`,
        });
      }
    }

    // Clear old warnings and insert new ones
    await sb.from("gtx_data_warnings").delete().gte("created_at", "2000-01-01");
    if (warnings.length > 0) {
      await sb.from("gtx_data_warnings").insert(warnings);
    }

    // Log summary
    await sb.from("system_logs").insert({
      type: "AUDIT",
      function_name: "gtx-audit",
      message: `Auditoria concluída: ${warnings.length} warning(s)`,
      metadata: { total: warnings.length, types: [...new Set(warnings.map((w: any) => w.tipo_erro))] },
    });

    return new Response(
      JSON.stringify({ ok: true, warnings_count: warnings.length, warnings }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("gtx-audit error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
