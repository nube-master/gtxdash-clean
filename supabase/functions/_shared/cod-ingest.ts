/**
 * Núcleo compartilhado de ingestão COD.
 * Usado por cod-webhook-shphere e pelos webhooks de novas plataformas COD.
 * Mantém: parser defensivo, resolução de tenant, antileak (trigger no banco),
 * conversão FX e push-mirror de venda aprovada.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { mirrorSaleToWebPush } from "./push-mirror.ts";

export const codCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-shphere-signature, x-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Cache de slug por operation_id (vive enquanto a instância da function estiver quente)
const opSlugCache = new Map<string, string | null>();

/**
 * FAHTO: push de venda COD passa a vir SÓ do RedTrack.
 * O webhook continua gravando o pedido, mas não dispara push imediato
 * (evita notificação duplicada webhook + RedTrack da mesma venda).
 */
async function isWebhookPushSuppressed(
  supabase: ReturnType<typeof createClient>,
  operationId: string | null,
): Promise<boolean> {
  if (!operationId) return false;
  if (!opSlugCache.has(operationId)) {
    const { data } = await supabase
      .from("operations")
      .select("slug")
      .eq("id", operationId)
      .maybeSingle();
    opSlugCache.set(operationId, (data?.slug as string) ?? null);
  }
  return opSlugCache.get(operationId) === "fahto-media";
}

export function getBrasiliaDate(iso?: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function pick<T = unknown>(obj: Record<string, unknown>, keys: string[]): T | undefined {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && v !== "") return v as T;
  }
  return undefined;
}

export function isCommissionApproved(status: string): boolean {
  return ["commission_approved", "paid"].includes(status);
}

export function mapStatus(raw: string | undefined): string {
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

export function toNumericOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export async function convertToBRL(
  value: number | null,
  currency: string,
  supabase: any,
): Promise<number | null> {
  if (value === null) return null;
  const curr = (currency || "BRL").toUpperCase();
  if (curr === "BRL") return value;

  const { data, error } = await supabase
    .from("exchange_rates_cache")
    .select("rate")
    .eq("base_currency", curr)
    .eq("target_currency", "BRL")
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    const fallbackMap: Record<string, number> = { EUR: 6.04, PLN: 1.42, RON: 1.21, USD: 5.2 };
    return value * (fallbackMap[curr] ?? 1);
  }
  return Number((value * data.rate).toFixed(4));
}

export function isDeliveredish(status: string): boolean {
  return ["delivered", "paid", "commission_approved"].includes(status);
}

export interface CodWebhookConfig {
  /** Valor gravado em cod_orders.platform */
  platform: string;
  /** Valor gravado em cod_orders.source (default = platform) */
  source?: string;
  /** Nome do secret opcional para validar assinatura */
  secretEnv?: string;
  /** Moeda assumida quando o payload não traz moeda */
  defaultCurrency?: string;
  /** url do deep-link do push */
  pushUrl?: string;
  /** Quando definido, o tenant é fixo e nenhuma resolução por afiliado é feita */
  forcedOperationId?: string;
  /** Slug do endpoint (operation_webhooks) por onde o pedido chegou */
  endpointSlug?: string | null;

}

