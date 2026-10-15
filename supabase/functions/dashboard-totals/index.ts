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
    const url = new URL(req.url);
    const body = await req.json().catch(() => ({}));
    const start = url.searchParams.get("start") || body.start;
    const end = url.searchParams.get("end") || body.end;
    let opId = url.searchParams.get("operation_id") || body.operation_id || null;

    console.log("Data recebida:", { 
      start, 
      end, 
      opId, 
      serverTime: new Date().toISOString(),
      serverTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    });

    if (opId === "null" || opId === "undefined") opId = null;

    if (!start || !end) {
      return new Response(JSON.stringify({ error: "Missing start/end params" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isEDD = opId === "1dd606e3-dac2-4064-b863-9784307c9e98";
    const isFahto = opId === "8707b3f8-ab41-4a63-902c-9ab97fe50c8a";
    const isGTX = opId === "0b758a2b-1b92-4769-b47b-416c567e320d";
    // ROY GROUP: upsell é receita real (regra pedida pelo usuário 10/10/2026) — só nesta operação.
    const isROY = opId === "72951a45-5fa5-4cea-841e-6ec26fdf25a3";

    // Injetamos um fallback autoritativo para métricas de funil
    const { data: metricsRows, error: metricsErr } = await supabase.rpc("get_total_traffic_metrics", {
      p_start_date: start,
      p_end_date: end,
      p_operation_id: opId,
      p_campaign_keyword: null,
      p_strict_keyword: false
    });

    if (metricsErr) throw metricsErr;

    let row = (metricsRows && metricsRows.length > 0) ? metricsRows[0] : {};

    // --- REVENUE OVERRIDE ---
    let rtRevenue = 0;
    let rtConversions = 0;
    let rtIC = 0;

    // Diagnóstico de fontes (exposto na resposta para auditoria/alerta de divergência)
    let revenueSources: Record<string, number> | null = null;

    if (isFahto) {
      // FAHTO é operação COD (Sphere): a receita autoritativa é a COMISSÃO.
      // Duas fontes parciais convivem e NENHUMA sozinha é confiável:
      //  1) cod_orders (webhook Sphere) -> commission_generated por order_date
      //  2) sales_data (RedTrack, store='sphere') -> payout/comissão em BRL por date
      // O webhook Sphere atrasa/entrega em lote, então usamos Dual-Source MAX por dia.
      // ATENÇÃO: NÃO usar `redtrack_conversions` — writer morto desde 2026-08-22.
      const codByDay = new Map<string, { rev: number; conv: number }>();
      const { data: codRows, error: codErr } = await supabase.rpc("get_cod_daily_pnl_v13", {
        p_operation_id: opId,
        p_date_from: start,
        p_date_to: end,
        p_display_currency: "BRL",
      });

      // Contamos SÓ pedidos confirmados (aprovados/pagos). "Gerados" inclui leads
      // pendentes e pedidos recusados — usar isso como "vendas" inflava o War Room
      // (ex.: 485 vendas x R$ 76k de faturamento => ticket falso de R$ 157).
      if (!codErr && Array.isArray(codRows)) {
        for (const r of codRows as Record<string, unknown>[]) {
          const d = String(r.res_date ?? "").slice(0, 10);
          const prev = codByDay.get(d) || { rev: 0, conv: 0 };
          codByDay.set(d, {
            rev: prev.rev + Number(r.revenue_approved || 0),
            conv: prev.conv + Number(r.orders_approved || 0),
          });
        }
      }

      // sales_data (RedTrack) — paginação obrigatória em 1000 (cap PostgREST)
      const salesByDay = new Map<string, { rev: number; conv: number }>();
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data: sRows, error: sErr } = await supabase
          .from("sales_data")
          .select("date, revenue")
          .eq("operation_id", opId)
          .eq("status", "approved")
          .gte("date", start)
          .lte("date", end)
          .range(from, from + PAGE - 1);
        if (sErr) break;
        for (const r of sRows || []) {
          const d = String((r as any).date).slice(0, 10);
          const prev = salesByDay.get(d) || { rev: 0, conv: 0 };
          salesByDay.set(d, { rev: prev.rev + Number((r as any).revenue || 0), conv: prev.conv + 1 });
        }
        if (!sRows || sRows.length < PAGE) break;
      }

      let codTotal = 0;
      let salesTotal = 0;
      const days = new Set([...codByDay.keys(), ...salesByDay.keys()]);
      for (const d of days) {
        const c = codByDay.get(d) || { rev: 0, conv: 0 };
        const s = salesByDay.get(d) || { rev: 0, conv: 0 };
        codTotal += c.rev;
        salesTotal += s.rev;
        rtRevenue += Math.max(c.rev, s.rev);
        rtConversions += Math.max(c.conv, s.conv);
      }

      revenueSources = { cod_orders: codTotal, sales_data: salesTotal, used_max: rtRevenue };
      const base = Math.max(codTotal, salesTotal);
      if (base > 0 && Math.abs(codTotal - salesTotal) / base > 0.05) {
        console.warn(
          `[dashboard-totals][FAHTO] divergência de fontes >5% ${start}..${end}: cod_orders=${codTotal.toFixed(2)} sales_data=${salesTotal.toFixed(2)} usado=${rtRevenue.toFixed(2)}`,
        );
      }

      // ICs continuam vindo do RedTrack (eventos), não do COD.
      const { count: icCount } = await supabase
        .from("redtrack_events")
        .select("id", { count: "exact", head: true })
        .eq("operation_id", opId)
        .eq("event_type", "initiate_checkout")
        .gte("occurred_at", `${start}T00:00:00-03:00`)
        .lte("occurred_at", `${end}T23:59:59-03:00`);
      rtIC = icCount ?? 0;
    }

    // === GTX MIDIA: soma cod_orders (plataforma Fahto/Sphere) ao faturamento ===
    // Escopo estrito GTX. Fonte de receita = COMISSÃO em BRL (commission_value_brl),
    // mesma regra do Dashboard COD e do War Room Live. Não somamos order_value_brl.
    // Não há sobreposição com sales_data/CB (checkout COD é canal separado).
    let codRevenueGtx = 0;
    let codConvGtx = 0;
    if (isGTX) {
      const PAGE_COD = 1000;
      for (let from = 0; ; from += PAGE_COD) {
        const { data: rows, error } = await supabase
          .from("cod_orders")
          .select("commission_value_brl, status")
          .eq("operation_id", opId)
          .gte("order_date", start)
          .lte("order_date", end)
          .not("status", "in", "(cancelled,expired,refunded,refused)")
          .range(from, from + PAGE_COD - 1);
        if (error) break;
        for (const r of rows || []) {
          codRevenueGtx += Number((r as any).commission_value_brl || 0);
          codConvGtx += 1;
        }
        if (!rows || rows.length < PAGE_COD) break;
      }
      revenueSources = { ...(revenueSources || {}), cod_orders_gtx: codRevenueGtx };
    }


    // Fallback para tráfego horários se os totais estiverem zerados mas houver gasto hoje
    // IMPORTANTE: Aqui definimos a data SP para o fallback se o parametro start for o dia atual em SP
    const todaySP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

    if ((isEDD || isFahto) && Number(row.total_spend || 0) === 0 && start === todaySP) {
      const { data: hourlyFallback } = await supabase.rpc("get_spend_normalized_sp", {
        p_start_date: start,
        p_end_date: end,
        p_operation_id: opId
      });
      if (hourlyFallback && hourlyFallback.length > 0) {
        row = {
          ...row,
          total_spend: hourlyFallback[0].total_spend,
          total_impressions: hourlyFallback[0].impressions,
          total_clicks: hourlyFallback[0].clicks,
          total_link_clicks: hourlyFallback[0].clicks,
          total_landing_page_views: hourlyFallback[0].landing_page_views,
          total_ic: hourlyFallback[0].initiated_checkouts,
          total_vsl_plays: hourlyFallback[0].vsl_plays
        };
      }
    }

    // === INVESTIDO por dia BRT (Opção C) ===
    // traffic_data.date = dia LOCAL da conta (ex.: GTX roda em Asia/Dubai e Australia/Sydney),
    // enquanto traffic_data_hourly já está em BRT. Por isso o daily "fecha" o dia em outro
    // fuso e diverge do Pacing. `get_total_traffic_metrics` já resolve isso com
    // GREATEST(daily, hourly) na fatia Meta — não aplicar override extra aqui (dupla contagem).



    const totalSpend = Number(row.total_spend || 0);

    // GTX (29/08/2026): RedTrack em STANDBY. Funil 100% Meta (spend/clicks/impressions)
    // e receita 100% cod_orders. sales_data da GTX é 100% RedTrack (order_id 'rt:%') e
    // duplicava as MESMAS vendas COD — por isso é ignorada aqui.
    let roySumUpsellBrl = 0;
    if (isROY) {
      const { data: fx } = await supabase
        .from("exchange_rate_log").select("rate")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      const usdToBrl = Number(fx?.rate) > 0 ? Number(fx?.rate) : 5.30;
      for (let from = 0; ; from += 1000) {
        const { data: ups, error } = await supabase
          .from("redtrack_events")
          .select("amount, currency")
          .eq("operation_id", opId)
          .eq("event_type", "upsell")
          .gte("occurred_at", `${start}T00:00:00-03:00`)
          .lte("occurred_at", `${end}T23:59:59-03:00`)
          .range(from, from + 999);
        if (error) break;
        for (const u of ups || []) {
          const amt = Number((u as any).amount || 0);
          roySumUpsellBrl += (u as any).currency === "BRL" ? amt : amt * usdToBrl;
        }
        if (!ups || ups.length < 1000) break;
      }
      revenueSources = { ...(revenueSources || {}), roy_upsells_brl: roySumUpsellBrl };
    }

    const totalRevenue = isFahto ? rtRevenue : (isGTX ? codRevenueGtx : Number(row.total_revenue || 0) + roySumUpsellBrl);
    const totalConversions = isFahto ? rtConversions : (isGTX ? codConvGtx : Number(row.total_purchase || 0));
    const initiatedCheckouts = isFahto ? rtIC : Number(row.total_ic || 0);

    // Use link_clicks e garanta que impressões não fiquem zeradas se houver cliques
    let totalImpressions = Number(row.total_impressions || 0);
    const totalClicks = Number(row.total_link_clicks || 0);
    
    if (totalImpressions === 0 && totalClicks > 0) {
      totalImpressions = totalClicks * 50;
    }

    return new Response(JSON.stringify({
      totalSpend,
      totalRevenue,
      totalConversions,
      totalImpressions,
      totalClicks,
      totalLinkClicks: totalClicks,
      initiatedCheckouts,
      vslPlays: Number(row.total_vsl_plays || 0),
      totalLpViews: Number(row.total_landing_page_views || 0),
      roas: totalSpend > 0 ? totalRevenue / totalSpend : 0,
      ts: new Date().toISOString()
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[dashboard-totals] Error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
