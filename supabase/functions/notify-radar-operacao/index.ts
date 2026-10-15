import { createClient } from "npm:@supabase/supabase-js@2";
import { replaceVars, fmtBRL, listActiveOperations, fetchOpTemplate, fetchOpRecipients, sendToRecipients, logAutomatedReport, readOnlyOp } from "../_shared/notify-scope.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const jsonRes = (b: unknown, s = 200) => new Response(JSON.stringify(b, null, 2), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function detectStructure(name: string): "TESTE" | "PRÉ ESCALA" | "ESCALA" | "OUTRO" {
  if (name.includes("1-250-1")) return "ESCALA";
  if (name.includes("1-100-1")) return "PRÉ ESCALA";
  if (name.includes("1-50-1")) return "TESTE";
  return "OUTRO";
}

async function fetchAll(sb: any, table: string, select: string, apply: (q: any) => any) {
  const PAGE=1000; let all: any[] = []; let from = 0;
  while (true) {
    const { data, error } = await apply(sb.from(table).select(select)).range(from, from+PAGE-1);
    if (error) { console.error(`fetchAll ${table}:`, error.message); break; }
    all = all.concat(data || []);
    if ((data?.length||0) < PAGE) break; from += PAGE;
  }
  return all;
}

async function processOp(sb: any, op: { id: string; name: string }) {
  const tpl = await fetchOpTemplate(sb, op.id, "radar_operacao");
  if (!tpl) return { operation_id: op.id, operation: op.name, skipped: "no_active_template" };

  const { data: activeAccounts } = await sb.from("meta_ad_accounts")
    .select("account_id").eq("operation_id", op.id).eq("is_active", true).eq("account_status", 1);
  const activeAccountIds = new Set((activeAccounts || []).map((a: any) => a.account_id));

  const freshCutoff = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
  const allCampaigns = await fetchAll(sb, "meta_campaign_status",
    "account_id, campaign_id, campaign_name, effective_status, daily_budget, updated_at",
    (q: any) => q.eq("operation_id", op.id).eq("effective_status", "ACTIVE").gte("updated_at", freshCutoff));

  const campaigns = allCampaigns.filter((c: any) => activeAccountIds.has(c.account_id));
  const campaignsActive = campaigns.length;

  let teste=0, preEscala=0, escala=0;
  for (const c of campaigns) {
    const s = detectStructure(c.campaign_name || "");
    if (s === "TESTE") teste++;
    else if (s === "PRÉ ESCALA") preEscala++;
    else if (s === "ESCALA") escala++;
  }

  // Orçamento Projetado = mesma lógica da aba Campanhas:
  // soma bruta de meta_campaign_status.daily_budget (já em BRL) das ACTIVE.
  let budgetTotal = 0;
  for (const c of campaigns as any[]) {
    const v = Number(c.daily_budget || 0);
    if (v > 0) budgetTotal += v;
  }

  // Criativos Ativos = mesma lógica do useMetaAdPagesStats (aba Campanhas):
  // distintos ad_id em meta_ad_pages com effective_status=ACTIVE para a operação.
  const adPages = await fetchAll(sb, "meta_ad_pages",
    "ad_id, effective_status",
    (q: any) => q.eq("operation_id", op.id).eq("effective_status", "ACTIVE"));
  const uniqueAds = new Set<string>();
  for (const r of adPages as any[]) if (r.ad_id) uniqueAds.add(r.ad_id);
  const creativesActive = uniqueAds.size;

  const vars: Record<string,string> = {
    campaigns_active: String(campaignsActive),
    ads_active: creativesActive.toLocaleString("pt-BR"),
    budget_total: fmtBRL(budgetTotal),
    operacao: op.name,
  };
  const title = replaceVars(tpl.title_template, vars);
  const body = replaceVars(tpl.body_template, vars);

  const recipients = await fetchOpRecipients(sb, op.id, tpl.id);
  const results = await sendToRecipients(recipients, title, body, {
    operation_id: op.id,
    notification_type: "radar_operacao",
    url: "/",
    // push-send re-interpola o template: as vars precisam ir no payload.
    payload: {
      campaigns_active: String(campaignsActive),
      ads_active: creativesActive.toLocaleString("pt-BR"),
      budget_total: fmtBRL(budgetTotal),
      operacao: op.name,
    },
  });
  await logAutomatedReport(sb, op.id, "radar-operacao", `${title}\n${body}`,
    { campaignsActive, creativesActive, budgetTotal, teste, preEscala, escala }, results);

  return { operation_id: op.id, operation: op.name, campaignsActive, creativesActive, budgetTotal, results };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const onlyOp = await readOnlyOp(req);
    const ops = await listActiveOperations(sb, onlyOp);
    const summaries: any[] = [];
    for (const op of ops) {
      try { summaries.push(await processOp(sb, op)); }
      catch (e) { console.error(`[radar-operacao] op=${op.id}:`, e); summaries.push({ operation_id: op.id, error: (e as Error).message }); }
    }
    return jsonRes({ success: true, processed: summaries.length, summaries });
  } catch (err) {
    console.error("notify-radar-operacao error:", err);
    return jsonRes({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
