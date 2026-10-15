import { mirrorToWebPush } from "../_shared/push-mirror.ts";
// Sales webhook v2 - handles CartPanda, Clickbank and generic POST webhooks
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function parsePrice(raw: unknown): number {
  if (raw === null || raw === undefined) return 0;
  let str = String(raw).trim();
  if (!str) return 0;
  // Remove currency symbols and whitespace
  str = str.replace(/[R$\s]/g, "");
  // Handle BR format: 1.216,48 → 1216.48
  if (str.includes(",")) {
    if (str.includes(".") && str.indexOf(".") < str.indexOf(",")) {
      str = str.replace(/\./g, "").replace(",", ".");
    } else {
      str = str.replace(",", ".");
    }
  }
  const value = parseFloat(str);
  if (isNaN(value) || value < 0) return 0;
  // Centavos detection: only convert if value looks like cents (>= 10000 i.e. R$100+)
  // AND the raw string is purely numeric (no separators at all)
  if (value > 0 && Number.isInteger(value) && value >= 10000 && !String(raw).includes(".") && !String(raw).includes(",")) {
    return value / 100;
  }
  return value;
}

function findPrice(obj: Record<string, unknown>, fieldNames: string[]): number {
  for (const field of fieldNames) {
    const val = parsePrice(obj[field]);
    if (val > 0) return val;
  }
  return 0;
}

function scanForPrice(obj: Record<string, unknown>): number {
  const skipFields = new Set(["order_id", "orderId", "id", "transaction_id", "phone", "zip", "cep", "cpf", "cnpj", "dateTime", "datetime_full", "date", "created_at", "updated_at", "productId", "product_id", "postbackType", "upsellNo", "email", "firstName", "lastName", "phoneNumber", "country", "currency", "orderType", "order_type", "store", "status", "utm_source", "utmSource", "utm_campaign", "utmCampaign", "utm_content", "utmContent", "utm_term", "utmTerm", "quantity", "qty", "installments", "parcelas", "discount", "shipping", "frete"]);
  // Prefer fields with price-like names first
  const priceHints = ["price", "value", "amount", "total", "revenue", "receita", "valor"];
  for (const [key, val] of Object.entries(obj)) {
    if (skipFields.has(key)) continue;
    const keyLower = key.toLowerCase();
    if (priceHints.some(h => keyLower.includes(h))) {
      const parsed = parsePrice(val);
      if (parsed >= 50 && parsed <= 50000) return parsed;
    }
  }
  // Fallback: any field with a reasonable price value (higher threshold to avoid false positives)
  for (const [key, val] of Object.entries(obj)) {
    if (skipFields.has(key)) continue;
    const parsed = parsePrice(val);
    if (parsed >= 100 && parsed <= 50000) return parsed;
  }
  return 0;
}

const PRICE_FIELDS = ["totalPrice", "total_price", "amount", "price", "value", "commission", "order_total", "sale_amount", "sale_value", "purchase_amount", "purchase_value", "transaction_amount", "transaction_value", "total", "subtotal", "sub_total", "net_amount", "gross_amount", "prod_value", "product_price", "product_value", "revenue", "receita", "total_order_value", "order_value", "order_amount", "checkout_amount", "payment_amount", "payment_value", "charge_amount", "billet_value"];

// Fallback product prices when CartPanda doesn't send totalPrice
const PRODUCT_PRICE_MAP: Record<string, number> = {
  "NeuroDyne NeuroDyne 6": 1216.84,
  "NeuroDyne NeuroDyne 3": 1216.84,
  "NeuroDyne NeuroDyne 2": 1216.84,
  "NeuroDyne NeuroDyne 1": 1216.84,
  "NeuroDyne 6": 1216.84,
  "NeuroDyne 3": 1216.84,
  "NeuroDyne 2": 1216.84,
  "NeuroDyne 1": 1216.84,
  "Leandrops DTC FE LeanDrops 2 Bottles": 1198.46,
  "Leandrops DTC FE LeanDrops 6 Bottles": 1198.46,
  "Leandrops DTC FE LeanDrops 3 Bottles": 1198.46,
  "Leandrops DTC FE LeanDrops 1 Bottle": 1198.46,
  "LeanDrops 2 Bottles": 1198.46,
  "LeanDrops 6 Bottles": 1198.46,
  "LeanDrops 1 Bottle": 1198.46,
  "LeanDrops 3 Bottles": 1198.46,
};

