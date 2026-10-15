/**
 * Hotmart Webhook (Postback 2.0).
 * Receives PURCHASE_APPROVED / PURCHASE_REFUNDED / PURCHASE_CHARGEBACK events,
 * validates via HOTTOK header (matched against app_settings.hotmart_config.hottok
 * for the resolved operation), and stores transactions in clickbank_audit with
 * source='hotmart'. Auto-detects BRL/USD/EUR via payload currency.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { mirrorSaleToWebPush } from "../_shared/push-mirror.ts";

// ─── UTMfy external_code parser (inline) ──────────────────
// Formato real do UTMfy no external_code (xcod) da Hotmart:
//   SOURCE{SEP}CAMP_NAME|CAMP_ID{SEP}ADSET_NAME|ADSET_ID{SEP}AD_NAME|AD_ID{SEP}PLACEMENT_NAME
// Ex.: Meta...jLj[SEP][BMMARI-C/A01] [AD...|120247935676480474[SEP]01 - [21 A 65] [WO...|120247935676470474[SEP][AD50] [LOJAS GRIN...|120247935676490474[SEP]Instagram_Reels...
const UTMFY_SEP = "hQwK21wXxR";
const UTMFY_META_ID_RE = /^\d{10,20}$/;
interface UtmfyParsed { source: string | null; campaign_id: string | null; campaign_name: string | null; adset_id: string | null; adset_name: string | null; ad_id: string | null; ad_name: string | null; placement_id: string | null; placement_name: string | null; }
function utmfySplitPair(block: string): { a: string | null; b: string | null } {
  if (!block) return { a: null, b: null };
  if (block.includes(UTMFY_SEP)) {
    const [a, ...rest] = block.split(UTMFY_SEP);
    return { a: (a || "").replace(/\.{2,}$/, "").trim() || null, b: rest.join(UTMFY_SEP).replace(/\.{2,}$/, "").trim() || null };
  }
  return { a: block.replace(/\.{2,}$/, "").trim() || null, b: null };
}
function parseUtmfyXcod(raw: string | null | undefined): UtmfyParsed | null {
  if (!raw || typeof raw !== "string" || !raw.includes(UTMFY_SEP)) return null;
  const parts = raw.split("|").map((p) => p.trim());
  // Bloco N: [prev_id, curr_name] (bloco 0 é [source, campaign_name])
  const b0 = utmfySplitPair(parts[0] || ""); // source | campaign_name
  const b1 = utmfySplitPair(parts[1] || ""); // campaign_id | adset_name
  const b2 = utmfySplitPair(parts[2] || ""); // adset_id | ad_name
  const b3 = utmfySplitPair(parts[3] || ""); // ad_id | placement_name
  const asId = (v: string | null) => (v && UTMFY_META_ID_RE.test(v) ? v : null);
  return {
    source: b0.a,
    campaign_name: b0.b,
    campaign_id: asId(b1.a),
    adset_name: b1.b,
    adset_id: asId(b2.a),
    ad_name: b2.b,
    ad_id: asId(b3.a),
    placement_name: b3.b,
    placement_id: null,
  };
}
// Compat alias (algum lugar ainda chama parseUtmfySck)
const parseUtmfySck = parseUtmfyXcod;
// ───────────────────────────────────────────────────────────

async function resolveMetaNames(
  supabase: any,
  operationId: string | null,
  parsed: { campaign_id: string | null; ad_id: string | null; campaign_name: string | null; ad_name: string | null },
): Promise<{ campaign_name: string | null; ad_name: string | null; adset_name: string | null }> {
  let campaign_name = parsed.campaign_name;
  let ad_name = parsed.ad_name;
  let adset_name: string | null = null;
  if (parsed.campaign_id) {
    let q = supabase.from("meta_campaign_status").select("campaign_name").eq("campaign_id", parsed.campaign_id).limit(1);
    if (operationId) q = q.eq("operation_id", operationId);
    const { data } = await q.maybeSingle();
    if (data?.campaign_name) campaign_name = data.campaign_name;
  }
  if (parsed.ad_id) {
    let q = supabase.from("meta_ad_pages").select("ad_name, campaign_name").eq("ad_id", parsed.ad_id).limit(1);
    if (operationId) q = q.eq("operation_id", operationId);
    const { data } = await q.maybeSingle();
    if (data?.ad_name) ad_name = data.ad_name;
    if (data?.campaign_name && !campaign_name) campaign_name = data.campaign_name;
  }
  return { campaign_name, ad_name, adset_name };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-hotmart-hottok, hottok",
};

function getBrasiliaDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function getBrasiliaDateFrom(value: string | number | Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

const handleRequest = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // Hotmart posts JSON by default (Postback 2.0)
    const contentType = req.headers.get("content-type") || "";
    let payload: any = {};
    if (contentType.includes("application/json")) {
      payload = await req.json();
    } else {
      const text = await req.text();
      try { payload = JSON.parse(text); }
      catch { payload = Object.fromEntries(new URLSearchParams(text)); }
    }

    // 🔍 FULL RAW PAYLOAD DUMP — para diagnosticar se a Hotmart está mandando UTMs
    console.log("[HOTMART-RAW-PAYLOAD]", JSON.stringify(payload));



    // Resolve operation from query param
    const url = new URL(req.url);
    const opSlug = url.searchParams.get("op");
    let operationId: string | null = req.headers.get("x-operation-id") || url.searchParams.get("operation_id");

    if (!operationId && opSlug) {
      const { data: op } = await supabase
        .from("operations").select("id").eq("slug", opSlug).maybeSingle();
      operationId = op?.id || null;
    }

    if (!operationId) {
      await supabase.from("orphan_orders").insert({
        webhook_source: "hotmart-webhook",
        raw_payload: payload,
        headers: Object.fromEntries(req.headers.entries()),
        reason: "operation_id_not_resolved"
      });
      console.error("[hotmart-webhook] ORPHAN ORDER — operation_id não resolvido");
      return new Response(JSON.stringify({ status: "orphan" }), { status: 200, headers: corsHeaders });
    }

    // Validate HOTTOK (Hotmart's shared secret) if configured for this op
    const hottokHeader =
      req.headers.get("x-hotmart-hottok") ||
      req.headers.get("hottok") ||
      payload.hottok ||
      "";
    if (operationId) {
      const { data: config } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "hotmart_config")
        .eq("operation_id", operationId)
        .maybeSingle();
      const savedHottok = (config?.value as any)?.hottok;
      if (savedHottok && hottokHeader !== savedHottok) {
        console.warn("[hotmart-webhook] Invalid HOTTOK for op", opSlug);
        await supabase.from("integration_logs").insert({
          integration: "hotmart",
          status: "error",
          message: `HOTTOK inválido para operação ${opSlug}`,
          operation_id: operationId,
        });
        return new Response(JSON.stringify({ error: "invalid hottok" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Postback 2.0 shape: { event, data: { purchase: {...}, product: {...}, buyer: {...}, affiliations: [] } }
    const event: string = (payload.event || payload.status || "").toString().toUpperCase();
    const data = payload.data || payload;
    const purchase = data.purchase || {};
    const product = data.product || {};
    const buyer = data.buyer || {};

    const orderId =
      purchase.transaction ||
      purchase.order_id ||
      purchase.checkout_id ||
      data.transaction ||
      "";

    // Ping/test event with no transaction → return OK
    if (!orderId) {
      console.log("[hotmart-webhook] Test ping (no transaction) — responding OK");
      await supabase.from("integration_logs").insert({
        integration: "hotmart",
        status: "success",
        message: `Ping de teste recebido${operationId ? ` (op ${opSlug})` : ""}`,
        operation_id: operationId,
      });
      return new Response("OK", {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/plain" },
      });
    }

    // Only handle the two events we care about
    const APPROVED = ["PURCHASE_APPROVED", "PURCHASE_COMPLETE", "APPROVED"];
    const REFUNDED = ["PURCHASE_REFUNDED", "PURCHASE_CHARGEBACK", "REFUNDED", "CHARGEBACK"];

    let transactionType: "SALE" | "RFND" | "CGBK" | null = null;
    if (APPROVED.includes(event)) transactionType = "SALE";
    else if (event === "PURCHASE_CHARGEBACK" || event === "CHARGEBACK") transactionType = "CGBK";
    else if (REFUNDED.includes(event)) transactionType = "RFND";

    if (!transactionType) {
      console.log(`[hotmart-webhook] Ignoring event: ${event}`);
      await supabase.from("integration_logs").insert({
        integration: "hotmart",
        status: "skipped",
        message: `Evento ignorado: ${event}`,
        operation_id: operationId,
      });
      return new Response("OK", {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/plain" },
      });
    }

    // Amount and currency
    // Prioridade: comissão LÍQUIDA do PRODUTOR
    //   1º: data.commissions[source=PRODUCER].value
    //   2º: purchase.price.value - purchase.hotmart_fee.total (fallback padrão)
    const commissions: any[] = Array.isArray(data.commissions) ? data.commissions : [];
    const producerComm = commissions.find(
      (c) => String(c?.source || "").toUpperCase() === "PRODUCER",
    );
    const priceObj = purchase.price || purchase.full_price || {};
    const feeObj = purchase.hotmart_fee || {};
    let amountRaw = Number(producerComm?.value ?? NaN);
    let amountSource: "PRODUCER_COMMISSION" | "PRICE_MINUS_FEE" | "PRICE_GROSS" = "PRODUCER_COMMISSION";
    let currencyFrom = String(producerComm?.currency_value || producerComm?.currency || "").toUpperCase();
    if (!Number.isFinite(amountRaw) || amountRaw <= 0) {
      const priceVal = Number(priceObj.value ?? purchase.price_value ?? purchase.value ?? purchase.amount ?? NaN);
      const feeVal = Number(feeObj.total ?? NaN);
      if (Number.isFinite(priceVal) && priceVal > 0 && Number.isFinite(feeVal) && feeVal >= 0) {
        amountRaw = Math.max(0, priceVal - feeVal);
        amountSource = "PRICE_MINUS_FEE";
        currencyFrom = String(priceObj.currency_code || priceObj.currency_value || priceObj.currency || feeObj.currency_code || "").toUpperCase();
      } else {
        amountRaw = Number(priceVal || 0);
        amountSource = "PRICE_GROSS";
        currencyFrom = String(priceObj.currency_code || priceObj.currency_value || priceObj.currency || "").toUpperCase();
      }
    }
    const currency = (currencyFrom || String(purchase.currency || "BRL")).toUpperCase();


    // Date — SEMPRE priorizar a data de APROVAÇÃO do pagamento.
    // `purchase.order_date` em assinaturas/trial é a data do pedido original
    // (ex.: trial de 8 dias) e jogaria a venda para o passado.
    const orderTs =
      purchase.approved_date ||
      payload.creation_date ||
      purchase.order_date ||
      Date.now();


    const orderDateIso = new Date(Number(orderTs) || Date.parse(String(orderTs)) || Date.now())
      .toISOString();
    const orderDate = getBrasiliaDateFrom(orderDateIso) || getBrasiliaDate();

    // Currency conversion → both USD and BRL for downstream parity
    let usdToBrl = 5.15;
    {
      const { data: rateRow } = await supabase
        .from("exchange_rate_log")
        .select("rate").order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (rateRow?.rate) usdToBrl = Number(rateRow.rate);
    }
    // EUR→USD approx (fallback if no EUR rate cached)
    const EUR_TO_USD = 1.08;

    let amountUsd = 0;
    let amountBrl = 0;
    if (currency === "BRL") {
      amountBrl = amountRaw;
      amountUsd = usdToBrl > 0 ? amountRaw / usdToBrl : 0;
    } else if (currency === "USD") {
      amountUsd = amountRaw;
      amountBrl = amountRaw * usdToBrl;
    } else if (currency === "EUR") {
      amountUsd = amountRaw * EUR_TO_USD;
      amountBrl = amountUsd * usdToBrl;
    } else {
      // Unknown currency: assume BRL to keep the row visible; log warning
      amountBrl = amountRaw;
      amountUsd = usdToBrl > 0 ? amountRaw / usdToBrl : 0;
    }

    // Affiliate (first affiliation if any)
    const affiliate =
      (Array.isArray(data.affiliations) && data.affiliations[0]?.affiliate_code) ||
      purchase.affiliate ||
      null;

    const productName = product.name || product.product_name || "";
    const productId = product.id?.toString() || product.ucode || "";

    // === Allowlist de produtos por operação ===
    // Se configurado, apenas produtos selecionados alimentam o dash.
    if (operationId) {
      const { data: cfgRow } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "hotmart_config")
        .eq("operation_id", operationId)
        .maybeSingle();
      const cfgVal = (cfgRow?.value as any) || {};
      const allowedList: string[] = Array.isArray(cfgVal.allowed_products) ? cfgVal.allowed_products : [];
      if (allowedList.length > 0) {
        const norm = (s: string) => s.toString().trim().toLowerCase();
        const allowedNorm = allowedList.map(norm);
        const matches =
          allowedNorm.includes(norm(productName)) ||
          allowedNorm.includes(norm(productId)) ||
          allowedNorm.includes(norm(String(product.ucode || "")));
        if (!matches) {
          console.log(`[hotmart-webhook] Produto fora da allowlist — ignorando: ${productId} / ${productName}`);
          await supabase.from("integration_logs").insert({
            integration: "hotmart",
            status: "skipped",
            message: `Produto fora da allowlist: ${productName || productId}`,
            operation_id: operationId,
          });
          return new Response("OK", {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "text/plain" },
          });
        }
      }
    }

    console.log(
      `[hotmart-webhook] amount source=${amountSource} ` +
      `value=${amountRaw} ${currency} → BRL ${amountBrl.toFixed(2)}`,
    );


    // === País do comprador / checkout (ISO-3166 alpha-2) ===
    // Hotmart Postback 2.0 pode mandar em buyer.address.country_iso,
    // buyer.address.country, purchase.checkout_country.iso ou purchase.origin.
    // Quando não vem, a moeda da transação é o melhor proxy (BRL = Brasil).
    const buyerAddress = (buyer as any).address || {};
    const rawCountry = String(
      buyerAddress.country_iso ||
      buyerAddress.country ||
      (purchase as any).checkout_country?.iso ||
      (purchase as any).checkout_country?.name ||
      (buyer as any).country_iso ||
      (buyer as any).country ||
      "",
    ).trim().toUpperCase();
    const COUNTRY_NAME_MAP: Record<string, string> = {
      BRASIL: "BR", BRAZIL: "BR", PORTUGAL: "PT",
      "UNITED STATES": "US", EUA: "US", ESPANHA: "ES", "UNITED KINGDOM": "GB",
    };
    const saleCountry =
      (rawCountry.length === 2 ? rawCountry : COUNTRY_NAME_MAP[rawCountry]) ||
      (currency === "BRL" ? "BR" : null);
    const countrySource = rawCountry ? "payload" : (currency === "BRL" ? "currency" : "unknown");

    // === Tracking / UTMs (padrão UTMfy) ===
    // Hotmart Postback 2.0 entrega tracking em purchase.tracking (source, source_sck, external_reference)
    // e às vezes utm_* dentro de purchase.origin ou como querystring no checkout_url.
    const tracking = purchase.tracking || {};
    const origin = purchase.origin || {};
    const checkoutUrl: string =
      purchase.checkout_url ||
      purchase.checkout_country?.checkout_url ||
      buyer.checkout_url ||
      "";


    // Parse UTMs vindos como query string em qualquer URL disponível
    const utmFromUrl: Record<string, string> = {};
    try {
      if (checkoutUrl && checkoutUrl.includes("?")) {
        const qs = new URLSearchParams(checkoutUrl.split("?")[1]);
        for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "sck", "src", "xcod"]) {
          const v = qs.get(k);
          if (v) utmFromUrl[k] = v;
        }
      }
    } catch (_) { /* ignore */ }

    // Se sck vier no formato "utm_source|utm_medium|utm_campaign|utm_content|utm_term" (padrão UTMfy),
    // desmembra em cada campo.
    const sckRaw: string =
      tracking.source_sck || tracking.sck || origin.sck || utmFromUrl.sck || "";
    const sckParts = sckRaw.includes("|") ? sckRaw.split("|") : [];

    const utm_source =
      origin.utm_source || tracking.utm_source || utmFromUrl.utm_source || tracking.source || sckParts[0] || null;
    const utm_medium =
      origin.utm_medium || tracking.utm_medium || utmFromUrl.utm_medium || sckParts[1] || null;
    const utm_campaign =
      origin.utm_campaign || tracking.utm_campaign || utmFromUrl.utm_campaign || sckParts[2] || null;
    const utm_content =
      origin.utm_content || tracking.utm_content || utmFromUrl.utm_content || sckParts[3] || null;
    const utm_term =
      origin.utm_term || tracking.utm_term || utmFromUrl.utm_term || sckParts[4] || null;
    const xcod =
      tracking.external_reference || origin.xcod || utmFromUrl.xcod || null;
    const src =
      tracking.src || origin.src || utmFromUrl.src || null;

    // Preço CHEIO da oferta (o que a Hotmart mostra em "Vendas Reembolsadas").
    // Prioridade: full_price (valor cheio da oferta parcelada) > offer.payment_mode_value > price.value.
    const fullPriceObj = purchase.full_price || {};
    const offerObj = purchase.offer || {};
    const grossValue = Number(
      fullPriceObj.value ??
        offerObj.payment_mode_value ??
        priceObj.value ??
        purchase.price_value ??
        purchase.value ??
        purchase.amount ??
        0,
    );
    const grossCurrency = String(
      fullPriceObj.currency_code || fullPriceObj.currency_value ||
      priceObj.currency_code || priceObj.currency_value || priceObj.currency || currency,
    ).toUpperCase();
    const grossBrl =
      grossValue > 0
        ? grossCurrency === "BRL"
          ? grossValue
          : grossCurrency === "USD"
            ? grossValue * usdToBrl
            : grossCurrency === "EUR"
              ? grossValue * EUR_TO_USD * usdToBrl
              : grossValue
        : 0;

    const rawTracking: any = {
      tracking,
      origin,
      checkout_url: checkoutUrl || null,
      gross_price: grossValue || null,
      gross_currency: grossCurrency || null,
      gross_price_brl: grossBrl ? Math.round(grossBrl * 100) / 100 : null,
      country: saleCountry,
      country_source: countrySource,
      parsed: { utm_source, utm_medium, utm_campaign, utm_content, utm_term, sck: sckRaw || null, xcod, src },

    };

    // === Enriquecimento via Sales History API (fallback quando webhook vem sem UTMs) ===
    // Dispara SEMPRE que faltar utm_campaign — Hotmart às vezes manda só um hash em `sck`
    // (ex: "d03855a1a...") que não é o formato UTMfy `source|medium|campaign|content|term`.
    let finalUtm = { utm_source, utm_medium, utm_campaign, utm_content, utm_term, xcod, src, sck: sckRaw || null };
    const sckLooksUsable = !!sckRaw && sckRaw.includes("|");
    const needsEnrich = !utm_campaign && !sckLooksUsable;
    if (needsEnrich && opSlug === "escola-do-dolar") {
      try {
        const enriched = await enrichHotmartTransaction(orderId, "escola");
        if (enriched) {
          rawTracking.enriched = enriched;
          finalUtm = mergeEnriched(finalUtm, enriched);
          console.log("[HOTMART-ENRICHED]", orderId, JSON.stringify(finalUtm));
        } else {
          console.log("[HOTMART-ENRICH-EMPTY]", orderId);
        }
      } catch (e: any) {
        console.warn("[HOTMART-ENRICH-FAIL]", orderId, e?.message);
      }
    }

    // === UTMfy external_code → IDs Meta (Escola do Dólar apenas) ===
    let metaFields: Record<string, string | null> = {};
    if (opSlug === "escola-do-dolar") {
      // UTMfy grava IDs no external_code (xcod); sck em Postback 2.0 é só um hash
      const utmfyInput = (finalUtm.xcod && finalUtm.xcod.includes(UTMFY_SEP))
        ? finalUtm.xcod
        : (finalUtm.sck && finalUtm.sck.includes(UTMFY_SEP)) ? finalUtm.sck : null;
      const parsedSck = parseUtmfyXcod(utmfyInput);
      if (parsedSck && parsedSck.campaign_id) {
        // Só populamos campos Meta quando temos um campaign_id numérico real (evita sujar orgânico)
        const names = await resolveMetaNames(supabase, operationId, parsedSck);
        metaFields = {
          meta_campaign_id: parsedSck.campaign_id,
          meta_adset_id: parsedSck.adset_id,
          meta_ad_id: parsedSck.ad_id,
          meta_placement: parsedSck.placement_name || parsedSck.placement_id,
          meta_campaign_name: names.campaign_name || parsedSck.campaign_name,
          meta_adset_name: names.adset_name || parsedSck.adset_name,
          meta_ad_name: names.ad_name || parsedSck.ad_name,
        };
        rawTracking.utmfy_parsed = parsedSck;
        console.log("[HOTMART-UTMFY]", orderId, JSON.stringify(metaFields));
      }
    }

    console.log("[HOTMART-TRACKING]", JSON.stringify({
      receipt: `hotmart_${orderId}`, op: opSlug, raw: rawTracking, backfill: url.searchParams.get("backfill") === "true",
    }));

    // Upsert into clickbank_audit (unified pipeline)
    const receipt = `hotmart_${orderId}`;
    const { error: insertError } = await supabase
      .from("clickbank_audit")
      .upsert(
        {
          receipt,
          date: orderDate,
          transaction_type: transactionType,
          amount_usd: Math.round(amountUsd * 100) / 100,
          amount_brl: Math.round(amountBrl * 100) / 100,
          product_name: productName,
          item_name: productId,
          vendor: "hotmart",
          affiliate,
          key_used: "HOTMART",
          operation_id: operationId,
          utm_source: finalUtm.utm_source,
          utm_medium: finalUtm.utm_medium,
          utm_campaign: finalUtm.utm_campaign,
          utm_content: finalUtm.utm_content,
          utm_term: finalUtm.utm_term,
          sck: finalUtm.sck,
          xcod: finalUtm.xcod,
          src: finalUtm.src,
          raw_tracking: rawTracking,
          buyer_email: (buyer.email || "").toString().toLowerCase().trim() || null,
          buyer_email_hash: (buyer.email
            ? Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(buyer.email.toString().toLowerCase().trim()))))
                .map(b => b.toString(16).padStart(2, "0")).join("")
            : null),
          buyer_name: (buyer.name || buyer.full_name || null),
          country: saleCountry,

          ...metaFields,
        },
        { onConflict: "receipt" }
      );

    if (insertError) {
      console.error("[hotmart-webhook] Insert error:", insertError);
      await supabase.from("integration_logs").insert({
        integration: "hotmart",
        status: "error",
        message: `Erro ao inserir: ${insertError.message}`,
        operation_id: operationId,
      });
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Mirror para sales_data (SOMENTE Escola do Dólar) ──────────────
    // Alimenta Pacing / Criativos / Meta Ads com a mesma venda, usando
    // utm_campaign/utm_content resolvidos via UTMfy → nomes reais Meta.
    // Não toca GTX e outras operações.
    if (opSlug === "escola-do-dolar" && operationId && transactionType === "SALE") {
      const salesOrderId = `hm_${orderId}`;
      const resolvedCampaign = (metaFields as any).meta_campaign_name || finalUtm.utm_campaign || null;
      const resolvedContent = (metaFields as any).meta_ad_name || finalUtm.utm_content || null;
      const { error: mirrorErr } = await supabase
        .from("sales_data")
        .upsert(
          {
            order_id: salesOrderId,
            country: saleCountry,

            date: orderDate,
            revenue: Math.round(amountBrl * 100) / 100,
            product_name: productName,
            utm_source: finalUtm.utm_source,
            utm_campaign: resolvedCampaign,
            utm_content: resolvedContent,
            utm_term: finalUtm.utm_term,
            status: "approved",
            store: "hotmart",
            operation_id: operationId,
          },
          { onConflict: "order_id" }
        );
      if (mirrorErr) {
        console.warn("[HOTMART-SALES-DATA-MIRROR-FAIL]", salesOrderId, mirrorErr.message);
      } else {
        console.log("[HOTMART-SALES-DATA-MIRROR-OK]", salesOrderId, resolvedCampaign);
        // Canal PARALELO: Web Push
        await mirrorSaleToWebPush({
          operation_id: operationId,
          order_id: salesOrderId,
          valor: Math.round(amountBrl * 100) / 100,
          currency: "BRL",
          produto: productName,
          canal: "hotmart",
          url: "/war-room",
          utm_campaign: resolvedCampaign ?? finalUtm.utm_campaign ?? null,
          sale_created_at: orderDateIso,
        });
      }
    }

    // ─── Estorno: marca a venda espelhada como reembolsada ─────────────
    // Sem isso a venda original continuava "approved" em sales_data e seguia
    // contando em Pacing / Criativos / faturamento mesmo após o reembolso.
    if (operationId && (transactionType === "RFND" || transactionType === "CGBK")) {
      const salesOrderId = `hm_${orderId}`;
      const { error: refundErr } = await supabase
        .from("sales_data")
        .update({ status: transactionType === "CGBK" ? "chargeback" : "refunded" })
        .eq("order_id", salesOrderId)
        .eq("operation_id", operationId);
      if (refundErr) {
        console.warn("[HOTMART-REFUND-STATUS-FAIL]", salesOrderId, refundErr.message);
      } else {
        console.log("[HOTMART-REFUND-STATUS-OK]", salesOrderId, transactionType);
      }
    }

    await supabase.from("integration_logs").insert({
      integration: "hotmart",
      status: "success",
      message: `${transactionType} ${receipt} | ${currency} ${amountRaw} → R$ ${amountBrl.toFixed(2)} | ${productName}`,
      records_processed: 1,
      operation_id: operationId,
    });

    console.log(`[hotmart-webhook] Processed ${transactionType}: ${receipt} (${currency} ${amountRaw})`);

    return new Response("OK", {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/plain" },
    });
  } catch (err: any) {
    console.error("[hotmart-webhook] Unexpected error:", err);
    await supabase.from("integration_logs").insert({
      integration: "hotmart",
      status: "error",
      message: `Erro inesperado: ${err.message}`,
    });
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Modo LOTE (usado pelo backfill): { batch: [{event, data}, ...] }
  try {
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const cloned = req.clone();
      const body = await cloned.json().catch(() => null);
      if (body && Array.isArray(body.batch)) {
        let ok = 0, skipped = 0, failed = 0;
        const samples: string[] = [];
        for (const ev of body.batch) {
          const sub = new Request(req.url, {
            method: "POST",
            headers: req.headers,
            body: JSON.stringify(ev),
          });
          try {
            const r = await handleRequest(sub);
            if (r.ok) ok++;
            else {
              const t = await r.text();
              if (t.includes("allowlist") || t.includes("skipped")) skipped++;
              else { failed++; if (samples.length < 5) samples.push(`${r.status}: ${t.slice(0, 150)}`); }
            }
          } catch (e) {
            failed++;
            if (samples.length < 5) samples.push(String((e as Error).message).slice(0, 150));
          }
        }
        return new Response(JSON.stringify({ batch: true, ok, skipped, failed, samples }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
  } catch { /* segue fluxo normal */ }

  return handleRequest(req);
});

// =====================================================================
// Hotmart Sales History enrichment helpers
// =====================================================================
const HOTMART_OAUTH_URL = "https://api-sec-vlc.hotmart.com/security/oauth/token";
const HOTMART_SALES_HISTORY_URL = "https://developers.hotmart.com/payments/api/v1/sales/history";

const tokenCache: Record<string, { token: string; exp: number }> = {};

async function getHotmartToken(scope: "escola"): Promise<string | null> {
  const now = Date.now();
  const cached = tokenCache[scope];
  if (cached && cached.exp > now + 30_000) return cached.token;

  const clientId = Deno.env.get(scope === "escola" ? "HOTMART_ESCOLA_CLIENT_ID" : "");
  const clientSecret = Deno.env.get(scope === "escola" ? "HOTMART_ESCOLA_CLIENT_SECRET" : "");
  if (!clientId || !clientSecret) return null;

  const basic = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch(`${HOTMART_OAUTH_URL}?grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}` },
  });
  if (!res.ok) {
    console.warn("[HOTMART-OAUTH-FAIL]", res.status, await res.text());
    return null;
  }
  const j = await res.json();
  const token = j.access_token as string;
  const expiresIn = Number(j.expires_in || 3600);
  tokenCache[scope] = { token, exp: now + expiresIn * 1000 };
  return token;
}

