/**
 * COD Webhook — nova plataforma (genérico).
 *
 * Mesma lógica do cod-webhook-shphere (parser, tenant, antileak, FX, push-mirror),
 * porém com identificação separada via ?source=<nome-da-plataforma>.
 *
 * URL: POST /functions/v1/cod-webhook-platform?source=<plataforma>
 * Header opcional de assinatura: x-signature (secret COD_PLATFORM_WEBHOOK_SECRET)
 */

import { handleCodWebhook, codCorsHeaders } from "../_shared/cod-ingest.ts";

const DEFAULT_SOURCE = Deno.env.get("COD_PLATFORM_DEFAULT_SOURCE") ?? "plataforma2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: codCorsHeaders });

  const url = new URL(req.url);
  const raw = (url.searchParams.get("source") || url.searchParams.get("platform") || DEFAULT_SOURCE)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
  const platform = raw || DEFAULT_SOURCE;

  return await handleCodWebhook(req, {
    platform,
    source: platform,
    secretEnv: "COD_PLATFORM_WEBHOOK_SECRET",
    defaultCurrency: "EUR",
    pushUrl: "/dashboard/cod",
  });
});
