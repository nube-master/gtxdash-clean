import { createClient } from "npm:@supabase/supabase-js@2";
import {
  brDate, fmtBRL, spDayBounds,
  listActiveOperations, fetchOpTemplate, fetchOpRecipients,
  sendToRecipients, logAutomatedReport, readOnlyOp,
} from "../_shared/notify-scope.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const jsonRes = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b, null, 2), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function fetchAllRows(sb: any, table: string, select: string, filters: (q: any) => any) {
  const PAGE = 1000;
  let all: any[] = []; let from = 0;
  while (true) {
    let q = sb.from(table).select(select); q = filters(q); q = q.range(from, from + PAGE - 1);
    const { data, error } = await q;
    if (error) break;
    all = all.concat(data || []);
    if ((data?.length || 0) < PAGE) break;
    from += PAGE;
  }
  return all;
}

function detectPlatform(offerName: string | null): "cartpanda" | "clickbank" | null {
  if (!offerName) return null;
  const lower = offerName.toLowerCase();
  if (lower.includes("cartpanda")) return "cartpanda";
  if (lower.includes("clickbank")) return "clickbank";
  return null;
}

async function processOperation(sb: any, supabaseUrl: string, serviceKey: string, today: string, op: { id: string; name: string }) {
  const tpl = await fetchOpTemplate(sb, op.id, "guerra_checkout");
  if (!tpl) return { operation_id: op.id, operation: op.name, skipped: "no_active_template" };

  const { startUtc, endUtc } = spDayBounds(today);

  // Exchange rate scoped to op (dashboard-totals)
  let usdToBrl = 5.15;
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/dashboard-totals?start=${today}&end=${today}&operation_id=${op.id}`, {
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
    });
    if (res.ok) {
      const dt = await res.json();
      if (dt.usdToBrl > 0) usdToBrl = Number(dt.usdToBrl);
    } else { await res.text(); }
  } catch { /* fallback */ }

  const rtEvents = await fetchAllRows(sb, "redtrack_events",
    "offer_name, event_type, amount, currency, raw_payload, utm_campaign",
    (q: any) => q.eq("operation_id", op.id)
      .in("event_type", ["initiate_checkout", "purchase"])
      .gte("occurred_at", startUtc).lt("occurred_at", endUtc));

  const { data: cbRows } = await sb.from("clickbank_audit")
    .select("receipt, amount_brl").eq("date", today).eq("transaction_type", "SALE").eq("operation_id", op.id);
  const receiptMap = new Map<string, number>();
  for (const row of (cbRows || [])) {
    const rc = String(row.receipt || "").trim();
    const amt = Number(row.amount_brl || 0);
    if (rc && amt > 0 && !receiptMap.has(rc)) receiptMap.set(rc, amt);
  }

  const campaignICs = new Map<string, { cp: number; cb: number }>();
  const stats = {
    cartpanda: { ics: 0, purchases: 0, revenue: 0 },
    clickbank: { ics: 0, purchases: 0, revenue: 0 },
  };
  for (const e of rtEvents) {
    const plat = detectPlatform(e.offer_name);
    if (!plat) continue;
    const camp = e.utm_campaign || "(sem campanha)";
    if (e.event_type === "initiate_checkout") {
      stats[plat].ics++;
      if (!campaignICs.has(camp)) campaignICs.set(camp, { cp: 0, cb: 0 });
      const ent = campaignICs.get(camp)!;
      if (plat === "cartpanda") ent.cp++; else ent.cb++;
    } else if (e.event_type === "purchase") {
      stats[plat].purchases++;
      const receipt = e.raw_payload?.p_sub1 || e.raw_payload?.receipt || null;
      const auditAmt = receipt ? receiptMap.get(String(receipt).trim()) : undefined;
      let revBrl: number;
      if ((e.currency || "").toUpperCase() === "BRL") revBrl = Number(e.amount || 0);
      else if (typeof auditAmt === "number" && auditAmt > 0) revBrl = auditAmt;
      else revBrl = Number(e.amount || 0) * usdToBrl;
      stats[plat].revenue += revBrl;
    }
  }

  const totalICs = stats.cartpanda.ics + stats.clickbank.ics;
  if (totalICs === 0) return { operation_id: op.id, operation: op.name, skipped: "no_ics" };

  // Spend by account of this op (from traffic_data filtered by op)
  const trafficRows = await fetchAllRows(sb, "traffic_data", "campaign_name, spend",
    (q: any) => q.eq("date", today).eq("operation_id", op.id).gt("spend", 0));
  const campaignSpend = new Map<string, number>();
  let totalSpend = 0;
  for (const r of trafficRows) {
    const nm = r.campaign_name || "";
    campaignSpend.set(nm, (campaignSpend.get(nm) || 0) + Number(r.spend || 0));
    totalSpend += Number(r.spend || 0);
  }
  let spendCP = 0, spendCB = 0;
  for (const [camp, sp] of campaignSpend) {
    const ics = campaignICs.get(camp);
    if (!ics) {
      const globalCp = totalICs > 0 ? stats.cartpanda.ics / totalICs : 0;
      spendCP += sp * globalCp;
      spendCB += sp * (1 - globalCp);
      continue;
    }
    const total = ics.cp + ics.cb;
    if (total === 0) continue;
    spendCP += sp * (ics.cp / total);
    spendCB += sp * (ics.cb / total);
  }

  const custoIcCP = stats.cartpanda.ics > 0 ? spendCP / stats.cartpanda.ics : 0;
  const custoIcCB = stats.clickbank.ics > 0 ? spendCB / stats.clickbank.ics : 0;
  const convCP = stats.cartpanda.ics > 0 ? (stats.cartpanda.purchases / stats.cartpanda.ics) * 100 : 0;
  const convCB = stats.clickbank.ics > 0 ? (stats.clickbank.purchases / stats.clickbank.ics) * 100 : 0;
  const lucroCP = stats.cartpanda.revenue - spendCP;
  const lucroCB = stats.clickbank.revenue - spendCB;

  let vencedor: string, motivo: string;
  if (lucroCP !== lucroCB) { vencedor = lucroCP > lucroCB ? "Cartpanda" : "ClickBank"; motivo = "dominando lucro 💰"; }
  else if (convCP !== convCB) { vencedor = convCP > convCB ? "Cartpanda" : "ClickBank"; motivo = "dominando conversão 🚀"; }
  else { vencedor = custoIcCP <= custoIcCB ? "Cartpanda" : "ClickBank"; motivo = "menor custo/IC ⚡"; }

  const title = `⚔️ Guerra de Checkout — ${op.name}`;
  const body = [
    "",
    "🔵 ClickBank",
    `ICs: ${stats.clickbank.ics}`,
    `Custo/IC: R$ ${fmtBRL(custoIcCB)}`,
    `Conv: ${convCB.toFixed(1)}%`,
    `Lucro: R$ ${fmtBRL(lucroCB)}`,
    "", "",
    "🔴 Cartpanda",
    `ICs: ${stats.cartpanda.ics}`,
    `Custo/IC: R$ ${fmtBRL(custoIcCP)}`,
    `Conv: ${convCP.toFixed(1)}%`,
    `Lucro: R$ ${fmtBRL(lucroCP)}`,
    "",
    `🏆 ${vencedor} ${motivo}`,
  ].join("\n");

  const currentMetrics = {
    cp: { ics: stats.cartpanda.ics, purchases: stats.cartpanda.purchases, revenue: Math.round(stats.cartpanda.revenue) },
    cb: { ics: stats.clickbank.ics, purchases: stats.clickbank.purchases, revenue: Math.round(stats.clickbank.revenue) },
  };

  const { data: lastReport } = await sb.from("automated_reports_log")
    .select("metrics").eq("report_type", "guerra-checkout").eq("operation_id", op.id)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (lastReport?.metrics) {
    const prev = lastReport.metrics as any;
    if (prev.cp?.ics === currentMetrics.cp.ics && prev.cp?.purchases === currentMetrics.cp.purchases &&
        prev.cb?.ics === currentMetrics.cb.ics && prev.cb?.purchases === currentMetrics.cb.purchases) {
      return { operation_id: op.id, operation: op.name, skipped: "duplicate" };
    }
  }

  const recipients = await fetchOpRecipients(sb, op.id, tpl.id);
  const results = await sendToRecipients(recipients, title, body, { operation_id: op.id, notification_type: "guerra_checkout", url: "/" });
  await logAutomatedReport(sb, op.id, "guerra-checkout", `${title}\n${body}`,
    { ...currentMetrics, spend: { cp: Math.round(spendCP), cb: Math.round(spendCB), total: Math.round(totalSpend) },
      custoIc: { cp: custoIcCP, cb: custoIcCB }, conv: { cp: convCP, cb: convCB },
      lucro: { cp: lucroCP, cb: lucroCB }, vencedor }, results);

  return { operation_id: op.id, operation: op.name, vencedor, stats: currentMetrics, results };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const today = brDate();
    const onlyOp = await readOnlyOp(req);
    const ops = await listActiveOperations(sb, onlyOp);

    const summaries: any[] = [];
    for (const op of ops) {
      try { summaries.push(await processOperation(sb, supabaseUrl, serviceKey, today, op)); }
      catch (e) { console.error(`[notify-guerra-checkout] op=${op.id}:`, e); summaries.push({ operation_id: op.id, error: (e as Error).message }); }
    }
    return jsonRes({ success: true, processed: summaries.length, summaries });
  } catch (err) {
    console.error("notify-guerra-checkout error:", err);
    return jsonRes({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