// Brand-level fallback prices when no exact/partial match is found
const BRAND_FALLBACK: Array<{ pattern: RegExp; price: number }> = [
  { pattern: /neurodyne/i, price: 1216.84 },
  { pattern: /leandrops|lean\s*drops/i, price: 1198.46 },
];

function getFallbackPrice(productName: string | null): number {
  if (!productName) return 0;
  const name = productName.trim();
  // Exact match
  if (PRODUCT_PRICE_MAP[name]) return PRODUCT_PRICE_MAP[name];
  // Partial match on keys
  for (const [key, price] of Object.entries(PRODUCT_PRICE_MAP)) {
    if (name.includes(key) || key.includes(name)) return price;
  }
  // Brand-level fallback
  for (const { pattern, price } of BRAND_FALLBACK) {
    if (pattern.test(name)) return price;
  }
  return 0;
}

// Input sanitization: truncate strings to safe lengths
function sanitize(val: string | null, maxLen: number): string | null {
  if (!val) return null;
  const s = val.trim();
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function getBrasiliaDate(input?: Date): string {
  const d = input || new Date();
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

// Fetch USD→BRL exchange rate (with fallback)
async function fetchUsdBrlRate(): Promise<number> {
  const apis = [
    { url: "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json", extract: (d: any) => d.usd?.brl },
    { url: "https://open.er-api.com/v6/latest/USD", extract: (d: any) => d.rates?.BRL },
  ];
  for (const api of apis) {
    try {
      const res = await fetch(api.url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const data = await res.json();
      const rate = api.extract(data);
      if (rate && !isNaN(rate) && rate > 0) {
        console.info(`[sales-webhook] USD/BRL rate: ${rate}`);
        return rate;
      }
    } catch (_e) { /* try next */ }
  }
  console.warn("[sales-webhook] Exchange rate APIs failed, using fallback 5.15");
  return 5.15;
}

async function dbPost(table: string, body: Record<string, unknown>, supabaseUrl: string, serviceKey: string, upsert = false) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "apikey": serviceKey,
    "Authorization": `Bearer ${serviceKey}`,
  };
  if (upsert) {
    headers["Prefer"] = "resolution=merge-duplicates";
  }
  const res = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    return { error: text };
  }
  return { error: null };
}

/* ── UTM Resumo: extract key tags from utm_campaign ── */
function buildUtmResumo(utmCampaign: string | null): string {
  if (!utmCampaign) return "";

  // Extract all [TAG] brackets
  const tags = utmCampaign.match(/\[([^\]]+)\]/g)?.map(t => t.replace(/[\[\]]/g, "").trim()) || [];
  if (tags.length === 0) return utmCampaign.substring(0, 50);

  const parts: string[] = [];

  // 1) First bracket — always mandatory (e.g. BMSPA-C/A-07, BMGTX-FBMAX-C/A1947)
  if (tags[0]) parts.push(`[${tags[0]}]`);

  // 2) Second bracket — always mandatory (creative name, e.g. JD104V2, H02B28)
  if (tags[1]) parts.push(`[${tags[1]}]`);

  // 3) Estrutura — detect 1-50-1, 1-100-1, 1-250-1
  const estruturaTag = tags.find(t => /^\d+-\d+-\d+$/.test(t));
  if (estruturaTag) {
    const label = estruturaTag === "1-50-1" ? "Teste" : estruturaTag === "1-100-1" ? "Pré Escala" : estruturaTag === "1-250-1" ? "Escala" : estruturaTag;
    parts.push(`[${label}]`);
  }

  // 4) Data — tag like dd.mm (e.g. 21.02, 18.02)
  const dataTag = tags.find(t => /^\d{2}\.\d{2}$/.test(t));
  if (dataTag) parts.push(`[${dataTag}]`);

  // 5) Teste/Variação — extract from suffix after " - " (e.g. "T3 Top", "T18 top")
  const testeMatch = utmCampaign.match(/\s-\s*(T\d+)/i);
  if (testeMatch) parts.push(`[${testeMatch[1]}]`);

  return parts.join(" ") || utmCampaign.substring(0, 50);
}

