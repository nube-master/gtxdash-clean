/**
 * COD Webhook — Shphere
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { mirrorSaleToWebPush } from "../_shared/push-mirror.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-shphere-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Helpers ────────────────────────────────────────────────────────────

// FAHTO: push de venda COD vem SÓ do RedTrack (webhook não notifica)
const opSlugCache = new Map<string, string | null>();
async function isWebhookPushSuppressed(
  supabase: any,
  operationId: string | null,
): Promise<boolean> {
  if (!operationId) return false;
  if (!opSlugCache.has(operationId)) {
    const { data } = await supabase.from("operations").select("slug").eq("id", operationId).maybeSingle();
    opSlugCache.set(operationId, (data?.slug as string) ?? null);
  }
  return opSlugCache.get(operationId) === "fahto-media";
}

function getBrasiliaDate(iso?: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function pick<T = unknown>(obj: Record<string, unknown>, keys: string[]): T | undefined {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && v !== "") return v as T;
  }
  return undefined;
}

function mapStatus(raw: string | undefined): string {
  if (!raw) return "pending";
  const s = String(raw).toLowerCase().trim();
  if (s.includes("comissao.paga") || s.includes("comissão.paga")) return "paid";
  if (s.includes("comissao.aprovad") || s.includes("comissão.aprovad")) return "commission_approved";
  if (s.includes("pedido.entreg")) return "delivered";
  if (s.includes("pedido.cancel")) return "canceled";
  if (s.includes("pedido.recus") || s.includes("pedido.rejeit")) return "refused";
  if (s.includes("pedido.expir")) return "expired";
  if (s.includes("pedido.cria")) return "pending";
  if (s.includes("pago") || s === "paid" || s.includes("commission_paid") || s.includes("comissão paga")) return "paid";
  if (s.includes("aprovad") || s === "approved" || s.includes("commission_approved")) return "commission_approved";
  if (s.includes("entreg") || s === "delivered") return "delivered";
  if (s.includes("cancel")) return "canceled";
  if (s.includes("recus") || s.includes("refused") || s.includes("rejeit")) return "refused";
  if (s.includes("expir")) return "expired";
  if (s.includes("cria") || s === "created" || s === "order_created" || s === "pending") return "pending";
  return "pending";
}

function toNumericOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

async function convertToBRL(value: number | null, currency: string, supabase: any): Promise<number | null> {
  if (value === null) return null;
  const curr = currency.toUpperCase();
  if (curr === "BRL") return value;
  
  // Buscar a taxa mais recente do cache
  const { data, error } = await supabase
    .from("exchange_rates_cache")
    .select("rate")
    .eq("base_currency", curr)
    .eq("target_currency", "BRL")
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    console.warn(`[convertToBRL] Taxa não encontrada para ${curr}. Usando fallback.`);
    const fallbackMap: Record<string, number> = { EUR: 6.04, PLN: 1.42, RON: 1.21, USD: 5.20 };
    return value * (fallbackMap[curr] ?? 1);
  }
  
  return Number((value * data.rate).toFixed(4));
}

// ── Handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── Roteamento por URL (por operação) ────────────────────────────
  // .../cod-webhook-shphere/<operation_slug>/sphere/<endpoint_slug>
  const reqUrl = new URL(req.url);
  const segments = reqUrl.pathname.split("/").filter(Boolean);
  const fnIdx = segments.findIndex((s) => s === "cod-webhook-shphere");
  const pathParts = fnIdx >= 0 ? segments.slice(fnIdx + 1) : [];
  const endpointSlug = pathParts.length > 0 ? pathParts[pathParts.length - 1] : null;
  const pathOperationSlug = pathParts.length >= 2 ? pathParts[0] : null;

  let routedOperationId: string | null = null;

  if (endpointSlug) {
    const { data: hook } = await supabase
      .from("operation_webhooks")
      .select("operation_id, secret_token, active, operations!inner(slug, status)")
      .eq("endpoint_slug", endpointSlug)
      .eq("platform", "sphere")
      .maybeSingle();

    if (!hook || hook.active === false) {
      return new Response(JSON.stringify({ error: "unknown_endpoint" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const hookOp = (hook as unknown as { operations?: { slug?: string; status?: string } }).operations;
    const opStatus = String(hookOp?.status || "");
    if (opStatus && !["active", "trial"].includes(opStatus)) {
      return new Response(JSON.stringify({ error: "operation_inactive", status: opStatus }), {
        status: 410,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const hookSlug = hookOp?.slug;
    if (pathOperationSlug && hookSlug && pathOperationSlug !== hookSlug) {
      return new Response(JSON.stringify({ error: "endpoint_operation_mismatch" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sig =
      req.headers.get("x-shphere-signature") ||
      req.headers.get("x-signature") ||
      req.headers.get("x-webhook-secret") ||
      reqUrl.searchParams.get("secret") ||
      "";
    if (sig !== hook.secret_token) {
      return new Response(JSON.stringify({ error: "invalid_signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    routedOperationId = hook.operation_id;
  } else {
    const expectedSecret = Deno.env.get("SHPHERE_WEBHOOK_SECRET");
    if (expectedSecret) {
      const sig = req.headers.get("x-shphere-signature") || req.headers.get("x-signature") || "";
      if (sig !== expectedSecret) {
        return new Response(JSON.stringify({ error: "invalid_signature" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
  }


  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const pedido = ((payload as Record<string, unknown>).pedido as Record<string, unknown>) ?? {};
  const comissao = ((payload as Record<string, unknown>).comissao as Record<string, unknown>) ?? {};
  const afiliado = ((payload as Record<string, unknown>).afiliado as Record<string, unknown>) ?? {};
  const body: Record<string, unknown> = {
    ...(payload as Record<string, unknown>),
    ...((payload as Record<string, unknown>).order as Record<string, unknown> ?? {}),
    ...((payload as Record<string, unknown>).data as Record<string, unknown> ?? {}),
    ...pedido,
  };

  const externalOrderId = String(
    pick<string | number>(body, ["external_order_id", "order_id", "orderId", "id", "external_id"]) ?? ""
  ).trim();

  if (!externalOrderId) {
    console.error("[cod-webhook-shphere] missing external_order_id", { payload });
    return new Response(JSON.stringify({ error: "missing_order_id" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = reqUrl;
  // Se a URL identifica a operação (endpoint dedicado), ela SEMPRE manda — nunca o body.
  let operationId = routedOperationId
    || url.searchParams.get("operation_id")
    || pick<string>(body, ["operation_id", "operationId"]);


  if (!operationId) {
    const affiliateCode = pick<string>(afiliado, ["codigo", "code", "nickname"]);
    const programaId = String(pick<string>(afiliado, ["programa_id", "programaId"]) ?? "").toLowerCase();
    
    if (affiliateCode) {
      const { data: mapping } = await supabase
        .from('affiliate_mappings')
        .select('operation_id')
        .eq('nickname', affiliateCode)
        .maybeSingle();
      
      // FIX 2026-08-23: Se for um afiliado compartilhado (ex: guilhermepirespadilha),
      // precisamos validar o programa_id para evitar vazamento cross-op.
      // FAHTO deve processar apenas programas de ofertas ativas nela.
      if (mapping?.operation_id) {
        operationId = mapping.operation_id;
        
        // Se cair em FAHTO mas o programa for 'visao-tcheca' ou 'visao-italia', 
        // sabemos que é da operação GTX (0b758a2b-1b92-4769-b47b-416c567e320d).
        if (operationId === '8707b3f8-ab41-4a63-902c-9ab97fe50c8a') {
          if (programaId.includes('visao-tcheca') || programaId.includes('visao-italia')) {
            console.log(`[cod-webhook-shphere] Re-routing shared affiliate ${affiliateCode} from FAHTO to GTX via program ${programaId}`);
            operationId = '0b758a2b-1b92-4769-b47b-416c567e320d';
          }
        }
      }
    }
  }

  if (!operationId) {
    const accountId = pick<string>(body, ["account_id", "accountId", "account_id_meta"]);
    if (accountId) {
      const { data } = await supabase
        .from('meta_ad_accounts')
        .select('operation_id')
        .eq('account_id', accountId)
        .maybeSingle();
      operationId = data?.operation_id;
    }
  }

  // AUTO-RESOLVER AFILIADO POR REGRA (Preventivo)
  if (!operationId) {
    const affiliateNickname = pick<string>(afiliado, ["codigo", "code", "nickname", "username", "affiliate_username"]);
    if (affiliateNickname) {
      // Regra A: Se já houve pedido bem sucedido desse afiliado no passado
      const { data: pastOrder } = await supabase
        .from('cod_orders')
        .select('operation_id')
        .eq('platform', 'shphere')
        .contains('raw_payload', { afiliado: { nickname: affiliateNickname } })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (pastOrder?.operation_id) {
        operationId = pastOrder.operation_id;
        console.log(`[cod-webhook-shphere] Auto-resolved operation_id ${operationId} for affiliate ${affiliateNickname} via history`);
      }
    }
  }

  if (!operationId) {
    await supabase.from('orphan_orders').insert({
      webhook_source: 'cod-webhook-shphere',
      raw_payload: payload,
      headers: Object.fromEntries(req.headers.entries()),
      reason: 'operation_id_not_resolved_and_no_account_lookup'
    });
    return new Response(JSON.stringify({ status: 'orphan' }), { 
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const eventRaw = String(
    pick<string>(payload as Record<string, unknown>, ["evento"]) ??
    pick<string>(body, ["event", "event_type", "eventType", "type", "status"]) ?? ""
  );
  const status = mapStatus(eventRaw);

  const orderDateRaw =
    pick<string>(body, ["order_date", "orderDate", "criado_em", "created_at", "createdAt", "date"]) ??
    pick<string>(payload as Record<string, unknown>, ["data_evento"]);
  const orderDate = getBrasiliaDate(orderDateRaw ?? null);

  const deliveryDateRaw = pick<string>(body, ["delivery_date", "deliveredAt", "delivered_at", "entregue_em"]);
  const paymentDateRaw = pick<string>(body, ["payment_date", "paidAt", "paid_at", "commission_paid_at", "pago_em"]);

  const orderValue = toNumericOrNull(
    pick(body, ["order_value", "orderValue", "valor", "amount", "total", "value"])
  );
  const commissionValue = toNumericOrNull(
    pick(comissao, ["valor", "amount", "value"]) ??
    pick(body, ["commission_value", "commissionValue", "commission", "payout", "commission_amount"])
  );
  const commissionCurrency = "EUR"; // Forçando EUR conforme confirmação do Gabriel (vendas FAHTO)


  // FX Conversão
  const commissionValueBRL = await convertToBRL(commissionValue, commissionCurrency, supabase);
  const orderValueBRL = await convertToBRL(orderValue, commissionCurrency, supabase);

  const productKey = pick<string>(body, ["product_key", "productKey", "produto", "product", "product_id", "sku"]) ?? null;
  // Sphere manda "programa_id" como slug (ex.: wl-tcheca-cod). Regex cobre variações de grafia.
  const PROGRAMA_TO_PAIS: Array<[RegExp, string]> = [
    [/tchec|czech|(^|[-_ ])cz([-_ ]|$)/, "CZ"],
    [/polon|poland|polska|(^|[-_ ])pl([-_ ]|$)/, "PL"],
    [/romen|romani|(^|[-_ ])ro([-_ ]|$)/, "RO"],
    [/hungr|hungar|(^|[-_ ])hu([-_ ]|$)/, "HU"],
    [/eslovaq|slovak|(^|[-_ ])sk([-_ ]|$)/, "SK"],
    [/bulgar|(^|[-_ ])bg([-_ ]|$)/, "BG"],
  ];
  const afiliadoObj = (body?.afiliado ?? body?.pedido?.afiliado ?? {}) as Record<string, unknown>;
  const programaId = String(pick<string>(afiliadoObj, ["programa_id", "programaId"]) ?? "").toLowerCase();
  let inferredCountry: string | null = null;
  for (const [pattern, code] of PROGRAMA_TO_PAIS) {
    if (pattern.test(programaId)) { inferredCountry = code; break; }
  }
  const customerCountry = pick<string>(body, ["customer_country", "pais", "country", "shipping_country"]) ?? inferredCountry;

  // Produto: a Sphere manda "Pedido Manual" (genérico) em boa parte dos pedidos.
  // Nesse caso, usar o programa como identificação da oferta para não perder a separação.
  const GENERIC_PRODUCT = /^\s*(pedido manual|manual order|n\/a|-)?\s*$/i;
  const rawProductName = pick<string>(body, ["product_name", "produto", "product"]) ?? null;
  const productName = rawProductName && !GENERIC_PRODUCT.test(rawProductName)
    ? rawProductName
    : (programaId ? programaId : rawProductName);


  // utm_campaign da venda (para o push): chain determinística + fallback RedTrack por proximidade
  const pedidoObj = (body?.pedido ?? {}) as Record<string, unknown>;
  let saleUtmCampaign =
    pick<string>(body, ["utm_campaign", "utmCampaign", "sub6", "sub4", "campanha", "campaign", "campaign_name"]) ??
    pick<string>(pedidoObj, ["utm_campaign", "utmCampaign", "sub6", "sub4", "campanha", "campaign", "campaign_name"]) ??
    pick<string>(payload as Record<string, unknown>, ["utm_campaign", "sub6", "sub4", "campanha"]) ??
    null;

  // Fallback: purchase RedTrack da MESMA operação dentro de ±10min do pedido (mesmo critério do War Room)
  if (!saleUtmCampaign) {
    try {
      const refIso = new Date(
        pick<string>(body, ["criado_em", "created_at", "createdAt"]) ??
          pick<string>(pedidoObj, ["criado_em", "created_at", "createdAt"]) ??
          new Date().toISOString(),
      );
      const from = new Date(refIso.getTime() - 10 * 60 * 1000).toISOString();
      const to = new Date(refIso.getTime() + 10 * 60 * 1000).toISOString();
      const { data: rt } = await supabase
        .from("redtrack_events")
        .select("utm_campaign, occurred_at")
        .eq("operation_id", operationId)
        .eq("event_type", "purchase")
        .gte("occurred_at", from)
        .lte("occurred_at", to)
        .not("utm_campaign", "is", null)
        .order("occurred_at", { ascending: false })
        .limit(1);
      if (rt?.[0]?.utm_campaign) saleUtmCampaign = String(rt[0].utm_campaign);
    } catch (_e) {
      // fallback nunca bloqueia o webhook
    }
  }



  const row: Record<string, unknown> = {
    operation_id: operationId,
    platform: "shphere",
    external_order_id: externalOrderId,
    product_key: productKey,
    order_date: orderDate,
    delivery_date: deliveryDateRaw ? getBrasiliaDate(deliveryDateRaw) : (isDeliveredish(status) ? getBrasiliaDate() : null),
    payment_date: paymentDateRaw ? getBrasiliaDate(paymentDateRaw) : (status === "paid" ? getBrasiliaDate() : null),
    // approved_at: carimbado quando a comissão é aprovada OU paga (paga é estágio posterior
    // à aprovação na Sphere; se o evento de aprovação não chegou, o de pagamento fecha a lacuna).
    approved_at: isCommissionApproved(status) ? new Date().toISOString() : null,
    status,

    order_value: orderValue,
    order_value_brl: orderValueBRL,
    commission_value: commissionValue,
    commission_value_brl: commissionValueBRL,
    commission_currency: commissionCurrency,
    customer_country: customerCountry,
    raw_payload: payload,
    received_via: "webhook",
    webhook_endpoint_slug: endpointSlug ?? null,

    updated_at: new Date().toISOString(),
    // Campos adicionais solicitados pelo FIX 3
    buyer_email: pick<string>(body, ["buyer_email", "email", "customer_email"]),
    product_name: productName,
    program_id: programaId || null,
    country_code: customerCountry ?? null,

  };

  const { data: existing } = await supabase
    .from("cod_orders")
    .select("id, created_at, status, approved_at")
    .eq("platform", "shphere")
    .eq("external_order_id", externalOrderId)
    .maybeSingle();

  if (existing) {
    const patch: Record<string, unknown> = {
      status,
      raw_payload: payload,
      updated_at: new Date().toISOString(),
    };
    // Nunca sobrescreve um approved_at já existente (mantém a data original da aprovação)
    if (isCommissionApproved(status) && !existing.approved_at) {
      patch.approved_at = row.approved_at ?? new Date().toISOString();
    }
    if (row.delivery_date) patch.delivery_date = row.delivery_date;
    if (row.payment_date) patch.payment_date = row.payment_date;

    if (orderValue !== null) patch.order_value = orderValue;
    if (orderValueBRL !== null) patch.order_value_brl = orderValueBRL;
    if (commissionValue !== null) patch.commission_value = commissionValue;
    if (commissionValueBRL !== null) patch.commission_value_brl = commissionValueBRL;
    if (commissionCurrency) patch.commission_currency = commissionCurrency;
    if (productKey) patch.product_key = productKey;
    if (customerCountry) patch.customer_country = customerCountry;
    if (row.buyer_email) patch.buyer_email = row.buyer_email;
    if (row.product_name) patch.product_name = row.product_name;
    
    // FIX 1: Garantimos que created_at NUNCA está no patch do UPDATE
    delete patch.created_at;

    await supabase.from("cod_orders").update(patch).eq("id", existing.id);

    // Canal PARALELO: Web Push — só em mudança relevante de status
    // FAHTO: push de venda vem SÓ do RedTrack (evita duplicidade webhook + RedTrack)
    const suppressWebhookPush = await isWebhookPushSuppressed(supabase, operationId);
    if (!suppressWebhookPush && existing.status !== status && ["pending", "delivered", "commission_approved", "paid"].includes(status)) {
      await mirrorSaleToWebPush({
        operation_id: operationId,
        order_id: externalOrderId,
        valor: commissionValueBRL ?? commissionValue,
        currency: commissionValueBRL !== null ? "BRL" : commissionCurrency,
        produto: (row.product_name as string) ?? productKey ?? null,
        afiliado: pick<string>(afiliado, ["codigo", "code", "nickname"]) ?? null,
        canal: "cod",
        url: "/dashboard-cod",
        utm_campaign: saleUtmCampaign,
        sale_created_at: String(row.created_at ?? existing.created_at),
      });
    }
  } else {
    // FIX 2: No INSERT inicial, forçamos o created_at da Sphere
    const sphereCreatedAt = pick<string>(body, ["criado_em", "created_at", "createdAt"]);
    if (sphereCreatedAt) {
      row.created_at = new Date(sphereCreatedAt).toISOString();
    }
    
    await supabase.from("cod_orders").insert(row);

    // Canal PARALELO: Web Push (fire-and-forget, nunca bloqueia o webhook)
    // FAHTO: suprimido — push vem só do RedTrack
    if (!(await isWebhookPushSuppressed(supabase, operationId))) {
      await mirrorSaleToWebPush({
        operation_id: operationId,
        order_id: externalOrderId,
        valor: commissionValueBRL ?? commissionValue,
        currency: commissionValueBRL !== null ? "BRL" : commissionCurrency,
        produto: (row.product_name as string) ?? productKey ?? null,
        afiliado: pick<string>(afiliado, ["codigo", "code", "nickname"]) ?? null,
        canal: "cod",
        url: "/dashboard-cod",
        utm_campaign: saleUtmCampaign,
        sale_created_at: String(row.created_at ?? new Date().toISOString()),
      });
    }
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

function isDeliveredish(status: string): boolean {
  return ["delivered", "paid", "commission_approved"].includes(status);
}

// Comissão aprovada OU paga: "paga" é o estágio seguinte à aprovação na Sphere,
// então também carimba approved_at (evita pedidos aprovados ficarem fora do faturamento).
function isCommissionApproved(status: string): boolean {
  return ["commission_approved", "paid"].includes(status);
}
