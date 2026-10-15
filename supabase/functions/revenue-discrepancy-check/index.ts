import { mirrorToWebPush } from "../_shared/push-mirror.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Daily revenue discrepancy checker.
 * Compares RedTrack (purchases + upsells), clickbank_ref, and webhook data.
 * Sends Pushcut alert when divergence exceeds thresholds.
 * Designed to run via daily cron (e.g., 08:00 BRT).
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const h = { ...corsHeaders, "Content-Type": "application/json" };
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const pushcutUrl = Deno.env.get("PUSHCUT_WEBHOOK_URL") || "";

  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "Missing env" }), { status: 500, headers: h });
  }

  const sb = createClient(supabaseUrl, serviceKey);

  try {
    // Check yesterday (BRT)
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const checkDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
    }).format(yesterday);

    // URL param override
    const url = new URL(req.url);
    const dateParam = url.searchParams.get("date") || checkDate;

    // BRT timezone bounds
    const startUtc = `${dateParam}T03:00:00Z`;
    const nextDay = new Date(`${dateParam}T12:00:00Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const endUtc = `${nextDay.toISOString().slice(0, 10)}T03:00:00Z`;

    // Fetch exchange rate
    let usdToBrl = 5.13;
    const { data: rateRow } = await sb
      .from("exchange_rate_log")
      .select("rate")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (rateRow?.rate) usdToBrl = Number(rateRow.rate);

    // Fetch all data in parallel
    const [rtPurchases, rtUpsells, cbRefSales, webhookSales] = await Promise.all([
      sb.from("redtrack_events")
        .select("amount, currency, occurred_at, offer_name")
        .eq("event_type", "purchase")
        .gt("amount", 0)
        .gte("occurred_at", startUtc)
        .lt("occurred_at", endUtc)
        .then((r: any) => r.data || []),
      sb.from("redtrack_events")
        .select("amount, occurred_at, offer_name")
        .eq("event_type", "upsell")
        .gte("occurred_at", startUtc)
        .lt("occurred_at", endUtc)
        .then((r: any) => r.data || []),
      sb.from("sales_data")
        .select("revenue, product_name")
        .eq("date", dateParam)
        .eq("store", "clickbank_ref")
        .eq("status", "approved")
        .then((r: any) => r.data || []),
      sb.from("sales_data")
        .select("revenue, store")
        .eq("date", dateParam)
        .eq("status", "approved")
        .neq("store", "clickbank_ref")
        .then((r: any) => r.data || []),
    ]);

    // Aggregate RedTrack purchases in BRL
    const rtPurchaseRevBrl = rtPurchases.reduce((s: number, r: any) => {
      const amt = Number(r.amount || 0);
      const cur = r.currency || "USD";
      return s + (cur === "BRL" ? amt : amt * usdToBrl);
    }, 0);

    // Note: Upsells with $0 are expected (affiliate model) — NOT treated as errors
    const totalUpsells = rtUpsells.length;

    // Clickbank reference revenue
    const cbRefRevBrl = cbRefSales.reduce((s: number, r: any) => s + Number(r.revenue || 0), 0);

    // Webhook (non-clickbank) revenue
    const webhookRevBrl = webhookSales.reduce((s: number, r: any) => s + Number(r.revenue || 0), 0);

    // Dashboard total (same logic as dashboard-totals)
    const dashboardTotal = rtPurchaseRevBrl + webhookRevBrl;

    // Discrepancy flags
    const issues: string[] = [];
    let severity: "info" | "warning" | "critical" = "info";

    // Flag 2: Clickbank ref vs RedTrack
    if (cbRefSales.length > 0) {
      const countDiff = Math.abs(cbRefSales.length - rtPurchases.length);
      if (countDiff >= 2 || (cbRefSales.length > 0 && countDiff / Math.max(cbRefSales.length, rtPurchases.length) > 0.1)) {
        issues.push(`Clickbank ref: ${cbRefSales.length} vendas vs RedTrack: ${rtPurchases.length} purchases`);
        severity = "critical";
      }
      // Revenue comparison
      if (cbRefRevBrl > 0 && rtPurchaseRevBrl > 0) {
        const revDiff = Math.abs(cbRefRevBrl - rtPurchaseRevBrl);
        const revPct = (revDiff / Math.max(cbRefRevBrl, rtPurchaseRevBrl)) * 100;
        if (revPct > 10) {
          issues.push(`Gap receita: Clickbank R$ ${cbRefRevBrl.toFixed(0)} vs RedTrack R$ ${rtPurchaseRevBrl.toFixed(0)} (${revPct.toFixed(0)}%)`);
          severity = "critical";
        }
      }
    }

    // Flag 2: No clickbank_ref data when there should be
    if (cbRefSales.length === 0 && rtPurchases.length > 10) {
      issues.push("⚠️ Nenhum dado de referência Clickbank — INS webhook pode estar desconfigurado");
      if (severity === "info") severity = "warning";
    }

    const result = {
      date: dateParam,
      usdToBrl,
      rtPurchases: rtPurchases.length,
      rtPurchaseRevBrl: Math.round(rtPurchaseRevBrl),
      rtUpsells: totalUpsells,
      cbRefCount: cbRefSales.length,
      cbRefRevBrl: Math.round(cbRefRevBrl),
      webhookRevBrl: Math.round(webhookRevBrl),
      dashboardTotal: Math.round(dashboardTotal),
      severity,
      issues,
    };

    console.log(`[revenue-check] ${dateParam}: ${severity.toUpperCase()} | RT=${rtPurchases.length} purchases, ${totalUpsells} upsells | Issues: ${issues.length}`);

    // Send Pushcut alert if critical or warning
    if (pushcutUrl && issues.length > 0 && severity !== "info") {
      const emoji = severity === "critical" ? "🔴" : "🟡";
      const title = `${emoji} Discrepância de Vendas — ${dateParam.split("-").reverse().join("/")}`;
      const body = [
        `Dashboard: R$ ${dashboardTotal.toLocaleString("pt-BR")}`,
        `RedTrack: ${rtPurchases.length} purchases`,
        `Clickbank Ref: ${cbRefSales.length} vendas`,
        "",
        ...issues,
      ].join("\n");

      try {
        await fetch(pushcutUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, text: body }),
          signal: AbortSignal.timeout(5000),
        });
        console.log("[revenue-check] Pushcut alert sent");
      } catch (e) {
        console.warn("[revenue-check] Pushcut failed:", (e as Error).message);
      }

      // Canal PARALELO: Web Push
      await mirrorToWebPush({
        operation_id: null,
        notification_type: "revenue_discrepancy",
        title,
        body,
        url: "/",
      });
    }

    // Log to system_health_logs
    await sb.from("system_health_logs").insert({
      type: "revenue_check",
      source: "revenue-discrepancy-check",
      status: severity === "info" ? "ok" : severity === "warning" ? "warning" : "error",
      message: issues.length > 0 ? issues.join(" | ") : "Sem discrepâncias detectadas",
      metadata: result,
    });

    return new Response(JSON.stringify(result), { headers: h });
  } catch (err) {
    const msg = (err as Error).message || "Unknown error";
    console.error("[revenue-check] Error:", msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: h });
  }
});
