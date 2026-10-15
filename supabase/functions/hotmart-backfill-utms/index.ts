/**
 * Hotmart Backfill UTMs — enriquece vendas Hotmart antigas via Sales History API.
 * POST { days?: 90, dry_run?: false, limit?: 500 }
 */
import { createClient } from "npm:@supabase/supabase-js@2";

// ─── UTMfy external_code parser (inline) ──────────────────
// Formato: SOURCE{SEP}CAMP_NAME|CAMP_ID{SEP}ADSET_NAME|ADSET_ID{SEP}AD_NAME|AD_ID{SEP}PLACEMENT_NAME
const UTMFY_SEP = "hQwK21wXxR";
const META_ID_RE = /^\d{10,20}$/;
interface UtmfyParsed { source: string | null; campaign_id: string | null; campaign_name: string | null; adset_id: string | null; adset_name: string | null; ad_id: string | null; ad_name: string | null; placement_id: string | null; placement_name: string | null; }
function splitPair(block: string): { a: string | null; b: string | null } {
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
  const b0 = splitPair(parts[0] || "");
  const b1 = splitPair(parts[1] || "");
  const b2 = splitPair(parts[2] || "");
  const b3 = splitPair(parts[3] || "");
  const asId = (v: string | null) => (v && META_ID_RE.test(v) ? v : null);
  return {
    source: b0.a, campaign_name: b0.b,
    campaign_id: asId(b1.a), adset_name: b1.b,
    adset_id: asId(b2.a), ad_name: b2.b,
    ad_id: asId(b3.a), placement_name: b3.b,
    placement_id: null,
  };
}
const parseUtmfySck = parseUtmfyXcod;
// ───────────────────────────────────────────────────────────

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
  if (!res.ok) { console.warn("[OAUTH-FAIL]", res.status, await res.text()); return null; }
  const j = await res.json();
  cachedToken = { token: j.access_token, exp: now + Number(j.expires_in || 3600) * 1000 };
  return cachedToken.token;
}

function parseExternalCode(ext: string) {
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
      utm_source: p[0] || null, utm_medium: p[1] || null, utm_campaign: p[2] || null,
      utm_content: p[3] || null, utm_term: p[4] || null,
    };
  }
  return null;
}