export async function handleCodWebhook(req: Request, cfg: CodWebhookConfig): Promise<Response> {
  const platform = cfg.platform;
  const source = cfg.source ?? cfg.platform;
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...codCorsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response("ok", { headers: codCorsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const expectedSecret = cfg.secretEnv ? Deno.env.get(cfg.secretEnv) : undefined;
  if (expectedSecret) {
    const sig = req.headers.get("x-shphere-signature") || req.headers.get("x-signature") || "";
    if (sig !== expectedSecret) return json({ error: "invalid_signature" }, 401);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const dataObj = ((payload as Record<string, unknown>).data as Record<string, unknown>) ?? {};
  const pedido = ((payload as Record<string, unknown>).pedido as Record<string, unknown>) ?? {};
  const comissao =
    (((payload as Record<string, unknown>).comissao as Record<string, unknown>) ??
      (dataObj.commission as Record<string, unknown>) ??
      ((payload as Record<string, unknown>).commission as Record<string, unknown>) ??
      {}) as Record<string, unknown>;
  const attribution = ((dataObj.attribution as Record<string, unknown>) ??
    ((payload as Record<string, unknown>).attribution as Record<string, unknown>) ??
    {}) as Record<string, unknown>;
  const afiliado = ((payload as Record<string, unknown>).afiliado as Record<string, unknown>) ?? {};
  const body: Record<string, unknown> = {
    ...(payload as Record<string, unknown>),
    ...(((payload as Record<string, unknown>).order as Record<string, unknown>) ?? {}),
    ...dataObj,
    ...pedido,
  };


  const externalOrderId = String(
    pick<string | number>(body, ["external_order_id", "order_id", "orderId", "id", "external_id"]) ?? "",
  ).trim();

  if (!externalOrderId) {
    console.error(`[cod-webhook-${platform}] missing external_order_id`);
    return json({ error: "missing_order_id" }, 400);
  }

  const url = new URL(req.url);
  let operationId = cfg.forcedOperationId ||
    url.searchParams.get("operation_id") ||
    pick<string>(body, ["operation_id", "operationId"]);

  const affiliateCode = pick<string>(afiliado, ["codigo", "code", "nickname", "username", "affiliate_username"]);
  const programaIdRaw = String(pick<string>(afiliado, ["programa_id", "programaId"]) ?? "").toLowerCase();

  if (!operationId && affiliateCode) {
    // 1) mapping estrito por afiliado + programa
    const { data: strict } = await supabase
      .from("affiliate_operation_mapping")
      .select("operation_id")
      .eq("affiliate_id", affiliateCode)
      .eq("program_id", programaIdRaw)
      .maybeSingle();
    if (strict?.operation_id) operationId = strict.operation_id;

    // 2) fallback legado por nickname
    if (!operationId) {
      const { data: mapping } = await supabase
        .from("affiliate_mappings")
        .select("operation_id")
        .eq("nickname", affiliateCode)
        .maybeSingle();
      if (mapping?.operation_id) operationId = mapping.operation_id;
    }
  }

  if (!operationId) {
    const accountId = pick<string>(body, ["account_id", "accountId", "account_id_meta"]);
    if (accountId) {
      const { data } = await supabase
        .from("meta_ad_accounts")
        .select("operation_id")
        .eq("account_id", accountId)
        .maybeSingle();
      operationId = data?.operation_id;
    }
  }

  if (!operationId && affiliateCode) {
    const { data: pastOrder } = await supabase
      .from("cod_orders")
      .select("operation_id")
      .eq("platform", platform)
      .contains("raw_payload", { afiliado: { nickname: affiliateCode } })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (pastOrder?.operation_id) operationId = pastOrder.operation_id;
  }

  if (!operationId) {
    await supabase.from("orphan_orders").insert({
      webhook_source: `cod-webhook-${platform}`,
      raw_payload: payload,
      headers: Object.fromEntries(req.headers.entries()),
      reason: "operation_id_not_resolved_and_no_account_lookup",
    });
    return json({ status: "orphan" });
  }

  const eventRaw = String(
    pick<string>(payload as Record<string, unknown>, ["evento"]) ??
      pick<string>(body, ["event", "event_type", "eventType", "type", "status"]) ?? "",
  );
  const status = mapStatus(eventRaw);

  // IMPORTANTE: plataformas como a Fahto reenviam eventos antigos (replay/backfill).
  // Sem usar a data do evento (`occurred_at`), o pedido entra como "gerado hoje" e infla o dia.
  const orderDateRaw =
    pick<string>(body, ["order_date", "orderDate", "criado_em", "created_at", "createdAt", "date"]) ??
    pick<string>(payload as Record<string, unknown>, ["data_evento"]) ??
    pick<string>(payload as Record<string, unknown>, ["occurred_at", "occurredAt", "timestamp"]);
  const orderDate = getBrasiliaDate(orderDateRaw ?? null);

  const deliveryDateRaw = pick<string>(body, ["delivery_date", "deliveredAt", "delivered_at", "entregue_em"]);
  const paymentDateRaw = pick<string>(body, ["payment_date", "paidAt", "paid_at", "commission_paid_at", "pago_em"]);

  const orderValue = toNumericOrNull(pick(body, ["order_value", "orderValue", "valor", "amount", "total", "value"]));
  const commissionValue = toNumericOrNull(
    pick(comissao, ["valor", "amount", "value"]) ??
      pick(body, ["commission_value", "commissionValue", "commission", "payout", "commission_amount"]),
  );
  const commissionCurrency = (
    pick<string>(comissao, ["moeda", "currency"]) ??
      pick<string>(body, ["commission_currency"]) ??
      pick<string>(body, ["currency", "moeda"]) ??
      cfg.defaultCurrency ?? "EUR"
  ).toUpperCase();
  // Moeda do pedido pode diferir da moeda da comissão (ex.: pedido PLN / comissão EUR)
  const orderCurrency = (
    pick<string>(body, ["order_currency", "currency", "moeda"]) ??
      commissionCurrency
  ).toUpperCase();

  const commissionValueBRL = await convertToBRL(commissionValue, commissionCurrency, supabase);
  const orderValueBRL = await convertToBRL(orderValue, orderCurrency, supabase);


  const productKey = pick<string>(body, ["product_key", "productKey", "produto", "product", "product_id", "sku", "offer"]) ?? null;
  const PROGRAMA_TO_PAIS: Record<string, string> = {
    polonia: "PL", romenia: "RO", hungria: "HU", republica: "CZ", eslovaquia: "SK", bulgaria: "BG",
  };
  let inferredCountry: string | null = null;
  for (const key of Object.keys(PROGRAMA_TO_PAIS)) {
    if (programaIdRaw.includes(key)) { inferredCountry = PROGRAMA_TO_PAIS[key]; break; }
  }
  const customerCountry = pick<string>(body, ["customer_country", "pais", "country", "shipping_country"]) ?? inferredCountry;

  const pedidoObj = ((body?.pedido as Record<string, unknown>) ?? {}) as Record<string, unknown>;
  let saleUtmCampaign =
    pick<string>(attribution, ["utm_campaign", "utmCampaign", "campaign"]) ??
    pick<string>(body, ["utm_campaign", "utmCampaign", "sub6", "sub4", "campanha", "campaign", "campaign_name"]) ??
    pick<string>(pedidoObj, ["utm_campaign", "utmCampaign", "sub6", "sub4", "campanha", "campaign", "campaign_name"]) ??
    pick<string>(payload as Record<string, unknown>, ["utm_campaign", "sub6", "sub4", "campanha"]) ??
    null;


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
    } catch (_e) { /* fallback nunca bloqueia */ }
  }

  const row: Record<string, unknown> = {
    operation_id: operationId,
    platform,
    source,
    external_order_id: externalOrderId,
    product_key: productKey,
    order_date: orderDate,
    delivery_date: deliveryDateRaw ? getBrasiliaDate(deliveryDateRaw) : (isDeliveredish(status) ? getBrasiliaDate() : null),
    payment_date: paymentDateRaw ? getBrasiliaDate(paymentDateRaw) : (status === "paid" ? getBrasiliaDate() : null),
    // approved_at: carimbado quando a comissão é aprovada OU paga (paga vem depois da
    // aprovação; se o evento de aprovação não chegar, o de pagamento fecha a lacuna).
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
    webhook_endpoint_slug: cfg.endpointSlug ?? null,

    updated_at: new Date().toISOString(),
    buyer_email: pick<string>(body, ["buyer_email", "email", "customer_email"]),
    product_name: pick<string>(body, ["product_name", "produto", "product", "offer"]),
  };

  const { data: existing } = await supabase
    .from("cod_orders")
    .select("id, created_at, status, approved_at")
    .eq("platform", platform)
    .eq("external_order_id", externalOrderId)
    .maybeSingle();

  const pushUrl = cfg.pushUrl ?? "/dashboard-cod";

  // FAHTO: push de venda vem SÓ do RedTrack — webhook não dispara (evita duplicidade).
  // Ingestão do pedido continua normal; apenas o espelho de push é suprimido.
  const suppressWebhookPush = await isWebhookPushSuppressed(supabase, operationId);

  if (existing) {
    const patch: Record<string, unknown> = {
      status,
      source,
      raw_payload: payload,
      updated_at: new Date().toISOString(),
    };
    // Nunca sobrescreve um approved_at já existente
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
    delete patch.created_at;

    const { error: updErr } = await supabase.from("cod_orders").update(patch).eq("id", existing.id);
    if (updErr) {
      console.error(`[cod-webhook-${platform}] update failed`, updErr.message);
      return json({ error: "update_failed", detail: updErr.message }, 400);
    }

    if (!suppressWebhookPush && existing.status !== status && ["pending", "delivered", "commission_approved", "paid"].includes(status)) {
      await mirrorSaleToWebPush({
        operation_id: operationId,
        order_id: externalOrderId,
        valor: commissionValueBRL ?? commissionValue,
        currency: commissionValueBRL !== null ? "BRL" : commissionCurrency,
        produto: (row.product_name as string) ?? productKey ?? null,
        afiliado: affiliateCode ?? null,
        canal: "cod",
        url: pushUrl,
        utm_campaign: saleUtmCampaign,
        sale_created_at: String(existing.created_at),
      });
    }
  } else {
    const platformCreatedAt = pick<string>(body, ["criado_em", "created_at", "createdAt"]);
    if (platformCreatedAt) row.created_at = new Date(platformCreatedAt).toISOString();

    const { error: insErr } = await supabase.from("cod_orders").insert(row);
    if (insErr) {
      console.error(`[cod-webhook-${platform}] insert failed`, insErr.message);
      return json({ error: "insert_failed", detail: insErr.message }, 400);
    }

    if (!suppressWebhookPush) {
      await mirrorSaleToWebPush({
        operation_id: operationId,
        order_id: externalOrderId,
        valor: commissionValueBRL ?? commissionValue,
        currency: commissionValueBRL !== null ? "BRL" : commissionCurrency,
        produto: (row.product_name as string) ?? productKey ?? null,
        afiliado: affiliateCode ?? null,
        canal: "cod",
        url: pushUrl,
        utm_campaign: saleUtmCampaign,
        sale_created_at: String(row.created_at ?? new Date().toISOString()),
      });
    }
  }

  return json({ success: true, platform, source });
}
