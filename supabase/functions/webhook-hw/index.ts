import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { corsHeaders } from "../_shared/cors.ts";
import { generatePayloadHash } from "../_shared/idempotency.ts";

const GTX_OPERATION_ID = "0b758a2b-1b92-4769-b47b-416c567e320d";
const SOURCE = "hw";

type JsonRecord = Record<string, unknown>;

const respond = (body: unknown) => new Response(JSON.stringify(body), {
  status: 200,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function pathValue(payload: JsonRecord, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => record(current)?.[key], payload);
}

function first(payload: JsonRecord, paths: string[]): unknown {
  for (const path of paths) {
    const value = pathValue(payload, path);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function text(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return null;
}

function cents(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const normalized = typeof value === "string"
    ? value.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".")
    : value;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

function timestamp(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(typeof value === "number" && value < 10_000_000_000 ? value * 1000 : value as string | number);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function infer(payload: JsonRecord) {
  return {
    external_order_id: text(first(payload, ["order_id", "id", "transaction_id", "sale_id", "code"])),
    value_cents: cents(first(payload, ["value", "amount", "total", "price"])),
    currency: text(first(payload, ["currency", "moeda"]))?.toUpperCase() ?? "BRL",
    payment_status: text(first(payload, ["status", "payment_status", "situacao"])) ?? "pending",
    customer_email: text(first(payload, ["customer.email", "email", "buyer.email"])),
    customer_name: text(first(payload, ["customer.name", "name", "buyer.name"])),
    product_name: text(first(payload, ["product.name", "product", "offer.name"])),
    source_created_at: timestamp(first(payload, ["created_at", "date", "timestamp"])),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const client = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "");

  if (req.method === "GET" && path.endsWith("/health")) {
    const { data } = await client
      .from("webhook_logs")
      .select("received_at")
      .eq("operation_id", GTX_OPERATION_ID)
      .eq("source", SOURCE)
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return respond({ status: "ok", last_received_at: data?.received_at ?? null });
  }

  if (req.method !== "POST") return respond({ received: false, reason: "method_not_supported" });

  let rawBody = "";
  let payload: JsonRecord = {};
  let parseError: string | null = null;
  try {
    rawBody = await req.text();
    const parsed = JSON.parse(rawBody);
    payload = record(parsed) ?? { data: parsed };
  } catch (error) {
    parseError = error instanceof Error ? error.message : "invalid_json";
    payload = { _raw: rawBody };
  }

  try {
    const requestedOperationId = url.searchParams.get("operation_id");
    const { data: hook } = await client
      .from("operation_webhooks")
      .select("secret_token, active")
      .eq("operation_id", GTX_OPERATION_ID)
      .eq("platform", SOURCE)
      .maybeSingle();
    const configuredToken = hook?.active === false ? null : text(hook?.secret_token);
    const receivedToken = url.searchParams.get("webhook_token");
    const tokenRejected = Boolean(configuredToken && receivedToken !== configuredToken);
    const orphan = requestedOperationId !== GTX_OPERATION_ID;
    const payloadHash = await generatePayloadHash(`${GTX_OPERATION_ID}:${SOURCE}:${rawBody}`);
    const inferred = infer(payload);

    const status = parseError || tokenRejected ? "error" : orphan ? "orphan" : "success";
    const errorMessage = parseError
      ? `Payload não é JSON válido: ${parseError}`
      : tokenRejected
        ? "webhook_token inválido"
        : orphan
          ? "operation_id ausente ou não autorizado"
          : null;
    const response = {
      collected: true,
      parse_status: status,
      requested_operation_id: requestedOperationId,
      timezone: "America/Sao_Paulo",
      inferred,
    };

    const { error } = await client.from("webhook_logs").insert({
      operation_id: GTX_OPERATION_ID,
      source: SOURCE,
      status,
      error_message: errorMessage,
      payload,
      raw_body: rawBody,
      response,
      payload_hash: payloadHash,
      ...inferred,
    });

    if (error?.code === "23505") {
      await client
        .from("webhook_logs")
        .update({
          status: "duplicate",
          received_at: new Date().toISOString(),
          response: { ...response, parse_status: "duplicate", duplicate: true },
        })
        .eq("operation_id", GTX_OPERATION_ID)
        .eq("source", SOURCE)
        .eq("payload_hash", payloadHash);
      return respond({ received: true, status: "duplicate", idempotency_key: payloadHash });
    }

    if (error) return respond({ received: true, status: "error", detail: "log_write_failed" });
    return respond({ received: true, status, idempotency_key: payloadHash });
  } catch {
    return respond({ received: true, status: "error", detail: "collector_failure" });
  }
});
