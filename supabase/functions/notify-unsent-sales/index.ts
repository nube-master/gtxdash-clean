import { mirrorSaleToWebPush } from "../_shared/push-mirror.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function brDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function brDayStartUtc(date: string): string { return `${date}T03:00:00Z`; }

function detectSaleProject(utmCampaign: string | null, offerName: string | null, utmContent: string | null = null): string {
  const texts = [utmCampaign, utmContent].filter(Boolean) as string[];
  for (const t of texts) {
    if (/\[NDM\]|\[MEMO\]|\[NDN\]/i.test(t)) return "NDM";
    if (/\[ND\]/i.test(t)) return "NDB";
    if (/\[NDR\]/i.test(t)) return "NDR";
    if (/\[LDG\]|\[LDR\]/i.test(t)) return "LDR";
    if (/\[NEURO\]|\[NDB\]/i.test(t)) return "NDB";
  }
  if (utmContent) {
    if (/NDM|MEMO/i.test(utmContent)) return "NDM";
    if (/NDR/i.test(utmContent)) return "NDR";
    if (/LDG|LDR|leandrops/i.test(utmContent)) return "LDR";
    if (/NDB|NEURO/i.test(utmContent)) return "NDB";
  }
  if (offerName) {
    if (/NDM/i.test(offerName)) return "NDM";
    if (/NDR/i.test(offerName)) return "NDR";
    if (/LDG|LDR|leandrops/i.test(offerName)) return "LDR";
    if (/NDB|NEURO/i.test(offerName)) return "NDB";
  }
  return "OUTROS";
}

function buildUtmResumo(utmCampaign: string | null): string {
  if (!utmCampaign) return "";
  const tags = utmCampaign.match(/\[([^\]]+)\]/g)?.map(t => t.replace(/[\[\]]/g, "").trim()) || [];
  if (tags.length === 0) return utmCampaign.substring(0, 50);
  const parts: string[] = [];
  if (tags[0]) parts.push(`[${tags[0]}]`);
  if (tags[1]) parts.push(`[${tags[1]}]`);
  const est = tags.find(t => /^\d+-\d+-\d+$/.test(t));
  if (est) {
    const lbl = est === "1-50-1" ? "Teste" : est === "1-100-1" ? "Pré Escala" : est === "1-250-1" ? "Escala" : est;
    parts.push(`[${lbl}]`);
  }
  const dt = tags.find(t => /^\d{2}\.\d{2}$/.test(t));
  if (dt) parts.push(`[${dt}]`);
  const tm = utmCampaign.match(/\s-\s*(T\d+)/i);
  if (tm) parts.push(`[${tm[1]}]`);
  return parts.join(" ") || utmCampaign.substring(0, 50);
}

type MediaChannel = "newsbreak" | "telemed" | "mgid" | "meta";
const isNewsbreakToken = (t: string) => /\bnews\s*break\b|\bnewsbreak\b|\bnews_break\b/i.test(t);
const isTelemedToken = (t: string) => /\btele\s*med\b|\btelemed\b/i.test(t);
// MGID: NUNCA usar "sphere" (LP hosting) nem varrer landing/campaign/offer_name — falso positivo em vendas Meta.
const isMgidToken = (t: string) => /\bmgid\b/i.test(t);

