/**
 * COD Webhook — plataforma de checkout "Fahto" → operação GTX MIDIA
 *
 * Espelha 100% a lógica do cod-webhook-shphere (parser defensivo, antileak via
 * trigger trg_check_cod_order_leak, dedupe por external_order_id normalizado +
 * dedupe semântico no push-send, conversão FX e push mirror sale_approved),
 * mas com tenant FIXO na operação GTX MIDIA e source = "fahto".
 *
 * URL: POST /functions/v1/cod-webhook-gtx  (endpoint aberto, sem token)
 */

import { handleCodWebhook, codCorsHeaders } from "../_shared/cod-ingest.ts";

const GTX_OPERATION_ID = "0b758a2b-1b92-4769-b47b-416c567e320d"; // GTX MIDIA | AF 🇺🇸

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: codCorsHeaders });

  return await handleCodWebhook(req, {
    platform: "fahto",
    source: "fahto",
    defaultCurrency: "USD",
    pushUrl: "/dashboard/cod",
    forcedOperationId: GTX_OPERATION_ID,
  });
});
