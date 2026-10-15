const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function parsePrice(raw: unknown): number {
  if (raw === null || raw === undefined) return 0;
  let str = String(raw).trim();
  if (!str) return 0;
  str = str.replace(/[R$\s]/g, "");
  if (str.includes(",")) {
    if (str.includes(".") && str.indexOf(".") < str.indexOf(",")) {
      str = str.replace(/\./g, "").replace(",", ".");
    } else {
      str = str.replace(",", ".");
    }
  }
  const value = parseFloat(str);
  if (isNaN(value) || value < 0) return 0;
  if (value > 0 && Number.isInteger(value) && value >= 1000 && !String(raw).includes(".") && !String(raw).includes(",")) {
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
  const skipFields = new Set(["order_id", "orderId", "id", "transaction_id", "phone", "zip", "cep", "cpf", "cnpj", "dateTime", "datetime_full", "date", "created_at", "updated_at", "productId", "product_id", "postbackType", "upsellNo", "email", "firstName", "lastName", "phoneNumber", "country", "currency", "orderType", "order_type"]);
  for (const [key, val] of Object.entries(obj)) {
    if (skipFields.has(key)) continue;
    const parsed = parsePrice(val);
    if (parsed >= 10 && parsed <= 50000) return parsed;
  }
  return 0;
}

const PRICE_FIELDS = ["totalPrice", "total_price", "amount", "price", "value", "commission", "order_total", "sale_amount", "sale_value", "purchase_amount", "purchase_value", "transaction_amount", "transaction_value", "total", "subtotal", "sub_total", "net_amount", "gross_amount", "prod_value", "product_price", "product_value", "revenue", "receita", "total_order_value", "order_value", "order_amount", "checkout_amount", "payment_amount", "payment_value", "charge_amount", "billet_value"];

const BRAND_FALLBACK: Array<{ pattern: RegExp; price: number }> = [
  { pattern: /neurodyne/i, price: 1216.84 },
  { pattern: /leandrops|lean\s*drops/i, price: 1198.46 },
];

function getFallbackPrice(productName: string | null): number {
  if (!productName) return 0;
  for (const { pattern, price } of BRAND_FALLBACK) {
    if (pattern.test(productName)) return price;
  }
  return 0;
}

function sanitize(val: string | null, maxLen: number): string | null {
  if (!val) return null;
  const s = val.trim();
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function getBrasiliaDate(input?: Date): string {
  const d = input || new Date();
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
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

    // Resolve operation_id
    let operationId: string | null = req.headers.get('x-operation-id') || params.get('operation_id');

    if (!operationId && store) {
      try {
        const { data } = await fetch(
          `${supabaseUrl}/rest/v1/operations?select=id&slug=eq.${store.toLowerCase()}&limit=1`,
          { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
        ).then(r => r.json());
        if (data && data.length > 0) operationId = data[0].id;
      } catch (_e) { /* ignore */ }
    }

    // Se não resolveu: gravar em orphan_orders
    if (!operationId) {
      const rawBody = req.method === "POST" ? await req.clone().text() : null;
      let bodyPayload = {};
      try { if (rawBody) bodyPayload = JSON.parse(rawBody); } catch (_e) { /* ignore */ }

      await dbPost("orphan_orders", {
        webhook_source: "cartpanda-webhook",
        raw_payload: bodyPayload,
        headers: Object.fromEntries(req.headers.entries()),
        reason: "operation_id_not_resolved"
      }, supabaseUrl, serviceKey);

      console.error("[cartpanda-webhook] ORPHAN ORDER — operation_id não resolvido");
      return new Response(JSON.stringify({ status: "orphan" }), { status: 200, headers: corsHeaders });
    }


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
      if (revenue === 0) {
        revenue = getFallbackPrice(productName);
        if (revenue > 0) console.info(`[cartpanda-webhook] Fallback price R$${revenue.toFixed(2)} for "${productName}" (order ${orderId})`);
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

      if (revenue === 0) {
        revenue = getFallbackPrice(productName);
        if (revenue > 0) console.info(`[cartpanda-webhook] Fallback price R$${revenue.toFixed(2)} for "${productName}" (order ${orderId})`);
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

    if (!orderId) {
      return new Response(JSON.stringify({ error: "Missing order ID" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const approvedStatuses = ["approved", "paid", "completed", "aprovado", "pago", ""];
    const normalizedStatus = (status || "").toLowerCase();
    if (!approvedStatuses.includes(normalizedStatus)) {
      await dbPost("integration_logs", { integration: "cartpanda", status: "skipped", message: `Order ${orderId} skipped - status: ${status}`, records_processed: 0 }, supabaseUrl, serviceKey);
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

    const safeOrderId = sanitize(String(orderId), 100) || String(orderId).slice(0, 100);
    const result = await dbPost("sales_data", {
      order_id: safeOrderId, date, revenue, status: "approved",
      product_name: sanitize(productName, 255),
      utm_source: sanitize(utmSource, 100),
      utm_campaign: sanitize(utmCampaign, 255),
      utm_content: sanitize(utmContent, 255),
      utm_term: sanitize(utmTerm, 100),
      store: sanitize(store, 100)
    }, supabaseUrl, serviceKey, true);

    if (result.error) {
      await dbPost("integration_logs", { integration: "cartpanda", status: "error", message: `Failed to insert order ${orderId}: ${result.error}`, records_processed: 0 }, supabaseUrl, serviceKey);
      return new Response(JSON.stringify({ success: false, error: result.error }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const revenueMsg = revenue > 0 ? `R$${revenue.toFixed(2)}` : "R$0 (price not found)";

    if (revenue < 100) {
      try {
        await dbPost("system_logs", {
          type: "WEBHOOK_LOW_REVENUE",
          function_name: "cartpanda-webhook",
          message: `Order ${orderId} - low revenue: ${revenueMsg}`,
          metadata: { revenue, store, product_name: productName },
        }, supabaseUrl, serviceKey);
      } catch (_e) { /* ignore */ }
    }

    await dbPost("integration_logs", { integration: "cartpanda", status: "success", message: `Order ${orderId} processed - ${revenueMsg}`, records_processed: 1 }, supabaseUrl, serviceKey);

    return new Response(JSON.stringify({ success: true, order_id: orderId, revenue }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown";
    console.error("[cartpanda-webhook] Fatal error:", errMsg);

    try {
      await dbPost("system_logs", {
        type: "EDGE_ERROR",
        function_name: "cartpanda-webhook",
        message: errMsg,
        stack: err instanceof Error ? err.stack : null,
        metadata: { timestamp: new Date().toISOString() },
      }, supabaseUrl, serviceKey);
    } catch (_e) { /* ignore */ }

    try {
      await dbPost("integration_logs", { integration: "cartpanda", status: "error", message: `Webhook error: ${errMsg}`, records_processed: 0 }, supabaseUrl, serviceKey);
    } catch (_e) { /* ignore */ }

    return new Response(JSON.stringify({ success: false, error: "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
