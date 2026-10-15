/**
 * recover-clickbank-affiliate
 *
 * Pulls ClickBank orders for a SPECIFIC affiliate nickname over a date range
 * and upserts into clickbank_audit with the correct project label.
 *
 * Use case: backfill sales from an affiliate that was not yet mapped
 * in app_settings.clickbank_vendors (e.g. "ntvndm" landing in "Outros").
 *
 * POST body:
 * {
 *   "affiliate": "ntvndm",          // affiliate nickname (lowercase)
 *   "vendor":    "memopryl",         // ClickBank vendor account that owns the product
 *   "project_label": "MMP",          // label to attribute these sales to
 *   "start_date": "2026-05-01",
 *   "end_date":   "2026-05-06",
 *   "clerk_key_secret": "CLICKBANK_CLERK_KEY_MEMOPRYL"  // optional override
 * }
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VALID_TYPES = new Set(["SALE", "BILL", "TEST_SALE", "TEST_BILL"]);

function toBrasiliaDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric", month: "2-digit", day: "2-digit",
    }).format(d);
  } catch { return new Date().toISOString().slice(0, 10); }
}

async function fetchPage(clerkKey: string, role: string, account: string, startDate: string, endDate: string, page: number) {
  // role=AFFILIATE → query by affiliate; role=VENDOR → query by vendor
  const param = role === "AFFILIATE" ? `affiliate=${account}` : `vendor=${account}`;
  const url = `https://api.clickbank.com/rest/1.3/orders2/list?${param}&startDate=${startDate}&endDate=${endDate}&role=${role}`;
  const resp = await fetch(url, {
    headers: { Authorization: clerkKey, Accept: "application/json", Page: String(page) },
  });
  return resp;
}

async function fetchAllOrders(clerkKey: string, role: string, account: string, startDate: string, endDate: string): Promise<any[]> {
  const all: any[] = [];
  let page = 1;
  let hasMore = true;
  while (hasMore && page <= 100) {
    const resp = await fetchPage(clerkKey, role, account, startDate, endDate, page);
    if (resp.status !== 200 && resp.status !== 206) {
      const t = await resp.text();
      console.log(`[recover-cb] page ${page} status ${resp.status}: ${t.substring(0, 200)}`);
      break;
    }
    const text = await resp.text();
    let data: any; try { data = JSON.parse(text); } catch { break; }
    const orders = data?.orderData || data?.["order-data"] || [];
    const list = Array.isArray(orders) ? orders : [orders];
    all.push(...list);
    hasMore = resp.status === 206;
    page++;
  }
  return all;
}

function extract(order: any, vendorNick: string) {
  const lineItems = order.lineItemData || order["line-item-data"];
  const lineItem = Array.isArray(lineItems) ? lineItems[0] : lineItems;
  const tracking = order.tracking || order.affiliateTracking || {};
  const aff_sub2 = order.aff_sub2 || tracking.aff_sub2 || lineItem?.aff_sub2 || null;
  const aff_sub3 = order.aff_sub3 || tracking.aff_sub3 || lineItem?.aff_sub3 || null;
  const affiliate = order.affiliate || order.affi || tracking.affiliate || null;
  const receipt = order.receipt || order.transactionId || "";
  const txType = (order.transactionType || order.txnType || lineItem?.transactionType || "SALE").toUpperCase();
  const totalAccount = Number(lineItem?.accountAmount || order.totalAccountAmount || order.accountAmount || 0);
  const totalOrder = Number(lineItem?.orderAmount || order.totalOrderAmount || order.orderAmount || 0);
  const amountUsd = totalAccount > 0 ? totalAccount : totalOrder;
  const txDate = order.transactionTime || order.date || order.processedPayment?.date || null;
  const date = txDate ? toBrasiliaDate(String(txDate)) : new Date().toISOString().slice(0, 10);
  const vendor = order.vendor || order.cvendor || vendorNick;
  const productTitle = lineItem?.itemTitle || lineItem?.productTitle || order.productTitle || "";
  const itemNo = lineItem?.itemNo || lineItem?.sku || order.itemNo || "";
  return {
    receipt, txType, amountUsd, date,
    vendor: String(vendor),
    productTitle: String(productTitle),
    itemNo: String(itemNo),
    affiliate: affiliate ? String(affiliate).toLowerCase().trim() : null,
    aff_sub2: aff_sub2 ? String(aff_sub2) : null,
    aff_sub3: aff_sub3 ? String(aff_sub3) : null,
    metaCampaignId: aff_sub3 || aff_sub2 || null,
  };
}

function deriveQty(sku: string, title: string): number {
  if (sku) { const m = sku.match(/(\d{2})FE$/i); if (m) { const n = parseInt(m[1], 10); if ([2,3,6].includes(n)) return n; } }
  if (title) { const m = title.match(/(\d+)\s*Bottle/i); if (m) { const n = parseInt(m[1], 10); if ([2,3,6].includes(n)) return n; } }
  return 0;
}

import { requireSuperAdmin } from "../_shared/requireSuperAdmin.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const h = { ...corsHeaders, "Content-Type": "application/json" };

  const guard = await requireSuperAdmin(req);
  if (!guard.ok) return guard.response;

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";



  try {
    const body = await req.json();
    const affiliate = String(body.affiliate || "").toLowerCase().trim();
    const vendor = String(body.vendor || "").toLowerCase().trim();
    const role = String(body.role || "AFFILIATE").toUpperCase(); // AFFILIATE | VENDOR
    const projectLabel = String(body.project_label || "Outros");
    const startDate = String(body.start_date || "");
    const endDate = String(body.end_date || "");
    const keySecretName = String(body.clerk_key_secret || "CLICKBANK_CLERK_API_KEY");

    if (!affiliate || !startDate || !endDate) {
      return new Response(JSON.stringify({ error: "Required: affiliate, start_date, end_date (vendor optional when role=AFFILIATE)" }), { status: 400, headers: h });
    }

    const clerkKey = Deno.env.get(keySecretName) || "";
    if (!clerkKey) {
      return new Response(JSON.stringify({ error: `Missing secret ${keySecretName}` }), { status: 500, headers: h });
    }

    // Exchange rate
    let usdToBrl = 5.15;
    try {
      const r = await fetch(`${supabaseUrl}/rest/v1/exchange_rate_log?select=rate&order=created_at.desc&limit=1`, {
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      });
      if (r.ok) { const rows = await r.json(); if (rows?.[0]?.rate > 0) usdToBrl = Number(rows[0].rate); }
    } catch {}

    // When role=AFFILIATE, query by affiliate nickname; when VENDOR, by vendor
    const account = role === "AFFILIATE" ? affiliate : vendor;
    console.log(`[recover-cb] role=${role} account=${account} affiliate_filter=${affiliate} range=${startDate}..${endDate} secret=${keySecretName}`);

    const orders = await fetchAllOrders(clerkKey, role, account, startDate, endDate);
    console.log(`[recover-cb] Fetched ${orders.length} total orders (role=${role}, account=${account})`);

    let matched = 0, upserted = 0, errors = 0;
    const samples: any[] = [];

    for (const order of orders) {
      try {
        const f = extract(order, vendor);
        if (!f.receipt) continue;
        if (!VALID_TYPES.has(f.txType)) continue;
        if ((f.affiliate || "").toLowerCase() !== affiliate) continue;
        matched++;

        if (samples.length < 5) samples.push({ receipt: f.receipt, date: f.date, usd: f.amountUsd, sku: f.itemNo, aff_sub2: f.aff_sub2 });

        const row = {
          receipt: f.receipt,
          transaction_type: f.txType,
          amount_usd: f.amountUsd,
          amount_brl: f.amountUsd * usdToBrl,
          product_name: projectLabel,
          vendor: f.vendor,
          date: f.date,
          key_used: "RECOVERY_API",
          meta_campaign_id: f.metaCampaignId,
          aff_sub2: f.aff_sub2,
          aff_sub3: f.aff_sub3,
          affiliate: f.affiliate,
          item_name: f.productTitle || f.itemNo || null,
          quantity: deriveQty(f.itemNo, f.productTitle),
        };

        const up = await fetch(`${supabaseUrl}/rest/v1/clickbank_audit`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            Prefer: "resolution=merge-duplicates",
          },
          body: JSON.stringify(row),
        });
        if (up.ok) upserted++;
        else {
          const t = await up.text();
          if (!t.includes("duplicate")) { errors++; console.error(`[recover-cb] upsert ${f.receipt}: ${t.substring(0,200)}`); }
          else upserted++;
        }
      } catch (e) { errors++; console.error("[recover-cb] order error:", (e as Error).message); }
    }

    return new Response(JSON.stringify({
      success: true,
      affiliate, vendor, project_label: projectLabel,
      range: { start: startDate, end: endDate },
      exchange_rate: usdToBrl,
      totals: { fetched: orders.length, matched_affiliate: matched, upserted, errors },
      samples,
    }, null, 2), { headers: h });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: h });
  }
});
