/**
 * COD Webhook — plataforma de checkout "Fahto"
 *
 * Roteamento por URL (por operação):
 *   POST /functions/v1/cod-webhook-fahto/<operation_slug>/fahto/<endpoint_slug>
 * A operação é definida pela URL (tabela operation_webhooks, platform = 'fahto')
 * e nunca pelo corpo da requisição. A chave secreta vai no header
 * x-shphere-signature / x-signature / x-webhook-secret (ou ?secret=).
 *
 * Legado: POST /functions/v1/cod-webhook-fahto (sem path) continua caindo
 * na operação FAHTO fixa.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { handleCodWebhook, codCorsHeaders } from "../_shared/cod-ingest.ts";
import { extractSignature, verifyWebhookSecret, isSvixSecret, verifySvixSignature, verifyTimestampedSignature } from "../_shared/webhook-secret.ts";

const FAHTO_OPERATION_ID = "8707b3f8-ab41-4a63-902c-9ab97fe50c8a"; // FAHTO (legado)

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...codCorsHeaders, "Content-Type": "application/json" },
  });

const SIGNATURE_HEADERS = [
  "svix-signature",
  "webhook-signature",
  "x-signature",
  "x-fahto-signature",
  "x-shphere-signature",
  "x-webhook-secret",
  "x-hub-signature-256",
];

function findSignatureHeader(headers: Headers): { name: string | null; value: string } {
  for (const name of SIGNATURE_HEADERS) {
    const value = headers.get(name);
    if (value) return { name, value };
  }
  for (const [name, value] of headers.entries()) {
    if (name.toLowerCase().includes("signature") && value) return { name: name.toLowerCase(), value };
  }
  return { name: null, value: "" };
}

function safeHeaders(headers: Headers): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [name, value] of headers.entries()) {
    const lower = name.toLowerCase();
    const sensitive = lower.includes("signature") || lower === "authorization" || lower === "cookie" || lower === "apikey";
    output[lower] = sensitive ? `${value.slice(0, 20)}${value.length > 20 ? "…" : ""}` : value;
  }
  return output;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: codCorsHeaders });

  const reqUrl = new URL(req.url);
  const segments = reqUrl.pathname.split("/").filter(Boolean);
  const fnIdx = segments.findIndex((s) => s === "cod-webhook-fahto");
  const pathParts = fnIdx >= 0 ? segments.slice(fnIdx + 1) : [];
  const endpointSlug = pathParts.length > 0 ? pathParts[pathParts.length - 1] : null;
  const pathOperationSlug = pathParts.length >= 2 ? pathParts[0] : null;

  let forcedOperationId = FAHTO_OPERATION_ID;

  if (endpointSlug) {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: hook } = await supabase
      .from("operation_webhooks")
      .select("operation_id, secret_token, active, operations!inner(slug, status)")
      .eq("endpoint_slug", endpointSlug)
      .eq("platform", "fahto")
      .maybeSingle();

    if (!hook || hook.active === false) return json({ error: "unknown_endpoint" }, 404);

    const hookOp = (hook as unknown as { operations?: { slug?: string; status?: string } }).operations;
    const opStatus = String(hookOp?.status || "");
    if (opStatus && !["active", "trial"].includes(opStatus)) {
      return json({ error: "operation_inactive", status: opStatus }, 410);
    }

    const hookSlug = hookOp?.slug;
    if (pathOperationSlug && hookSlug && pathOperationSlug !== hookSlug) {
      return json({ error: "endpoint_operation_mismatch" }, 404);
    }

    let rawBody: string | null = null;
    try {
      rawBody = await req.clone().text();
    } catch {
      rawBody = null;
    }

    const foundSignature = findSignatureHeader(req.headers);

    const logFailure = async (reason: string, detail: string | null) => {
      try {
        await supabase.from("webhook_deliveries").insert({
          operation_id: hook.operation_id,
          platform: "fahto",
          endpoint_slug: endpointSlug,
          status_code: 401,
          outcome: "rejected",
          reason,
          detail: {
            message: detail,
            signature_header: foundSignature.name,
            raw_body_preview: (rawBody ?? "").slice(0, 500),
          },
          headers: safeHeaders(req.headers),
        });
      } catch (_) {
        /* log best-effort */
      }
    };

    const messages: Record<string, string> = {
      integration_incomplete:
        "Nenhuma chave secreta salva para este endpoint. Cole no Traffic OS a chave gerada pela Fahto.",
      no_signature_header: "Nenhum header de assinatura foi encontrado.",
      svix_headers_missing: "A assinatura Svix chegou sem svix-id ou svix-timestamp.",
      timestamp_expired: "svix-timestamp fora da janela de 5 minutos (protecao anti-replay).",
      signature_mismatch_svix: "A assinatura Svix não confere.",
      signature_mismatch_hmac: "A assinatura HMAC-SHA256 não confere.",
      svix_renamed_mismatch: "Formato t=<timestamp>,v1=<hmac> reconhecido, mas o HMAC não confere com a chave salva.",
      malformed_signature: "Header de assinatura em formato desconhecido.",
      unknown_signature_format: "Formato de assinatura não reconhecido.",
    };

    if (!foundSignature.name) {
      await logFailure("no_signature_header", "Nenhum header com nome de assinatura foi recebido.");
      return json({ error: "no_signature_header", message: messages.no_signature_header }, 401);
    }

    const svixHeader = foundSignature.name === "svix-signature" || foundSignature.name === "webhook-signature";
    const timestampedHeader = /(^|[,\s])t=\d+/.test(foundSignature.value);

    if (timestampedHeader) {
      // formato Fahto: x-fahto-signature: t=<unix>,v1=<hmac>
      const messageId = req.headers.get("x-fahto-delivery") || req.headers.get("x-fahto-id") ||
        req.headers.get("x-fahto-event-id") || req.headers.get("svix-id");
      const res = await verifyTimestampedSignature(foundSignature.value, hook.secret_token, rawBody, messageId);
      if (!res.ok) {
        const reason = res.reason === "signature_mismatch" ? "svix_renamed_mismatch" : res.reason;
        await logFailure(
          reason,
          `${res.detail ?? ""} | header ${foundSignature.name}=${foundSignature.value.slice(0, 20)}`,
        );
        return json({ error: reason, message: messages[reason] ?? "Assinatura inválida." }, 401);
      }
    } else if (isSvixSecret(hook.secret_token) && svixHeader) {
      const svix = await verifySvixSignature(req, hook.secret_token, rawBody);
      if (!svix.ok) {
        const reason = svix.reason === "missing_svix_headers"
          ? "svix_headers_missing"
          : svix.reason === "signature_mismatch"
          ? "signature_mismatch_svix"
          : svix.reason;
        await logFailure(reason, svix.detail ?? null);
        return json({ error: reason, message: messages[reason] }, 401);
      }
    } else {
      const check = await verifyWebhookSecret(
        foundSignature.value || extractSignature(req, reqUrl),
        hook.secret_token,
        rawBody,
      );
      if (!check.ok) {
        const reason = check.reason === "integration_incomplete" ? check.reason : "signature_mismatch_hmac";
        await logFailure(reason, "Testados: texto direto e HMAC-SHA256 do body raw em hex/base64, com secret original e sem prefixo whsec_.");
        return json({ error: reason, message: messages[reason] }, 401);
      }
    }

    forcedOperationId = hook.operation_id;
  }


  return await handleCodWebhook(req, {
    platform: "fahto",
    source: "fahto",
    defaultCurrency: "USD",
    pushUrl: "/dashboard/cod",
    forcedOperationId,
    endpointSlug,
  });
});
