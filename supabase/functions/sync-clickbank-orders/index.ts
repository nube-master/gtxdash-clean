
/**
 * sync-clickbank-orders
 * 
 * Pulls orders from ClickBank Orders2 API for all vendor accounts,
 * extracts aff_sub tracking parameters, and upserts into clickbank_audit.
 * 
 * This serves as a SECONDARY source to complement IPN webhooks:
 * - Fills in missing aff_sub2/aff_sub3 data
 * - Catches orders that IPN may have missed
 * - Provides retroactive reconciliation capability
 * 
 * NOTE: ClickBank API operates in PST timezone. Sales between 00:00–03:59 BRT
 * appear as the previous day in the API. We handle this by querying ±1 day.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ClickBank vendors to sync — fetched from all known vendor accounts
const CB_VENDORS = ["neurodyne", "memoryon"];

// Dynamic affiliate mapping — loaded at runtime from app_settings
// Legacy fallback used if app_settings read fails
const LEGACY_AFFILIATE_TO_PROJECT: Record<string, string> = {
  guipiresp: "NDM",
  guipires: "NDM",
  gtxndr: "NDR",
  gtxwl: "LDR",
  gtxndb: "NDB",
};
let AFFILIATE_TO_PROJECT: Record<string, string> = { ...LEGACY_AFFILIATE_TO_PROJECT };

// Composite mapping: "affiliate::vendor" → project (takes priority)
const AFFILIATE_VENDOR_TO_PROJECT: Record<string, string> = {
  "gtxndr::memoryon": "MO",
  "gtxndr::neurodyne": "NDR",
};

// Only process these transaction types
const VALID_TYPES = new Set(["SALE", "BILL", "TEST_SALE", "TEST_BILL"]);

function getBrasiliaDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Convert a ClickBank date (PST-based) to Brasilia business date.
 */
function toBrasiliaDate(dateStr: string): string {
  try {
    const parsed = new Date(dateStr);
    if (isNaN(parsed.getTime())) return getBrasiliaDate();
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(parsed);
  } catch {
    return getBrasiliaDate();
  }
}

/**
 * Fetch all pages from orders2/list for a given vendor and date range.
 * ClickBank returns max 100 per page, status 206 means more pages exist.
 */
async function fetchAllOrders(
  clerkKey: string,
  vendor: string,
  startDate: string,
  endDate: string
): Promise<any[]> {
  const allOrders: any[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= 50) { // Safety: max 50 pages = 5000 orders
    // ClickBank orders2 API — use role=VENDOR to scope to vendor account
    const url = `https://api.clickbank.com/rest/1.3/orders2/list?vendor=${vendor}&startDate=${startDate}&endDate=${endDate}&role=VENDOR`;
    
    console.log(`[sync-cb] Fetching: ${url} (key length: ${clerkKey.length}, starts: ${clerkKey.substring(0, 4)}...)`);
    
    const resp = await fetch(url, {
      headers: {
        Authorization: clerkKey,
        Accept: "application/json",
        Page: String(page),
      },
    });

    const contentType = resp.headers.get("content-type") || "";
    console.log(`[sync-cb] ${vendor} page ${page}: status ${resp.status}, content-type: ${contentType}`);

    if (resp.status === 200 || resp.status === 206) {
      const bodyText = await resp.text();
      console.log(`[sync-cb] ${vendor} page ${page} body preview: ${bodyText.substring(0, 500)}`);
      
      let data: any;
      try {
        data = JSON.parse(bodyText);
      } catch {
        // ClickBank sometimes returns XML
        console.log(`[sync-cb] ${vendor}: Non-JSON response, likely XML`);
        hasMore = false;
        continue;
      }
      
      const orders = data?.orderData || data?.["order-data"] || data?.["order_data"] || [];
      const orderList = Array.isArray(orders) ? orders : [orders];
      allOrders.push(...orderList);
      
      // 206 = partial content, more pages available
      hasMore = resp.status === 206;
      page++;
    } else if (resp.status === 204 || resp.status === 404) {
      // No data
      console.log(`[sync-cb] ${vendor}: No data (${resp.status})`);
      hasMore = false;
    } else {
      const errText = await resp.text();
      console.error(`[sync-cb] API error for ${vendor} page ${page}: ${resp.status} - ${errText.substring(0, 200)}`);
      hasMore = false;
    }
  }

  return allOrders;
}

/**
 * Extract tracking and transaction fields from an order object.
 * ClickBank order structure varies; handle multiple shapes.
 */