export async function enrichHotmartTransaction(transactionId: string, scope: "escola") {
  const token = await getHotmartToken(scope);
  if (!token) return null;
  const url = `${HOTMART_SALES_HISTORY_URL}?transaction=${encodeURIComponent(transactionId)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    console.warn("[HOTMART-SALES-HISTORY-FAIL]", transactionId, res.status);
    return null;
  }
  const j = await res.json();
  const item = j?.items?.[0] || j?.data?.[0] || j;
  const tracking = item?.purchase?.tracking || item?.tracking || {};
  const sck: string = tracking.source_sck || tracking.sck || "";
  const parts = sck.includes("|") ? sck.split("|") : [];
  const externalCode: string = tracking.external_code || tracking.external_reference || "";
  const fromExt = parseHotmartExternalCode(externalCode);
  return {
    utm_source: tracking.utm_source || fromExt?.utm_source || tracking.source || parts[0] || null,
    utm_medium: tracking.utm_medium || fromExt?.utm_medium || parts[1] || null,
    utm_campaign: tracking.utm_campaign || fromExt?.utm_campaign || parts[2] || null,
    utm_content: tracking.utm_content || fromExt?.utm_content || parts[3] || null,
    utm_term: tracking.utm_term || fromExt?.utm_term || parts[4] || null,
    sck: sck || null,
    xcod: externalCode || tracking.external_reference || null,
    src: tracking.src || null,
    _raw: item,
  };
}

/**
 * Parse Hotmart's `tracking.external_code` — dois formatos observados:
 * 1) Meta multinível (com `|`): `<campaign_id>hQwK21wXxR<campaign_name>|<adset_id>hQwK21wXxR<adset_name>|<ad_id>hQwK21wXxR<ad_name>|<placement_id>hQwK21wXxR<placement_name>`
 * 2) UTMfy flat (só `hQwK21wXxR`): `source hQwK21wXxR medium hQwK21wXxR campaign hQwK21wXxR content hQwK21wXxR term`
 */
export function parseHotmartExternalCode(ext: string) {
  if (!ext || typeof ext !== "string") return null;
  const SEP = "hQwK21wXxR";
  if (ext.includes("|")) {
    const groups = ext.split("|").map((p) => {
      const [id, ...rest] = p.split(SEP);
      return { id: id || null, name: rest.join(SEP) || null };
    });
    return {
      utm_source: "meta",
      utm_campaign: groups[0]?.name || groups[0]?.id || null,
      utm_medium: groups[1]?.name || null,
      utm_content: groups[2]?.name || null,
      utm_term: groups[3]?.name || null,
    };
  }
  if (ext.includes(SEP)) {
    const p = ext.split(SEP);
    return {
      utm_source: p[0] || null,
      utm_medium: p[1] || null,
      utm_campaign: p[2] || null,
      utm_content: p[3] || null,
      utm_term: p[4] || null,
    };
  }
  return null;
}

export function mergeEnriched<T extends Record<string, any>>(base: T, enriched: any): T {
  const out: any = { ...base };
  for (const k of ["utm_source","utm_medium","utm_campaign","utm_content","utm_term","sck","xcod","src"]) {
    if (!out[k] && enriched?.[k]) out[k] = enriched[k];
  }
  return out;
}