function detectMediaChannelFromRedTrackEvent(sale: any): MediaChannel {
  const off = String(sale?.offer_name || sale?.raw_payload?.offer_name || "").trim();
  const rtc = String(sale?.raw_payload?.campaign || sale?.raw_payload?.offer || sale?.raw_payload?.landing || "").trim();
  const us = String(sale?.utm_source || sale?.raw_payload?.utm_source || "").trim();
  const rs = String(sale?.raw_payload?.rt_source || sale?.raw_payload?.source || "").trim();
  const h = `${off} | ${rtc} | ${us} | ${rs}`.toLowerCase();
  // MGID: haystack restrito APENAS aos campos autoritativos de origem.
  const sourceOnly = `${us} | ${rs}`.toLowerCase();
  if (isTelemedToken(h)) return "telemed";
  if (isNewsbreakToken(h)) return "newsbreak";
  if (isMgidToken(sourceOnly)) return "mgid";
  return "meta";
}
function templateChannel(tpl: any): MediaChannel | "unknown" {
  const h = `${tpl?.name || ""} | ${tpl?.title_template || ""} | ${tpl?.body_template || ""}`.toLowerCase();
  if (isNewsbreakToken(h)) return "newsbreak";
  if (isTelemedToken(h)) return "telemed";
  if (isMgidToken(h)) return "mgid";
  return "unknown";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const h = { ...corsHeaders, "Content-Type": "application/json" };
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // RECOVERY MODE guard
    const { data: rm } = await sb.from("app_settings").select("value").eq("key", "recovery_mode").maybeSingle();
    if (rm?.value === true) return new Response(JSON.stringify({ skipped: true, reason: "recovery_mode" }), { headers: h });

    const today = brDate();
    const startUtc = brDayStartUtc(today);

    // Exchange rate — internal source
    const { data: rateRow } = await sb.from("exchange_rate_log")
      .select("rate").order("created_at", { ascending: false }).limit(1).maybeSingle();
    const usdToBrlRate = Number(rateRow?.rate ?? 0) > 0 ? Number(rateRow!.rate) : 5.15;

    // Only process active operations (loop guarantees per-op scoping)
    const { data: ops } = await sb.from("operations").select("id, name").eq("status", "active");
    const summaries: any[] = [];

    for (const op of ops || []) {
      const opId = op.id;
      try {
        // Unsent purchases scoped to this op
        const { data: unsent } = await sb.from("redtrack_events")
          .select("id, redtrack_id, amount, currency, product_name, utm_campaign, utm_source, utm_content, offer_name, raw_payload, occurred_at")
          .eq("operation_id", opId)
          .eq("event_type", "purchase")
          .gt("amount", 0)
          .is("push_sent_at", null)
          .gte("occurred_at", startUtc)
          .order("occurred_at", { ascending: true })
          .limit(50);

        if (!unsent || unsent.length === 0) {
          summaries.push({ operation_id: opId, operation: op.name, pushSent: 0, unsent: 0 });
          continue;
        }

        // Templates and recipients scoped to this op
        const { data: templates } = await sb.from("notification_templates")
          .select("*").eq("type", "sale_approved").eq("is_active", true).eq("operation_id", opId);
        const { data: recipients } = await sb.from("notification_recipients")
          .select("*").eq("is_active", true).eq("operation_id", opId);
        const { data: prefs } = await sb.from("recipient_notification_prefs").select("*").eq("enabled", true);

        // Sem template/recipient Pushcut NÃO abortamos: Web Push é canal independente.
        if ((templates || []).length === 0 || (recipients || []).length === 0) {
          console.info(`[unsent-sales][${op.name}] sem template/recipient Pushcut — seguindo só com Web Push`);
        }

        const prefsByTpl = new Map<string, Set<string>>();
        for (const p of prefs || []) {
          const s = prefsByTpl.get(p.template_id) || new Set();
          s.add(p.recipient_id);
          prefsByTpl.set(p.template_id, s);
        }
        const recMap = new Map<string, any>();
        for (const r of recipients || []) recMap.set(r.id, r);

        // Daily count for this op
        const { count } = await sb.from("redtrack_events")
          .select("id", { count: "exact", head: true })
          .eq("operation_id", opId).eq("event_type", "purchase").gt("amount", 0)
          .gte("occurred_at", startUtc);
        const dailyCount = count || 0;

        let pushSent = 0;
        for (const sale of unsent) {
          // Claim atômico antes do envio: duas execuções concorrentes do cron não
          // podem processar a mesma venda com push_sent_at ainda nulo.
          const claimedAt = new Date().toISOString();
          const { data: claimedSale, error: claimError } = await sb
            .from("redtrack_events")
            .update({ push_sent_at: claimedAt })
            .eq("id", sale.id)
            .is("push_sent_at", null)
            .select("id")
            .maybeSingle();
          if (claimError) {
            console.error(`[unsent-sales][${op.name}] claim failed for ${sale.id}:`, claimError.message);
            continue;
          }
          if (!claimedSale) continue;

          const project = detectSaleProject(sale.utm_campaign, sale.offer_name, sale.utm_content);
          const ch = detectMediaChannelFromRedTrackEvent(sale);
          const revenueBrl = sale.currency === "BRL"
            ? Math.round(sale.amount * 100) / 100
            : Math.round(sale.amount * usdToBrlRate * 100) / 100;

          const vars: Record<string, string> = {
            valor: revenueBrl.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            produto: sale.product_name || "",
            projeto: project,
            store: "clickbank",
            utm_campaign: sale.utm_campaign || sale.utm_content || "",
            utm_resumo: buildUtmResumo(sale.utm_campaign || sale.utm_content),
            contagem: String(dailyCount).padStart(2, "0"),
            operacao: op.name,
          };

          let anySent = false;
          let pushTitle: string | null = null;
          let pushBody: string | null = null;
          for (const tpl of templates || []) {
            const scope = tpl.project_scope || "TODOS";
            if (scope !== "TODOS" && scope !== project) continue;
            const tc = templateChannel(tpl);
            if (tc === "unknown") continue;
            if (tc !== ch) continue;

            const title = (tpl.title_template || "").replace(/\{\{(\w+)\}\}/g, (_: string, k: string) => (vars[k] ?? "").toString());
            const body = (tpl.body_template || "").replace(/\{\{(\w+)\}\}/g, (_: string, k: string) => (vars[k] ?? "").toString());
            const enabled = prefsByTpl.get(tpl.id);
            if (!enabled) continue;

            for (const rid of enabled) {
              const r = recMap.get(rid);
              if (!r?.webhook_url) continue;
              const pf: string[] = Array.isArray(r.project_filter) ? r.project_filter : ["TODOS"];
              if (!pf.includes("TODOS") && !pf.includes(scope) && scope !== "TODOS") continue;
              try {
                const res = await fetch(r.webhook_url, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ title, text: body }),
                  signal: AbortSignal.timeout(8000),
                });
                if (res.ok) anySent = true;
                else console.error(`[unsent-sales][${op.name}] pushcut error ${res.status} for ${r.name}`);
              } catch (e) {
                console.error(`[unsent-sales][${op.name}] push exception for ${r.name}:`, e);
              }
            }

            // Enriquecimento para o Web Push (template não é gate)
            pushTitle = title;
            pushBody = body;
          }

          // Canal PARALELO: Web Push — SEMPRE dispara por venda (com valor_usd para o body do template)
          const rawUtmCampaign = (sale.raw_payload?.sub6 as string) || sale.utm_campaign || (sale.raw_payload?.cname as string) || null;
          await mirrorSaleToWebPush({
            operation_id: opId,
            order_id: sale.redtrack_id ?? null,
            valor: revenueBrl,
            currency: "BRL",
            produto: sale.product_name ?? null,
            canal: ch,
            url: "/war-room",
            utm_campaign: rawUtmCampaign,
            sale_created_at: sale.occurred_at ?? null,
          });


          if (anySent) pushSent++;
        }

        summaries.push({ operation_id: opId, operation: op.name, unsent: unsent.length, pushSent });
      } catch (e) {
        console.error(`[unsent-sales] op=${opId}:`, e);
        summaries.push({ operation_id: opId, error: (e as Error).message });
      }
    }

    return new Response(JSON.stringify({ success: true, processed: summaries.length, summaries }), { headers: h });
  } catch (e) {
    console.error(`[notify-unsent-sales] Error:`, e);
    return new Response(JSON.stringify({ success: false, error: (e as Error).message }), { status: 500, headers: h });
  }
});