async function enrichTx(txId: string) {
  const token = await getToken();
  if (!token) return null;
  const res = await fetch(`${HOTMART_SALES_HISTORY_URL}?transaction=${encodeURIComponent(txId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) { console.warn("[SALES-HIST-FAIL]", txId, res.status); return null; }
  const j = await res.json();
  const item = j?.items?.[0] || j?.data?.[0] || j;
  const tracking = item?.purchase?.tracking || item?.tracking || {};
  const sck: string = tracking.source_sck || tracking.sck || "";
  const parts = sck.includes("|") ? sck.split("|") : [];
  const externalCode: string = tracking.external_code || tracking.external_reference || "";
  const fromExt = parseExternalCode(externalCode);

  // Extrai comissão LÍQUIDA do PRODUTOR (fonte oficial de faturamento)
  // 1º: commissions[source=PRODUCER] se vier
  // 2º: price.value - hotmart_fee.total (padrão da Sales History API)
  const commissions: any[] = Array.isArray(item?.commissions)
    ? item.commissions
    : Array.isArray(item?.purchase?.commissions) ? item.purchase.commissions : [];
  const producer = commissions.find(
    (c) => String(c?.source || "").toUpperCase() === "PRODUCER",
  );
  let producerValue = Number(producer?.value ?? NaN);
  let producerCurrency = String(producer?.currency_value || producer?.currency || "").toUpperCase() || null;
  if (!Number.isFinite(producerValue) || producerValue <= 0) {
    const priceObj = item?.purchase?.price || item?.price || {};
    const feeObj = item?.purchase?.hotmart_fee || item?.hotmart_fee || {};
    const priceVal = Number(priceObj.value ?? NaN);
    const feeVal = Number(feeObj.total ?? NaN);
    if (Number.isFinite(priceVal) && priceVal > 0 && Number.isFinite(feeVal) && feeVal >= 0) {
      producerValue = Math.max(0, priceVal - feeVal);
      producerCurrency = String(priceObj.currency_code || priceObj.currency_value || priceObj.currency || feeObj.currency_code || "").toUpperCase() || producerCurrency;
    }
  }


  return {
    utm_source: tracking.utm_source || fromExt?.utm_source || tracking.source || parts[0] || null,
    utm_medium: tracking.utm_medium || fromExt?.utm_medium || parts[1] || null,
    utm_campaign: tracking.utm_campaign || fromExt?.utm_campaign || parts[2] || null,
    utm_content: tracking.utm_content || fromExt?.utm_content || parts[3] || null,
    utm_term: tracking.utm_term || fromExt?.utm_term || parts[4] || null,
    sck: sck || null,
    xcod: externalCode || tracking.external_reference || null,
    src: tracking.src || null,
    producer_value: Number.isFinite(producerValue) && producerValue > 0 ? producerValue : null,
    producer_currency: producerCurrency,
    _raw: item,
  };
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const body = await req.json().catch(() => ({}));
  const days = Number(body.days ?? 90);
  const dryRun = Boolean(body.dry_run ?? false);
  const limit = Number(body.limit ?? 500);
  const refreshAmounts = Boolean(body.refresh_amounts ?? false);

  const { data: op } = await supabase.from("operations").select("id").eq("slug", "escola-do-dolar").maybeSingle();
  if (!op?.id) return new Response(JSON.stringify({ error: "op not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const since = new Date(Date.now() - days * 86400_000).toISOString().substring(0, 10);
  let query = supabase
    .from("clickbank_audit")
    .select("receipt, date, raw_tracking, sck, xcod, utm_campaign, meta_campaign_id, amount_brl")
    .eq("vendor", "hotmart").eq("operation_id", op.id).gte("date", since);
  if (!refreshAmounts) {
    query = query.or("utm_campaign.is.null,meta_campaign_id.is.null");
  }
  const { data: rows, error } = await query.order("date", { ascending: false }).limit(limit);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });


  const results = { scanned: rows?.length ?? 0, updated: 0, no_data: 0, failed: 0, meta_linked: 0, amount_updated: 0, samples: [] as any[] };

  // FX USD→BRL para converter comissão em outras moedas
  let usdToBrl = 5.15;
  {
    const { data: rateRow } = await supabase
      .from("exchange_rate_log")
      .select("rate").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (rateRow?.rate) usdToBrl = Number(rateRow.rate);
  }


  async function resolveMetaNames(campaignId: string | null, adId: string | null) {
    let campaign_name: string | null = null, ad_name: string | null = null;
    if (campaignId) {
      const { data } = await supabase.from("meta_campaign_status").select("campaign_name").eq("campaign_id", campaignId).eq("operation_id", op.id).limit(1).maybeSingle();
      campaign_name = data?.campaign_name || null;
    }
    if (adId) {
      const { data } = await supabase.from("meta_ad_pages").select("ad_name, campaign_name").eq("ad_id", adId).eq("operation_id", op.id).limit(1).maybeSingle();
      ad_name = data?.ad_name || null;
      if (!campaign_name && data?.campaign_name) campaign_name = data.campaign_name;
    }
    return { campaign_name, ad_name };
  }

  for (const row of rows ?? []) {
    const txId = row.receipt.replace(/^hotmart_/, "");
    try {
      const enriched = await enrichTx(txId);
      // UTMfy grava IDs no external_code (xcod). sck em Postback 2.0 é só hash.
      const pickWithSep = (...vals: (string | null | undefined)[]) =>
        vals.find((v) => typeof v === "string" && v.includes("hQwK21wXxR")) || null;
      const utmfyInput = pickWithSep(row.xcod, enriched?.xcod, row.sck, enriched?.sck);
      const parsedSck = parseUtmfyXcod(utmfyInput);
      const metaFields: Record<string, string | null> = {};
      if (parsedSck && parsedSck.campaign_id) {
        const names = await resolveMetaNames(parsedSck.campaign_id, parsedSck.ad_id);
        metaFields.meta_campaign_id = parsedSck.campaign_id;
        metaFields.meta_adset_id = parsedSck.adset_id;
        metaFields.meta_ad_id = parsedSck.ad_id;
        metaFields.meta_placement = parsedSck.placement_name || parsedSck.placement_id;
        metaFields.meta_campaign_name = names.campaign_name || parsedSck.campaign_name;
        metaFields.meta_adset_name = parsedSck.adset_name;
        metaFields.meta_ad_name = names.ad_name || parsedSck.ad_name;
        results.meta_linked++;
      }

      if (!enriched && !parsedSck) { results.no_data++; continue; }
      if (results.samples.length < 5) results.samples.push({ receipt: row.receipt, enriched, parsedSck });
      if (dryRun) { results.updated++; continue; }

      const rawTracking = { ...(row.raw_tracking as any || {}), enriched, utmfy_parsed: parsedSck, backfilled_at: new Date().toISOString() };
      const updateFields: Record<string, any> = { raw_tracking: rawTracking, ...metaFields };
      if (enriched) Object.assign(updateFields, {
        utm_source: enriched.utm_source, utm_medium: enriched.utm_medium,
        utm_campaign: enriched.utm_campaign, utm_content: enriched.utm_content,
        utm_term: enriched.utm_term, sck: enriched.sck, xcod: enriched.xcod, src: enriched.src,
      });
      // Aplica comissão LÍQUIDA do PRODUTOR como faturamento
      if (enriched?.producer_value && enriched.producer_value > 0) {
        const cur = (enriched.producer_currency || "BRL").toUpperCase();
        let amountBrl = enriched.producer_value;
        if (cur === "USD") amountBrl = enriched.producer_value * usdToBrl;
        else if (cur === "EUR") amountBrl = enriched.producer_value * 1.08 * usdToBrl;
        amountBrl = Math.round(amountBrl * 100) / 100;
        if (amountBrl > 0 && Math.abs(amountBrl - Number(row.amount_brl || 0)) > 0.01) {
          updateFields.amount_brl = amountBrl;
          updateFields.amount_usd = usdToBrl > 0 ? Math.round((amountBrl / usdToBrl) * 100) / 100 : null;
          results.amount_updated++;
        }
      }
      const { error: upErr } = await supabase.from("clickbank_audit").update(updateFields).eq("receipt", row.receipt);
      if (upErr) { results.failed++; console.warn("[UPD-FAIL]", row.receipt, upErr.message); }
      else results.updated++;

    } catch (e: any) { results.failed++; console.warn("[ERR]", txId, e?.message); }
    await new Promise(r => setTimeout(r, 120));
  }

  await supabase.from("integration_logs").insert({
    integration: "hotmart", status: "success",
    message: `Backfill UTMs: scanned=${results.scanned} updated=${results.updated} no_data=${results.no_data} failed=${results.failed}${dryRun ? " (dry-run)" : ""}`,
    operation_id: op.id, records_processed: results.updated,
  });

  return new Response(JSON.stringify(results, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
