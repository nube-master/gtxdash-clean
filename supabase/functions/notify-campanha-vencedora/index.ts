import { createClient } from "npm:@supabase/supabase-js@2";
import {
  brDate, replaceVars, spDayBounds,
  listActiveOperations, fetchOpTemplate, fetchOpRecipients,
  sendToRecipients, logAutomatedReport, readOnlyOp,
} from "../_shared/notify-scope.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const jsonRes = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b, null, 2), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function buildCampanhaResumo(name: string): string {
  const tags = name.match(/\[([^\]]+)\]/g)?.map(t => t.replace(/[\[\]]/g, "").trim()) || [];
  if (tags.length === 0) return name.substring(0, 60);
  const parts: string[] = [];
  if (tags[0]) parts.push(`[${tags[0]}]`);
  if (tags[1]) parts.push(`[${tags[1]}]`);
  const projectTag = tags.find(t => /^(NDM|NDR|LDR|NDB|NEURO)$/i.test(t));
  if (projectTag) parts.push(`[${projectTag}]`);
  const estruturaTag = tags.find(t => /^\d+-\d+-\d+$/.test(t));
  if (estruturaTag) {
    const label = estruturaTag === "1-50-1" ? "Teste" : estruturaTag === "1-100-1" ? "Pré Escala" : estruturaTag === "1-250-1" ? "Escala" : estruturaTag;
    parts.push(`[${label}]`);
  }
  const dataTag = tags.find(t => /^\d{2}\.\d{2}$/.test(t));
  if (dataTag) parts.push(`[${dataTag}]`);
  const varMatch = name.match(/\]\s*[-–]\s*(T?\d+)\s*[-–]?\s*(top)?/i);
  if (varMatch) parts.push(varMatch[1]);
  return parts.join(" ") || name.substring(0, 60);
}

async function fetchAll(sb: any, table: string, select: string, filters: (q: any) => any) {
  const PAGE = 1000;
  let all: any[] = []; let from = 0;
  while (true) {
    let q = sb.from(table).select(select); q = filters(q); q = q.range(from, from + PAGE - 1);
    const { data, error } = await q;
    if (error) { console.error(`fetchAll ${table}:`, error.message); break; }
    all = all.concat(data || []);
    if ((data?.length || 0) < PAGE) break;
    from += PAGE;
  }
  return all;
}

async function processOperation(sb: any, today: string, op: { id: string; name: string }) {
  const tpl = await fetchOpTemplate(sb, op.id, "campanha_vencedora");
  if (!tpl) return { operation_id: op.id, operation: op.name, skipped: "no_active_template" };

  const { startUtc, endUtc } = spDayBounds(today);
  const [trafficRows, rtRows, rateRow] = await Promise.all([
    fetchAll(sb, "traffic_data", "campaign_name, spend",
      (q: any) => q.eq("date", today).eq("operation_id", op.id)),
    fetchAll(sb, "redtrack_events", "utm_campaign, amount, currency",
      (q: any) => q.eq("event_type", "purchase").gt("amount", 0)
        .gte("occurred_at", startUtc).lt("occurred_at", endUtc).eq("operation_id", op.id)),
    sb.from("exchange_rate_log").select("rate").order("created_at", { ascending: false }).limit(1).single().then((r: any) => r.data),
  ]);
  const usdToBrl = rateRow?.rate > 0 ? Number(rateRow.rate) : 5.15;

  const campaignSpend = new Map<string, number>();
  for (const t of trafficRows) campaignSpend.set(t.campaign_name, (campaignSpend.get(t.campaign_name) || 0) + (t.spend || 0));

  const campaignRevenue = new Map<string, number>();
  for (const r of rtRows) {
    const k = r.utm_campaign || ""; if (!k) continue;
    const amt = r.currency === "BRL" ? (r.amount || 0) : (r.amount || 0) * usdToBrl;
    campaignRevenue.set(k, (campaignRevenue.get(k) || 0) + amt);
  }

  let bestName = ""; let bestProfit = -Infinity;
  for (const [name, sp] of campaignSpend.entries()) {
    const rv = campaignRevenue.get(name) || 0;
    const p = rv - sp;
    if (p > bestProfit) { bestProfit = p; bestName = name; }
  }
  if (!bestName || bestProfit <= 0) return { operation_id: op.id, operation: op.name, skipped: "no_profitable_campaign" };

  // De-dupe per op
  const { data: existing } = await sb.from("automated_reports_log")
    .select("metrics").eq("report_type", "campanha-vencedora").eq("operation_id", op.id)
    .gte("created_at", `${today}T00:00:00Z`);
  for (const log of (existing || [])) {
    if ((log.metrics as any)?.campaign_name === bestName) {
      return { operation_id: op.id, operation: op.name, skipped: "already_notified" };
    }
  }

  const fmtCompact = (v: number) => Math.round(v).toLocaleString("pt-BR");
  const vars: Record<string, string> = {
    campanha_nome: buildCampanhaResumo(bestName),
    lucro: fmtCompact(bestProfit),
    operacao: op.name,
  };
  const title = replaceVars(tpl.title_template, vars);
  const body = replaceVars(tpl.body_template, vars);

  const recipients = await fetchOpRecipients(sb, op.id, tpl.id);
  const results = await sendToRecipients(recipients, title, body, { operation_id: op.id, notification_type: "campanha_vencedora", url: "/" });
  await logAutomatedReport(sb, op.id, "campanha-vencedora", `${title}\n${body}`,
    { campaign_name: bestName, resumo: buildCampanhaResumo(bestName), profit: bestProfit }, results);

  return { operation_id: op.id, operation: op.name, winner: buildCampanhaResumo(bestName), profit: bestProfit, results };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const today = brDate();
    const onlyOp = await readOnlyOp(req);
    const ops = await listActiveOperations(sb, onlyOp);

    const summaries: any[] = [];
    for (const op of ops) {
      try { summaries.push(await processOperation(sb, today, op)); }
      catch (e) { console.error(`[notify-campanha-vencedora] op=${op.id}:`, e); summaries.push({ operation_id: op.id, error: (e as Error).message }); }
    }
    return jsonRes({ success: true, processed: summaries.length, summaries });
  } catch (err) {
    console.error("notify-campanha-vencedora error:", err);
    return jsonRes({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