/* ── Detect sale routing bucket para notificação Pushcut
 *
 * Buckets possíveis (apenas roteamento de template, NÃO definem operação real):
 *  - "newsbreak": venda atribuída ao canal de mídia Newsbreak Ads.
 *  - "telemed":   venda cuja NOMENCLATURA (utm_campaign ou offer_name no
 *                 RedTrack) contém "telemed". Não é um canal nem uma
 *                 operação distinta — é apenas o critério de nomenclatura
 *                 acordado para disparar o template Pushcut de TeleMed.
 *  - "meta":      padrão (todas as demais vendas).
 *
 * Regra estrita anti-falso-positivo (validação cruzada com RedTrack):
 *  - "newsbreak": exige order_id "rt:" E **qualquer um** dos campos
 *    autoritativos da RedTrack (utm_campaign / offer_name / raw_payload.campaign)
 *    contendo "newsbreak". Não roteia por store/canal sozinho.
 *  - "telemed":   exige order_id "rt:" E **qualquer um** dos mesmos campos
 *    contendo "telemed". Não roteia por canal/store sozinho.
 *  - Para esses templates, a UTM exibida também vem do RedTrack; a UTM do
 *    webhook/checkout não é autoritativa para Newsbreak/TeleMed.
 *  - Caso contrário: "meta".
 */
type MediaChannel = "newsbreak" | "telemed" | "mgid" | "meta";
type MediaDetection = { channel: MediaChannel; redtrackUtmCampaign: string | null; redtrackUtmSource: string | null };

function isNewsbreakToken(text: string): boolean {
  return /\bnews\s*break\b|\bnewsbreak\b|\bnews_break\b/i.test(text);
}

function isTelemedToken(text: string): boolean {
  return /\btele\s*med\b|\btelemed\b/i.test(text);
}

function isMgidToken(text: string): boolean {
  // MGID native traffic — SOMENTE quando o campo autoritativo de origem for MGID.
  // NÃO usar "sphere" nem varrer landing/campaign/offer_name: LPs Sphere e nomes
  // arbitrários podem aparecer em vendas Meta e geravam falso positivo (ex: [BMGTX-...]).
  return /\bmgid\b/i.test(text);
}


async function detectMediaChannel(
  _utmSource: string | null,
  _store: string | null,
  _utmCampaign: string | null,
  orderId: string | null,
  supabaseUrl: string,
  serviceKey: string,
): Promise<MediaDetection> {
  const fallback: MediaDetection = { channel: "meta", redtrackUtmCampaign: null, redtrackUtmSource: null };
  const isFromRedtrack = (orderId || "").toLowerCase().startsWith("rt:");

  // Sem prefixo rt: → tratamos como meta (sem rastro RedTrack autoritativo)
  if (!isFromRedtrack) return fallback;

  // Extrai a chave de dedup que sync-redtrack-sales gravou em order_id
  // Formato: "rt:<receipt|transaction|clickid|id>"
  const dedupKey = String(orderId).slice(3);
  if (!dedupKey) return fallback;

  try {
    const headers = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    };

    const conditions = [
      `clickid.eq.${encodeURIComponent(dedupKey)}`,
      `transaction_id.eq.${encodeURIComponent(dedupKey)}`,
      `redtrack_id.eq.${encodeURIComponent(dedupKey)}`,
    ];
    const orQuery = `or=(${conditions.join(",")})`;
    const url = `${supabaseUrl}/rest/v1/redtrack_events?${orQuery}&select=raw_payload,utm_source,utm_campaign,offer_name&limit=5`;

    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.warn(`[detectMediaChannel] RedTrack lookup failed (${res.status}) for ${orderId} — defaulting to "meta"`);
      return fallback;
    }
    const events = await res.json();
    if (!Array.isArray(events) || events.length === 0) {
      console.info(`[detectMediaChannel] No RedTrack event for ${orderId} — classified as "meta" (false-positive guard)`);
      return fallback;
    }

    // Canal de mídia NÃO pode ser inferido por utm_campaign/ad name: campanhas Meta/Facebook
    // podem carregar nomenclaturas operacionais e gerar falso positivo de NewsBreak/TeleMed.
    // Use apenas campos autoritativos de origem/oferta do RedTrack.
    for (const ev of events) {
      const redtrackUtmCampaign = String(ev?.utm_campaign || ev?.raw_payload?.utm_campaign || "").trim();
      const redtrackUtmSource = String(ev?.utm_source || ev?.raw_payload?.utm_source || "").trim() || null;
      const offerName = String(ev?.offer_name || ev?.raw_payload?.offer_name || "").trim();
      const rtCampaignAccount = String(ev?.raw_payload?.campaign || ev?.raw_payload?.offer || ev?.raw_payload?.landing || "").trim();
      const rtSource = String(ev?.raw_payload?.rt_source || ev?.raw_payload?.source || "").trim();

      const haystack = `${offerName} | ${rtCampaignAccount} | ${redtrackUtmSource} | ${rtSource}`.toLowerCase();
      // MGID: haystack restrito APENAS aos campos autoritativos de origem
      // (utm_source / rt_source / source). Landing e nome de campanha não contam.
      const sourceOnlyHaystack = `${redtrackUtmSource || ""} | ${rtSource || ""}`.toLowerCase();
      if (!haystack.trim().replace(/\|/g, "")) continue;

      if (isTelemedToken(haystack)) {
        console.info(`[detectMediaChannel] ${orderId} classified as "telemed" via "${offerName || redtrackUtmCampaign}"`);
        return { channel: "telemed", redtrackUtmCampaign: redtrackUtmCampaign || offerName, redtrackUtmSource };
      }
      if (isNewsbreakToken(haystack)) {
        console.info(`[detectMediaChannel] ${orderId} classified as "newsbreak" via "${offerName || redtrackUtmCampaign}"`);
        return { channel: "newsbreak", redtrackUtmCampaign: redtrackUtmCampaign || offerName, redtrackUtmSource };
      }
      if (isMgidToken(sourceOnlyHaystack)) {
        console.info(`[detectMediaChannel] ${orderId} classified as "mgid" via source="${redtrackUtmSource || rtSource}"`);
        return { channel: "mgid", redtrackUtmCampaign: redtrackUtmCampaign || offerName, redtrackUtmSource };
      }
    }

    console.info(`[detectMediaChannel] RedTrack event found for ${orderId}, but no field (utm_campaign/offer_name/campaign/source) contains "newsbreak"/"telemed"/"mgid" — classified as "meta"`);
    return fallback;

  } catch (err) {
    console.error(`[detectMediaChannel] Error validating ${orderId}:`, err);
    return fallback; // fail-safe
  }
}