function extractOrderFields(order: any, vendorNick: string, projectName: string) {
  // LineItem data
  const lineItems = order.lineItemData || order["line-item-data"];
  const lineItem = Array.isArray(lineItems) ? lineItems[0] : lineItems;
  
  // Tracking params - can be at root, in lineItem, or in tracking object
  const tracking = order.tracking || order.affiliateTracking || {};
  
  const aff_sub2 = order.aff_sub2 || tracking.aff_sub2 || lineItem?.aff_sub2 || null;
  const aff_sub3 = order.aff_sub3 || tracking.aff_sub3 || lineItem?.aff_sub3 || null;
  const affiliate = order.affiliate || order.affi || tracking.affiliate || null;
  
  // Transaction details
  const receipt = order.receipt || order.transactionId || "";
  const txType = (order.transactionType || order.txnType || lineItem?.transactionType || "SALE").toUpperCase();
  
  // Amounts
  const totalAccountAmount = Number(
    lineItem?.accountAmount || order.totalAccountAmount || order.accountAmount || 0
  );
  const totalOrderAmount = Number(
    lineItem?.orderAmount || order.totalOrderAmount || order.orderAmount || 0
  );
  const amountUsd = totalAccountAmount > 0 ? totalAccountAmount : totalOrderAmount;
  
  // Date
  const txDate = order.transactionTime || order.date || order.processedPayment?.date || null;
  const date = txDate ? toBrasiliaDate(String(txDate)) : getBrasiliaDate();
  
  // Vendor
  const vendor = order.vendor || order.cvendor || vendorNick;
  
  // Product
  const productTitle = lineItem?.itemTitle || lineItem?.productTitle || order.productTitle || "";
  const itemNo = lineItem?.itemNo || lineItem?.sku || order.itemNo || "";
  
  // Campaign ID: prefer aff_sub3 (Meta campaign ID), fallback to aff_sub2
  const metaCampaignId = aff_sub3 || aff_sub2 || null;

  return {
    receipt,
    txType,
    amountUsd,
    date,
    vendor: String(vendor),
    productTitle: String(productTitle),
    itemNo: String(itemNo),
    affiliate: affiliate ? String(affiliate).toLowerCase().trim() : null,
    aff_sub2: aff_sub2 ? String(aff_sub2) : null,
    aff_sub3: aff_sub3 ? String(aff_sub3) : null,
    metaCampaignId,
    projectName,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const h = { ...corsHeaders, "Content-Type": "application/json" };
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const clerkKey = Deno.env.get("CLICKBANK_CLERK_API_KEY") || "";

  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "Missing SUPABASE env" }), { status: 500, headers: h });
  }
  if (!clerkKey) {
    return new Response(JSON.stringify({ error: "Missing CLICKBANK_CLERK_API_KEY" }), { status: 500, headers: h });
  }

  try {
    // Load vendor and operation maps dynamically from app_settings
    let CB_OPERATION_MAP: Record<string, string> = {};
    try {
      const configRes = await fetch(
        `${supabaseUrl}/rest/v1/app_settings?select=key,value&key=in.(clickbank_vendors,clickbank_sync_operation_map)`,
        { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
      );
      if (configRes.ok) {
        const rows = await configRes.json();
        const vendorRow = rows.find((r: any) => r.key === 'clickbank_vendors');
        const mapRow = rows.find((r: any) => r.key === 'clickbank_sync_operation_map');

        if (vendorRow?.value && Array.isArray(vendorRow.value)) {
          AFFILIATE_TO_PROJECT = { ...LEGACY_AFFILIATE_TO_PROJECT };
          for (const v of vendorRow.value as Array<{ nickname: string; label: string }>) {
            AFFILIATE_TO_PROJECT[v.nickname] = v.label;
          }
        }
        if (mapRow?.value) {
          CB_OPERATION_MAP = mapRow.value;
        }
      }
    } catch (e) {
      console.error("[sync-cb] Failed to load dynamic configs", e);
    }

    const url = new URL(req.url);
    const targetDate = url.searchParams.get("date") || getBrasiliaDate();
    
    // Query ±1 day to handle PST↔BRT timezone overlap
    const dateObj = new Date(`${targetDate}T12:00:00Z`);
    const prevDay = new Date(dateObj);
    prevDay.setDate(prevDay.getDate() - 1);
    const nextDay = new Date(dateObj);
    nextDay.setDate(nextDay.getDate() + 1);
    
    const startDate = prevDay.toISOString().slice(0, 10);
    const endDate = nextDay.toISOString().slice(0, 10);

    console.log(`[sync-cb] Syncing orders for ${targetDate} (API range: ${startDate} to ${endDate})`);

    // Get exchange rate
    let usdToBrl = 5.15;
    try {
      const rateRes = await fetch(
        `${supabaseUrl}/rest/v1/exchange_rate_log?select=rate&order=created_at.desc&limit=1`,
        {
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
        }
      );
      if (rateRes.ok) {
        const rows = await rateRes.json();
        if (rows?.[0]?.rate > 0) usdToBrl = Number(rows[0].rate);
      }
    } catch { /* fallback */ }

    const results: Record<string, { fetched: number; upserted: number; withTracking: number; errors: number }> = {};
    let totalUpserted = 0;
    let totalWithTracking = 0;

    // Fetch orders from ALL configured vendors
    const allStats = { fetched: 0, upserted: 0, withTracking: 0, errors: 0 };
    const projectStats: Record<string, { total: number; tracked: number }> = {};

    for (const cbVendor of CB_VENDORS) {
    try {
      const orders = await fetchAllOrders(clerkKey, cbVendor, startDate, endDate);
      allStats.fetched += orders.length;
      console.log(`[sync-cb] ${cbVendor}: ${orders.length} orders fetched`);

      for (const order of orders) {
        try {
          const fields = extractOrderFields(order, cbVendor, "");
          
          if (!fields.receipt) continue;
          if (!VALID_TYPES.has(fields.txType)) continue;

          // Attribute project: composite key first, then simple affiliate
          const affNick = fields.affiliate || "";
          const vendorLower = (fields.vendor || cbVendor).toLowerCase();
          const compositeKey = `${affNick}::${vendorLower}`;
          const projectName = AFFILIATE_VENDOR_TO_PROJECT[compositeKey] || AFFILIATE_TO_PROJECT[affNick] || "Outros";

          // Resolve operation_id from map: account_id::vendor or fallback via project
          const operationId = CB_OPERATION_MAP[`${affNick}::${vendorLower}`] || CB_OPERATION_MAP[affNick] || null;

          const hasTracking = !!(fields.aff_sub2 || fields.aff_sub3);
          if (hasTracking) allStats.withTracking++;

          if (!projectStats[projectName]) projectStats[projectName] = { total: 0, tracked: 0 };
          projectStats[projectName].total++;
          if (hasTracking) projectStats[projectName].tracked++;

          const auditRow = {
            receipt: fields.receipt,
            transaction_type: fields.txType,
            amount_usd: fields.amountUsd,
            amount_brl: fields.amountUsd * usdToBrl,
            product_name: projectName,
            vendor: fields.vendor,
            date: fields.date,
            key_used: "API",
            meta_campaign_id: fields.metaCampaignId,
            aff_sub2: fields.aff_sub2,
            aff_sub3: fields.aff_sub3,
            affiliate: fields.affiliate,
            item_name: fields.productTitle || fields.itemNo || null,
            quantity: deriveQuantityFromSku(fields.itemNo, fields.productTitle),
            operation_id: operationId,
          };

          // SKU pattern: NRDN06FE → 6, NRDN03FE → 3, NRDN02FE → 2
          function deriveQuantityFromSku(sku: string, title: string): number {
            if (sku) {
              const skuMatch = sku.match(/(\d{2})FE$/i);
              if (skuMatch) {
                const n = parseInt(skuMatch[1], 10);
                if (n === 6 || n === 3 || n === 2) return n;
              }
            }
            if (title) {
              const titleMatch = title.match(/(\d+)\s*Bottle/i);
              if (titleMatch) {
                const n = parseInt(titleMatch[1], 10);
                if (n === 6 || n === 3 || n === 2) return n;
              }
            }
            return 0; // Outros
          }

          // auditRow already defined at line 309

          const upsertRes = await fetch(`${supabaseUrl}/rest/v1/clickbank_audit`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`,
              Prefer: "resolution=merge-duplicates",
            },
            body: JSON.stringify(auditRow),
          });

          if (upsertRes.ok) {
            allStats.upserted++;
          } else {
            const errText = await upsertRes.text();
            if (!errText.includes("duplicate")) {
              console.error(`[sync-cb] Upsert error for ${fields.receipt}: ${errText.substring(0, 200)}`);
              allStats.errors++;
            }
          }
        } catch (orderErr) {
          allStats.errors++;
          console.error(`[sync-cb] Order parse error:`, (orderErr as Error).message);
        }
      }
    } catch (err) {
      console.error(`[sync-cb] Fetch error for ${cbVendor}:`, (err as Error).message);
      allStats.errors++;
    }
    } // end vendor loop

    totalUpserted = allStats.upserted;
    totalWithTracking = allStats.withTracking;

    // Log to integration_logs
    const totalFetched = allStats.fetched;
    const trackingRate = totalFetched > 0 ? ((totalWithTracking / totalFetched) * 100).toFixed(1) : "0";

    await fetch(`${supabaseUrl}/rest/v1/integration_logs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        integration: "clickbank_api",
        status: "success",
        message: `Synced ${targetDate}: ${totalFetched} orders, ${totalUpserted} upserted, tracking rate: ${trackingRate}%`,
        records_processed: totalUpserted,
      }),
    });

    console.log(`[sync-cb] Done: ${totalFetched} fetched, ${totalUpserted} upserted, ${totalWithTracking} with tracking (${trackingRate}%)`);

    return new Response(
      JSON.stringify({
        success: true,
        date: targetDate,
        apiRange: { start: startDate, end: endDate },
        exchangeRate: usdToBrl,
        trackingRate: `${trackingRate}%`,
        totals: { fetched: totalFetched, upserted: totalUpserted, withTracking: totalWithTracking },
        projects: projectStats,
      }, null, 2),
      { headers: h }
    );
  } catch (err) {
    const msg = (err as Error).message || "Unknown error";
    console.error("[sync-cb] Error:", msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: h });
  }
});
