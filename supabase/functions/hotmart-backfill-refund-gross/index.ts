/**
 * Hotmart Backfill Refund Gross — preenche raw_tracking.gross_price_brl
 * dos estornos (RFND/CGBK) usando a Sales History API da Hotmart.
 *
 * POST { days?: 1, dry_run?: false, limit?: 200 }
 *  - days = 1 → apenas estornos processados hoje (BRT)
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const HOTMART_OAUTH_URL = "https://api-sec-vlc.hotmart.com/security/oauth/token";
const HOTMART_SALES_HISTORY_URL = "https://developers.hotmart.com/payments/api/v1/sales/history";

let cachedToken: { token: string; exp: number } | null = null;

async function getToken(): Promise<string | null> {
  const now = Date.now();
  if (cachedToken && cachedToken.exp > now + 30_000) return cachedToken.token;
  const clientId = Deno.env.get("HOTMART_ESCOLA_CLIENT_ID");
  const clientSecret = Deno.env.get("HOTMART_ESCOLA_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;
  const basic = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch(
    `${HOTMART_OAUTH_URL}?grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`,
    { method: "POST", headers: { Authorization: `Basic ${basic}` } },
  );
  if (!res.ok) {
    console.warn("[OAUTH-FAIL]", res.status, await res.text());
    return null;
  }
  const j = await res.json();
  cachedToken = { token: j.access_token, exp: now + Number(j.expires_in || 3600) * 1000 };
  return cachedToken.token;
}

/** Retorna o preço CHEIO da oferta (full_price / payment_mode_value) + moeda. */
async function fetchGross(txId: string): Promise<{ value: number; currency: string } | null> {
  const token = await getToken();
  if (!token) return null;
  const res = await fetch(`${HOTMART_SALES_HISTORY_URL}?transaction=${encodeURIComponent(txId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    console.warn("[SALES-HIST-FAIL]", txId, res.status);
    return null;
  }
  const j = await res.json();
  const item = j?.items?.[0] || j?.data?.[0] || j;
  const priceObj = item?.purchase?.price || item?.price || {};
  const fullPriceObj = item?.purchase?.full_price || item?.full_price || {};
  const offerObj = item?.purchase?.offer || item?.offer || {};
  // Preço CHEIO da oferta (parcelada) tem prioridade sobre o valor efetivamente pago
  const value = Number(
    fullPriceObj?.value ?? offerObj?.payment_mode_value ?? priceObj.value ?? NaN,
  );
  if (!Number.isFinite(value) || value <= 0) return null;
  const currency = String(
    fullPriceObj?.currency_code || fullPriceObj?.currency_value ||
    priceObj.currency_code || priceObj.currency_value || priceObj.currency || "BRL",
  ).toUpperCase();
  return { value, currency };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });




  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const body = await req.json().catch(() => ({}));
  const days = Number(body.days ?? 1);
  const dryRun = Boolean(body.dry_run ?? false);
  const limit = Number(body.limit ?? 200);
  const force = Boolean(body.force ?? false);

  const { data: op } = await supabase
    .from("operations").select("id").eq("slug", "escola-do-dolar").maybeSingle();
  if (!op?.id) {
    return new Response(JSON.stringify({ error: "op not found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Janela por data de PROCESSAMENTO do estorno (created_at em BRT)
  const nowBrt = new Date(Date.now() - 3 * 3600_000);
  const startBrt = new Date(nowBrt);
  startBrt.setUTCHours(0, 0, 0, 0);
  startBrt.setUTCDate(startBrt.getUTCDate() - (days - 1));
  const sinceIso = new Date(startBrt.getTime() + 3 * 3600_000).toISOString();

  const { data: rows, error } = await supabase
    .from("clickbank_audit")
    .select("receipt, amount_brl, product_name, raw_tracking, created_at")
    .eq("operation_id", op.id)
    .eq("vendor", "hotmart")
    .in("transaction_type", ["RFND", "CGBK"])
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // FX para moedas estrangeiras
  let usdToBrl = 5.15;
  {
    const { data: rateRow } = await supabase
      .from("exchange_rate_log").select("rate")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (rateRow?.rate) usdToBrl = Number(rateRow.rate);
  }

  const results = {
    since_brt: startBrt.toISOString().substring(0, 10),
    scanned: rows?.length ?? 0,
    already_filled: 0,
    updated: 0,
    no_data: 0,
    failed: 0,
    total_gross_brl: 0,
    total_commission_brl: 0,
    items: [] as any[],
  };

  for (const row of rows ?? []) {
    const existing = Number((row.raw_tracking as any)?.gross_price_brl || 0);
    results.total_commission_brl += Number(row.amount_brl || 0);
    if (existing > 0 && !force) {
      results.already_filled++;
      results.total_gross_brl += existing;
      results.items.push({ receipt: row.receipt, gross_price_brl: existing, source: "existing" });
      continue;
    }
    const txId = row.receipt.replace(/^hotmart_/, "");
    try {
      const gross = await fetchGross(txId);
      if (!gross) { results.no_data++; continue; }
      let grossBrl = gross.value;
      if (gross.currency === "USD") grossBrl = gross.value * usdToBrl;
      else if (gross.currency === "EUR") grossBrl = gross.value * 1.08 * usdToBrl;
      grossBrl = Math.round(grossBrl * 100) / 100;

      results.total_gross_brl += grossBrl;
      results.items.push({
        receipt: row.receipt,
        product: row.product_name,
        commission_brl: Number(row.amount_brl || 0),
        gross_price_brl: grossBrl,
        currency: gross.currency,
        source: "api",
      });

      if (dryRun) { results.updated++; continue; }

      const rawTracking = {
        ...((row.raw_tracking as any) || {}),
        gross_price_brl: grossBrl,
        gross_currency: gross.currency,
        gross_backfilled_at: new Date().toISOString(),
      };
      const { error: upErr } = await supabase
        .from("clickbank_audit").update({ raw_tracking: rawTracking }).eq("receipt", row.receipt);
      if (upErr) { results.failed++; console.warn("[UPD-FAIL]", row.receipt, upErr.message); }
      else results.updated++;
    } catch (e: any) {
      results.failed++;
      console.warn("[ERR]", txId, e?.message);
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  results.total_gross_brl = Math.round(results.total_gross_brl * 100) / 100;
  results.total_commission_brl = Math.round(results.total_commission_brl * 100) / 100;

  await supabase.from("integration_logs").insert({
    integration: "hotmart",
    status: results.failed > 0 ? "warning" : "success",
    message: `Backfill gross estornos: scanned=${results.scanned} updated=${results.updated} no_data=${results.no_data} failed=${results.failed}${dryRun ? " (dry-run)" : ""}`,
    operation_id: op.id,
    records_processed: results.updated,
  });

  return new Response(JSON.stringify(results, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