/* ── Template-based notification dispatch for sales ── */
async function sendSaleNotifications(
  sale: { product_name: string | null; revenue: number; utm_campaign: string | null; store: string | null; utm_source: string | null; order_id: string | null },
  supabaseUrl: string,
  serviceKey: string
): Promise<boolean> {
  try {
    const headers = {
      "Content-Type": "application/json",
      "apikey": serviceKey,
      "Authorization": `Bearer ${serviceKey}`,
    };

    // Fetch active sale_approved templates
    const tplRes = await fetch(
      `${supabaseUrl}/rest/v1/notification_templates?type=eq.sale_approved&is_active=eq.true`,
      { headers }
    );
    const templates = tplRes.ok ? await tplRes.json() : [];

    // Fetch active recipients
    const rcpRes = await fetch(
      `${supabaseUrl}/rest/v1/notification_recipients?is_active=eq.true`,
      { headers }
    );
    const recipients = rcpRes.ok ? await rcpRes.json() : [];

    // Fetch enabled prefs
    const prefRes = await fetch(
      `${supabaseUrl}/rest/v1/recipient_notification_prefs?enabled=eq.true`,
      { headers }
    );
    const prefs = prefRes.ok ? await prefRes.json() : [];

    if (templates.length === 0 || recipients.length === 0) {
      console.info("[sales-webhook] No active templates/recipients Pushcut — seguindo só com Web Push");
    }

    // Build pref map: template_id -> Set<recipient_id>
    const prefsByTemplate = new Map<string, Set<string>>();
    for (const p of prefs) {
      const set = prefsByTemplate.get(p.template_id) || new Set();
      set.add(p.recipient_id);
      prefsByTemplate.set(p.template_id, set);
    }

    const recipientMap = new Map<string, any>();
    for (const r of recipients) recipientMap.set(r.id, r);

    // Detect media channel/routing bucket using only authoritative RedTrack data.
    const mediaDetection = await detectMediaChannel(sale.utm_source, sale.store, sale.utm_campaign, sale.order_id, supabaseUrl, serviceKey);
    const mediaChannel = mediaDetection.channel;
    const authoritativeUtmCampaign = mediaDetection.redtrackUtmCampaign || sale.utm_campaign;

    // Detect project for scope matching from the same UTM that will be displayed.
    const project = detectSaleProject(authoritativeUtmCampaign, sale.store);

    // Count today's approved sales for sequential counter
    let dailyCount = 0;
    try {
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      const countRes = await fetch(
        `${supabaseUrl}/rest/v1/sales_data?date=eq.${today}&status=eq.approved&select=id`,
        { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Prefer: "count=exact" } }
      );
      const countHeader = countRes.headers.get("content-range");
      if (countHeader) {
        const match = countHeader.match(/\/(\d+)/);
        if (match) dailyCount = parseInt(match[1], 10);
      }
    } catch (_e) { /* fallback to 0 */ }

    // Build variables
    const vars: Record<string, string> = {
      valor: sale.revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      produto: sale.product_name || "",
      projeto: project,
      store: sale.store || "",
      utm_campaign: authoritativeUtmCampaign || "",
      utm_resumo: buildUtmResumo(authoritativeUtmCampaign),
      contagem: String(dailyCount).padStart(2, "0"),
    };

    let anySent = false;
    let pushTitle: string | null = null;
    let pushBody: string | null = null;
    let pushOperationId: string | null = null;

    for (const tpl of templates) {
      const scope = tpl.project_scope || "TODOS";

      // Check scope match
      if (scope !== "TODOS" && scope !== project) continue;

      // ── Media channel / market filter ──
      // Templates devem disparar apenas para o canal/mercado correspondente:
      //   - nome com "newsbreak" → apenas vendas mediaChannel=="newsbreak"
      //   - nome com "telemed"   → apenas vendas mediaChannel=="telemed"
      //   - demais (default)     → apenas vendas mediaChannel=="meta"
      const tplChannel = templateChannel(tpl);
      // Fail-closed: sale_approved sem canal explícito não dispara, para impedir
      // vazamento de vendas Meta/Facebook em templates NewsBreak/TeleMed.
      if (tplChannel === "unknown") continue;
      if (tplChannel !== mediaChannel) continue;

      // Render template
      // Substitui variáveis; se ausente/vazia, renderiza string vazia
      // (nunca vazar `{{tag}}` literal no Pushcut).
      const title = (tpl.title_template || "").replace(/\{\{(\w+)\}\}/g, (_: string, key: string) => (vars[key] ?? "").toString());
      const body = (tpl.body_template || "").replace(/\{\{(\w+)\}\}/g, (_: string, key: string) => (vars[key] ?? "").toString());

      // Find recipients for this template
      const enabledRecipients = prefsByTemplate.get(tpl.id);
      if (!enabledRecipients) continue;

      for (const recipientId of enabledRecipients) {
        const recipient = recipientMap.get(recipientId);
        if (!recipient?.webhook_url) continue;

        // Check recipient project_filter
        const pf: string[] = Array.isArray(recipient.project_filter) ? recipient.project_filter : ["TODOS"];
        if (!pf.includes("TODOS") && !pf.includes(scope) && scope !== "TODOS") continue;

        try {
          const pushRes = await fetch(recipient.webhook_url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title, text: body }),
            signal: AbortSignal.timeout(8000),
          });
          if (pushRes.ok) {
            console.info(`[sales-webhook] Pushcut sent to ${recipient.name}: ${title}`);
            anySent = true;
          } else {
            console.error(`[sales-webhook] Pushcut error for ${recipient.name}:`, pushRes.status);
          }
        } catch (err) {
          console.error(`[sales-webhook] Pushcut exception for ${recipient.name}:`, err);
        }
      }

      // Enriquecimento: se houver template renderizado, usamos ele no Web Push.
      pushTitle = title;
      pushBody = body;
      pushOperationId = tpl.operation_id ?? pushOperationId;
    }

    // Canal PARALELO: Web Push — SEMPRE dispara, mesmo sem template Pushcut
    // (template é enriquecimento, nunca gate). Nunca fail-close silencioso.
    await mirrorToWebPush({
      operation_id: pushOperationId,
      notification_type: "sale_approved",
      title: pushTitle ?? `💰 Venda ${vars.valor ? `R$ ${vars.valor}` : ""}`.trim(),
      body: pushBody ?? [vars.produto, vars.projeto, sale.order_id].filter(Boolean).join(" • "),
      url: "/war-room",
      payload: {
        op: pushOperationId,
        order_id: sale.order_id ?? null,
        valor: sale.revenue ?? null,
        canal: mediaChannel,
        store: sale.store ?? null,
        utm_campaign: authoritativeUtmCampaign || null,
        sale_created_at: new Date().toISOString(),
      },
    });

    return anySent;
  } catch (err) {
    console.error("[sales-webhook] sendSaleNotifications error:", err);
    return false;
  }
}

