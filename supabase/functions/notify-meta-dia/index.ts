import { createClient } from "npm:@supabase/supabase-js@2";
import {
  brDate, fmtBRL, replaceVars, spDayBounds,
  listActiveOperations, fetchOpTemplate, fetchOpRecipients,
  sendToRecipients, logAutomatedReport, readOnlyOp,
} from "../_shared/notify-scope.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const jsonRes = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b, null, 2), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function processOperation(sb: any, today: string, op: { id: string; name: string }) {
  const currentMonth = today.substring(0, 7);
  const { data: goal } = await sb.from("monthly_goals")
    .select("goal_value").eq("month", currentMonth).eq("operation_id", op.id).maybeSingle();
  if (!goal?.goal_value || goal.goal_value <= 0) {
    return { operation_id: op.id, operation: op.name, skipped: "no_goal_configured" };
  }

  const monthlyGoal = Number(goal.goal_value);
  const daysInMonth = new Date(parseInt(today.split("-")[0]), parseInt(today.split("-")[1]), 0).getDate();
  const dailyGoal = monthlyGoal / daysInMonth;

  const { startUtc, endUtc } = spDayBounds(today);
  const [{ data: salesData }, { data: rtData }] = await Promise.all([
    sb.from("sales_data").select("revenue").eq("date", today).eq("status", "approved").eq("operation_id", op.id),
    sb.from("redtrack_events").select("amount").eq("event_type", "purchase")
      .gte("occurred_at", startUtc).lt("occurred_at", endUtc).eq("operation_id", op.id),
  ]);
  const salesRev = (salesData || []).reduce((s: number, r: any) => s + (r.revenue || 0), 0);
  const rtRev = (rtData || []).reduce((s: number, r: any) => s + (r.amount || 0), 0);
  const todayRevenue = Math.max(salesRev, rtRev);

  // Idempotência: skip se já notificou hoje pra esta op
  const { data: existing } = await sb.from("automated_reports_log")
    .select("id").eq("report_type", "meta-dia-atingida").eq("operation_id", op.id)
    .gte("created_at", `${today}T00:00:00Z`).limit(1);
  if (existing && existing.length > 0) return { operation_id: op.id, operation: op.name, skipped: "already_notified_today" };

  if (todayRevenue < dailyGoal) return { operation_id: op.id, operation: op.name, skipped: "goal_not_reached", dailyGoal, todayRevenue };

  const tpl = await fetchOpTemplate(sb, op.id, "meta_dia");
  if (!tpl) return { operation_id: op.id, operation: op.name, skipped: "no_active_template" };

  const progresso = Math.round((todayRevenue / dailyGoal) * 100);
  const vars: Record<string, string> = {
    meta_valor: fmtBRL(dailyGoal),
    faturamento: fmtBRL(todayRevenue),
    progresso: String(progresso),
    operacao: op.name,
  };
  const title = replaceVars(tpl.title_template, vars);
  const body = replaceVars(tpl.body_template, vars);

  const recipients = await fetchOpRecipients(sb, op.id, tpl.id);
  const results = await sendToRecipients(recipients, title, body, { operation_id: op.id, notification_type: "meta_dia", url: "/" });
  await logAutomatedReport(sb, op.id, "meta-dia-atingida", `${title}\n${body}`,
    { dailyGoal, todayRevenue, progresso }, results);

  return { operation_id: op.id, operation: op.name, dailyGoal, todayRevenue, progresso, results };
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
      catch (e) { console.error(`[notify-meta-dia] op=${op.id}:`, e); summaries.push({ operation_id: op.id, error: (e as Error).message }); }
    }
    return jsonRes({ success: true, processed: summaries.length, summaries });
  } catch (err) {
    console.error("notify-meta-dia error:", err);
    return jsonRes({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