function templateChannel(tpl: any): MediaChannel | "unknown" {
  const haystack = `${tpl?.name || ""} | ${tpl?.title_template || ""} | ${tpl?.body_template || ""}`.toLowerCase();
  if (isNewsbreakToken(haystack)) return "newsbreak";
  if (isTelemedToken(haystack)) return "telemed";
  if (isMgidToken(haystack)) return "mgid";
  return "unknown";
}


function detectSaleProject(utmCampaign: string | null, store: string | null): string {
  const text = utmCampaign || "";
  if (/\[NDM\]|\[MEMO\]|\[NDN\]/i.test(text)) return "NDM";
  if (/\[ND\]/i.test(text)) return "NDB";
  if (/\[NDR\]/i.test(text)) return "NDR";
  if (/\[LDG\]|\[LDR\]/i.test(text)) return "LDR";
  if (/\[NEURO\]|\[NDB\]/i.test(text)) return "NDB";
  const s = (store || "").toLowerCase();
  if (s === "ldg") return "LDR";
  if (s === "ndm" || s === "principal") return "NDM";
  if (s === "ndr") return "NDR";
  return "OUTROS";
}

async function markPushSent(orderId: string, supabaseUrl: string, serviceKey: string) {
  const res = await fetch(`${supabaseUrl}/rest/v1/sales_data?order_id=eq.${encodeURIComponent(orderId)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "apikey": serviceKey,
      "Authorization": `Bearer ${serviceKey}`,
      "Prefer": "return=minimal",
    },
    body: JSON.stringify({ push_sent: true, push_sent_at: new Date().toISOString() }),
  });
  if (!res.ok) {
    console.error("[sales-webhook] Failed to mark push_sent:", await res.text());
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    const url = new URL(req.url);
    const params = url.searchParams;
    const store = params.get("store") || null;
    const currency = (params.get("currency") || "").toUpperCase();

    let orderId: string | null = null;
    let revenue = 0;
    let status: string | null = null;
    let productName: string | null = null;
    let utmSource: string | null = null;
    let utmCampaign: string | null = null;
    let utmContent: string | null = null;
    let utmTerm: string | null = null;
    let dateTime: string | null = null;

    const hasQueryParams = params.has("orderId") || params.has("order_id");

    if (hasQueryParams) {
      orderId = params.get("orderId") || params.get("order_id");
      status = params.get("status") || "approved";
      productName = params.get("productName") || params.get("product_name");
      utmSource = params.get("utmSource") || params.get("utm_source");
      utmCampaign = params.get("utmCampaign") || params.get("utm_campaign");
      utmContent = params.get("utmContent") || params.get("utm_content");
      utmTerm = params.get("utmTerm") || params.get("utm_term");
      dateTime = params.get("dateTime") || params.get("datetime_full");

      const paramsObj: Record<string, unknown> = {};
      params.forEach((val, key) => { paramsObj[key] = val; });
      revenue = findPrice(paramsObj, PRICE_FIELDS);
      if (revenue === 0) revenue = scanForPrice(paramsObj);

      // Fallback: use product price map when CartPanda doesn't send totalPrice
      if (revenue === 0) {
        revenue = getFallbackPrice(productName);
        if (revenue > 0) {
          console.info(`[sales-webhook] Using fallback price R$${revenue.toFixed(2)} for product "${productName}" (order ${orderId})`);
        }
      }

      // Debug: log full params when price is still zero
      if (revenue === 0) {
        console.warn(`[sales-webhook] Price=0 for order ${params.get("orderId") || params.get("order_id")}. All params:`, JSON.stringify(paramsObj));
        try {
          await dbPost("system_logs", {
            type: "WEBHOOK_PRICE_DEBUG",
            function_name: "sales-webhook",
            message: `Price not found - order ${params.get("orderId") || params.get("order_id")}`,
            metadata: { params: paramsObj, store },
          }, supabaseUrl, serviceKey);
        } catch (_e) { /* ignore */ }
      }
    } else if (req.method === "POST") {
      const rawBody = await req.text();
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(rawBody);
      } catch (_e) {
        return new Response(JSON.stringify({ error: "Invalid JSON" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      orderId = String(payload.order_id || payload.orderId || payload.id || payload.transaction_id || "");
      status = String(payload.status || "approved").toLowerCase();

      const product = payload.product as Record<string, unknown> | undefined;
      const items = payload.items as Array<Record<string, unknown>> | undefined;
      productName = String(payload.product_name || product?.name || items?.[0]?.name || "");

      utmSource = String(payload.utm_source || payload.utmSource || "");
      utmCampaign = String(payload.utm_campaign || payload.utmCampaign || "");
      utmContent = String(payload.utm_content || payload.utmContent || "");
      utmTerm = String(payload.utm_term || payload.utmTerm || "");
      dateTime = String(payload.created_at || payload.date || payload.dateTime || "");

      revenue = findPrice(payload, PRICE_FIELDS);

      if (revenue === 0) {
        const nestedKeys = ["order", "payment", "transaction", "purchase", "checkout", "sale"];
        for (const nested of nestedKeys) {
          if (payload[nested] && typeof payload[nested] === "object") {
            revenue = findPrice(payload[nested] as Record<string, unknown>, PRICE_FIELDS);
            if (revenue > 0) break;
          }
        }
      }

      if (revenue === 0 && items && items.length > 0) {
        for (const item of items) {
          const itemPrice = findPrice(item, PRICE_FIELDS);
          if (itemPrice > 0) {
            const qty = Number(item.quantity || item.qty || 1);
            revenue += itemPrice * qty;
          }
        }
      }

      if (revenue === 0) revenue = scanForPrice(payload);

      // Fallback: use product price map when price not found in POST body
      if (revenue === 0) {
        revenue = getFallbackPrice(productName);
        if (revenue > 0) {
          console.info(`[sales-webhook] Using fallback price R$${revenue.toFixed(2)} for product "${productName}" (order ${orderId})`);
        }
      }

      const checkoutUrl = String(payload.checkout_url || payload.tracking_url || "");
      if (checkoutUrl && (!utmCampaign || !utmContent)) {
        try {
          const parsed = new URL(checkoutUrl);
          utmSource = utmSource || parsed.searchParams.get("utm_source") || "";
          utmCampaign = utmCampaign || parsed.searchParams.get("utm_campaign") || "";
          utmContent = utmContent || parsed.searchParams.get("utm_content") || "";
          utmTerm = utmTerm || parsed.searchParams.get("utm_term") || "";
        } catch (_e) { /* ignore */ }
      }
    } else {
      return new Response(JSON.stringify({ error: "No data provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auto-generate order ID when missing (e.g. Clickbank sends empty {receipt})
    if (!orderId || orderId.trim() === "") {
      orderId = `AUTO-${store || "unknown"}-${Date.now()}`;
      console.info(`[sales-webhook] Generated orderId: ${orderId} (original was empty)`);
    }

    const approvedStatuses = ["approved", "paid", "completed", "aprovado", "pago", "purchase", "upsell", "sale", ""];
    const normalizedStatus = (status || "").toLowerCase();
    if (!approvedStatuses.includes(normalizedStatus)) {
      await dbPost("integration_logs", { integration: "sales-webhook", status: "skipped", message: `Order ${orderId} skipped - status: ${status}`, records_processed: 0 }, supabaseUrl, serviceKey);
      return new Response(JSON.stringify({ success: true, message: "Order skipped - not approved" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let date: string;
    if (dateTime && dateTime.includes("T")) {
      const parsed = new Date(dateTime);
      date = isNaN(parsed.getTime()) ? getBrasiliaDate() : getBrasiliaDate(parsed);
    } else if (dateTime && dateTime.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const parsed = new Date(dateTime + "T12:00:00Z");
      date = isNaN(parsed.getTime()) ? dateTime : getBrasiliaDate(parsed);
    } else {
      date = getBrasiliaDate();
    }

    // Auto-convert USD→BRL for Clickbank or when currency=USD
    const isUsd = currency === "USD" || (store && store.toLowerCase().includes("clickbank"));
    if (isUsd && revenue > 0) {
      const rate = await fetchUsdBrlRate();
      const originalUsd = revenue;
      revenue = Math.round(revenue * rate * 100) / 100;
      console.info(`[sales-webhook] Converted USD ${originalUsd} → BRL ${revenue} (rate: ${rate})`);
    }

    const safeOrderId = sanitize(String(orderId), 100) || String(orderId).slice(0, 100);
   // Resolve operation_id from account_utm_aliases or default operation
    let resolvedOperationId: string | null = null;
    // Tentar 1: header X-Operation-ID
    resolvedOperationId = req.headers.get('x-operation-id');

    // Tentar 2: query param operation_id
    if (!resolvedOperationId) {
      resolvedOperationId = new URL(req.url).searchParams.get('operation_id');
    }

    // Tentar 3: lookup por store (slug)
    if (!resolvedOperationId && store) {
      try {
        const { data: opData } = await supabase
          .from('operations')
          .select('id')
          .eq('slug', store.toLowerCase())
          .maybeSingle();
        resolvedOperationId = opData?.id;
      } catch (_e) { /* ignore */ }
    }

    // Se não resolveu: gravar em orphan_orders + alertar (NÃO usa fallback cego)
    if (!resolvedOperationId) {
      await supabase.from('orphan_orders').insert({
        webhook_source: 'sales-webhook',
        raw_payload: payload,
        headers: Object.fromEntries(req.headers.entries()),
        reason: 'operation_id_not_resolved'
      });

      console.error('[sales-webhook] ORPHAN ORDER — operation_id não resolvido');
      return new Response(JSON.stringify({ status: 'orphan' }), { status: 200, headers: corsHeaders });
    }

    const result = await dbPost("sales_data", {
      order_id: safeOrderId, date, revenue, status: "approved",
      product_name: sanitize(productName, 255),
      utm_source: sanitize(utmSource, 100),
      utm_campaign: sanitize(utmCampaign, 255),
      utm_content: sanitize(utmContent, 255),
      utm_term: sanitize(utmTerm, 100),
     store: sanitize(store, 100),
     operation_id: resolvedOperationId,
    }, supabaseUrl, serviceKey, true);

    if (result.error) {
     await dbPost("integration_logs", { integration: "sales-webhook", status: "error", message: `Failed to insert order ${orderId}: ${result.error}`, records_processed: 0, operation_id: resolvedOperationId }, supabaseUrl, serviceKey);
      return new Response(JSON.stringify({ success: false, error: result.error }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const revenueMsg = revenue > 0 ? `R$${revenue.toFixed(2)}` : "R$0 (price not found)";

    // Template-based sale notifications via Pushcut
    if (revenue > 0) {
      const pushSent = await sendSaleNotifications(
        { product_name: productName, revenue, utm_campaign: utmCampaign, store, utm_source: utmSource, order_id: safeOrderId },
        supabaseUrl,
        serviceKey
      );
      if (pushSent) await markPushSent(safeOrderId, supabaseUrl, serviceKey);
    }

    if (revenue < 100) {
      try {
        await dbPost("system_logs", {
          type: "WEBHOOK_LOW_REVENUE",
          function_name: "sales-webhook",
          message: `Order ${orderId} - low revenue: ${revenueMsg}`,
          metadata: { revenue, store, product_name: productName },
        }, supabaseUrl, serviceKey);
      } catch (_e) { /* ignore */ }
    }

     await dbPost("integration_logs", { integration: "sales-webhook", status: "success", message: `Order ${orderId} processed - ${revenueMsg}`, records_processed: 1, operation_id: resolvedOperationId }, supabaseUrl, serviceKey);

    return new Response(JSON.stringify({ success: true, order_id: orderId, revenue }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown";
    console.error("[sales-webhook] Fatal error:", errMsg);

    try {
      await dbPost("system_logs", {
        type: "EDGE_ERROR",
        function_name: "sales-webhook",
        message: errMsg,
        stack: err instanceof Error ? err.stack : null,
        metadata: { timestamp: new Date().toISOString() },
      }, supabaseUrl, serviceKey);
    } catch (_e) { /* ignore */ }

    try {
      await dbPost("integration_logs", { integration: "sales-webhook", status: "error", message: `Webhook error: ${errMsg}`, records_processed: 0 }, supabaseUrl, serviceKey);
    } catch (_e) { /* ignore */ }

    return new Response(JSON.stringify({ success: false, error: "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
