
/**
 * Clickbank IPN (Instant Notification Service) webhook.
 * Receives encrypted INS v6+ postbacks from Clickbank, decrypts using
 * CLICKBANK_SECRET_KEY_NDM or CLICKBANK_SECRET_KEY_NDR, and stores
 * transactions in sales_data with store='clickbank_ref'.
 *
 * These records are used for double-check against RedTrack and are NOT
 * counted in primary revenue calculations (dashboard-totals ignores 'clickbank_ref').
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function getBrasiliaDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// ── Clickbank INS v6+ Decryption ──────────────────────────────────────
// Clickbank encrypts IPN payloads using AES-256-CBC.
// The secret key is processed: SHA1(secret) → first 32 hex chars → that's the AES key.
// The IV is sent as hex in the payload.

async function sha1Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function decryptClickbank(
  encryptedBase64: string,
  ivBase64: string,
  secretKey: string
): Promise<string | null> {
  try {
    // Clickbank key derivation: SHA1(secretKey) → hex string → first 32 chars → use as UTF-8 bytes (32 bytes = AES-256)
    const sha1 = await sha1Hex(secretKey);
    const keyStr = sha1.substring(0, 32);
    const keyBytes = new TextEncoder().encode(keyStr); // 32 ASCII bytes = 256 bits

    // IV is base64 encoded (not hex)
    const ivBytes = Uint8Array.from(atob(decodeURIComponent(ivBase64)), (c) => c.charCodeAt(0));

    const key = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "AES-CBC" },
      false,
      ["decrypt"]
    );

    // Decode the base64 encrypted data
    const encryptedBytes = Uint8Array.from(atob(decodeURIComponent(encryptedBase64)), (c) =>
      c.charCodeAt(0)
    );

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-CBC", iv: ivBytes },
      key,
      encryptedBytes
    );

    const text = new TextDecoder().decode(decrypted);
    // Remove PKCS7 padding artifacts
    const jsonEnd = text.lastIndexOf("}");
    if (jsonEnd >= 0) {
      return text.substring(0, jsonEnd + 1);
    }
    return text;
  } catch {
    return null;
  }
}

/**
 * Try to decrypt with multiple keys. Returns [decryptedJSON, keyLabel] or null.
 */
async function tryDecryptWithKeys(
  encryptedBase64: string,
  ivBase64: string,
  keys: { key: string; label: string }[]
): Promise<{ payload: Record<string, unknown>; label: string } | null> {
  for (const { key, label } of keys) {
    if (!key) continue;
    const decrypted = await decryptClickbank(encryptedBase64, ivBase64, key);
    if (!decrypted) continue;
    try {
      const parsed = JSON.parse(decrypted);
      if (parsed && typeof parsed === "object") {
        return { payload: parsed, label };
      }
    } catch {
      // Not valid JSON with this key, try next
    }
  }
  return null;
}

/**
 * Extracts transaction fields from various Clickbank payload shapes.
 */
function extractTransactionFields(
  payload: Record<string, unknown>
): Record<string, unknown> {
  if (payload.notification && typeof payload.notification === "object") {
    return payload.notification as Record<string, unknown>;
  }
  const notif = payload.notification as Record<string, unknown> | undefined;
  if (notif?.transaction && typeof notif.transaction === "object") {
    return notif.transaction as Record<string, unknown>;
  }
  if (
    payload.transactionType ||
    payload.transaction_type ||
    payload.ctransaction
  ) {
    return payload;
  }
  for (const key of Object.keys(payload)) {
    const val = payload[key];
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const nested = val as Record<string, unknown>;
      if (nested.transactionType || nested.transaction_type) {
        return nested;
      }
    }
  }
  return payload;
}

/**
 * Recursively search for a value by trying multiple field names at any depth.
 */
function deepFind(
  obj: Record<string, unknown>,
  fieldNames: string[],
  maxDepth = 4
): string | null {
  if (!obj || typeof obj !== "object" || maxDepth <= 0) return null;
  for (const name of fieldNames) {
    if (obj[name] !== undefined && obj[name] !== null && obj[name] !== "") {
      return String(obj[name]);
    }
  }
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const found = deepFind(val as Record<string, unknown>, fieldNames, maxDepth - 1);
      if (found) return found;
    }
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const h = { ...corsHeaders, "Content-Type": "application/json" };
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "Missing env" }), {
      status: 500,
      headers: h,
    });
  }

  // ── Load vendors dynamically from app_settings (ALL operations) ──
  const { createClient } = await import("npm:@supabase/supabase-js@2");
  const supabase = createClient(supabaseUrl, serviceKey);
  
  type VendorConfig = { id: string; label: string; nickname: string; secret_env: string; vendor_name?: string };
  let vendorConfigs: VendorConfig[] = [];
  // Map: affiliate nickname (lowercase) → operation_id (for multi-operation routing)
  const nicknameToOperationId: Record<string, string> = {};
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value, operation_id")
      .eq("key", "clickbank_vendors");
    if (data && data.length > 0) {
      for (const row of data) {
        if (row.value && Array.isArray(row.value)) {
          const configs = row.value as VendorConfig[];
          vendorConfigs = vendorConfigs.concat(configs);
          // Map each nickname to this operation_id
          if (row.operation_id) {
            for (const v of configs) {
              if (v.nickname) {
                nicknameToOperationId[v.nickname.toLowerCase().trim()] = row.operation_id;
              }
            }
          }
        }
      }
    }
  } catch (e) {
    console.error("[clickbank-ipn] Failed to load vendor configs from app_settings", e);
  }

  // Deduplicate vendor configs by nickname (first occurrence wins)
  const seenNicknames = new Set<string>();
  vendorConfigs = vendorConfigs.filter((v) => {
    const nick = v.nickname.toLowerCase().trim();
    if (seenNicknames.has(nick)) return false;
    seenNicknames.add(nick);
    return true;
  });

  // Fallback to legacy hardcoded keys if no configs found
  if (vendorConfigs.length === 0) {
    vendorConfigs = [
      { id: "ndm", label: "NDM", nickname: "guipiresp", secret_env: "CLICKBANK_SECRET_KEY_NDM" },
      { id: "ndr", label: "NDB", nickname: "gtxndr", secret_env: "CLICKBANK_SECRET_KEY_NDR" },
      { id: "ldr", label: "LDR", nickname: "gtxwl", secret_env: "CLICKBANK_SECRET_KEY_LDG" },
      { id: "crt", label: "CRT", nickname: "nrptgtx", secret_env: "CLICKBANK_SECRET_KEY_AILULA" },
      { id: "ndb2", label: "NDB2", nickname: "gtxndb2", secret_env: "CLICKBANK_SECRET_KEY_NDB2" },
    ];
  }

  console.log(`[clickbank-ipn] Nickname→Operation map: ${JSON.stringify(nicknameToOperationId)}`);

  // Build decryption keys array from vendor configs
  const keys = vendorConfigs
    .map((v) => ({ key: Deno.env.get(v.secret_env) || "", label: v.label }))
    .filter((k) => k.key.length > 0);

  console.log(`[clickbank-ipn] Loaded ${vendorConfigs.length} vendor configs, ${keys.length} active keys`);

  try {
    const rawBody = await req.text();
    let rootPayload: Record<string, unknown>;

    try {
      rootPayload = JSON.parse(rawBody);
    } catch {
      const params = new URLSearchParams(rawBody);
      rootPayload = {};
      params.forEach((v, k) => {
        rootPayload[k] = v;
      });
    }

    const payloadKeys = Object.keys(rootPayload);
    console.log(
      `[clickbank-ipn] Payload keys: [${payloadKeys.join(", ")}], raw length: ${rawBody.length}`
    );

    // ── Handle encrypted payloads ──
    const ivBase64 = rootPayload.iv as string | undefined;
    const encryptedNotification =
      typeof rootPayload.notification === "string"
        ? (rootPayload.notification as string)
        : (rootPayload.inputValue as string | undefined);

    // Track which decryption key was used (for project attribution fallback)
    let decryptionKeyLabel: string | null = null;

    if (ivBase64 && encryptedNotification) {
      console.log(`[clickbank-ipn] Encrypted payload detected, attempting decryption...`);

      const result = await tryDecryptWithKeys(encryptedNotification, ivBase64, keys);

      if (!result) {
        console.error("[clickbank-ipn] Failed to decrypt with all keys");
        await logToDb(supabaseUrl, serviceKey, {
          integration: "clickbank",
          status: "error",
          message: `Decryption failed with all ${keys.length} keys (${keys.map(k => k.label).join(", ")}). IV: ${ivBase64.substring(0, 16)}...`,
          records_processed: 0,
        });
        return new Response(
          JSON.stringify({ ok: false, error: "decryption_failed" }),
          { status: 400, headers: h }
        );
      }

      decryptionKeyLabel = result.label;
      console.log(`[clickbank-ipn] Decrypted with key: ${result.label}`);
      // Log full decrypted structure for diagnosis
      const rootKeys = Object.keys(result.payload);
      console.log(`[clickbank-ipn] Decrypted root keys: [${rootKeys.join(", ")}]`);
      // Deep-log affiliate/vendor fields at every level
      const diagFields = ["vendor", "cvendor", "aff_sub2", "affSub2", "aff_sub3", "affSub3", 
                          "affiliate", "productTitle", "product_title", "cproditem"];
      const diagLog: Record<string, unknown> = {};
      for (const f of diagFields) {
        if ((result.payload as Record<string, unknown>)[f] !== undefined) diagLog[`root.${f}`] = (result.payload as Record<string, unknown>)[f];
      }
      // Check nested notification/transaction objects
      for (const topKey of rootKeys) {
        const nested = (result.payload as Record<string, unknown>)[topKey];
        if (nested && typeof nested === "object" && !Array.isArray(nested)) {
          for (const f of diagFields) {
            if ((nested as Record<string, unknown>)[f] !== undefined) diagLog[`${topKey}.${f}`] = (nested as Record<string, unknown>)[f];
          }
          // Go one more level deep
          for (const midKey of Object.keys(nested as Record<string, unknown>)) {
            const deep = (nested as Record<string, unknown>)[midKey];
            if (deep && typeof deep === "object" && !Array.isArray(deep)) {
              for (const f of diagFields) {
                if ((deep as Record<string, unknown>)[f] !== undefined) diagLog[`${topKey}.${midKey}.${f}`] = (deep as Record<string, unknown>)[f];
              }
            }
          }
        }
      }
      console.log(`[clickbank-ipn] DIAG fields: ${JSON.stringify(diagLog)}`);
      // Log FULL decrypted payload (truncated) for field discovery
      try {
        const fullJson = JSON.stringify(result.payload);
        console.log(`[clickbank-ipn] FULL PAYLOAD (${fullJson.length} chars): ${fullJson.substring(0, 2000)}`);
        if (fullJson.length > 2000) console.log(`[clickbank-ipn] FULL PAYLOAD cont: ${fullJson.substring(2000, 4000)}`);
      } catch { /* ignore */ }
      // Replace rootPayload with decrypted data and continue processing
      rootPayload = result.payload;
    }

    // ── Extract transaction fields ──
    const payload = extractTransactionFields(rootPayload);

    const transactionType = String(
      payload.transactionType ||
        payload.transaction_type ||
        payload.ctransaction ||
        ""
    ).toUpperCase();

    console.log(`[clickbank-ipn] transactionType: "${transactionType}"`);

    // Only process SALE and BILL (rebill) transactions
    const validTypes = ["SALE", "BILL", "TEST_SALE", "TEST_BILL"];
    if (!validTypes.includes(transactionType)) {
      if (transactionType) {
        console.log(`[clickbank-ipn] Ignoring type: "${transactionType}"`);
      }
      return new Response(
        JSON.stringify({ ok: true, ignored: transactionType || "empty" }),
        { headers: h }
      );
    }

    const receipt = String(
      payload.receipt ||
        payload.cbreceipt ||
        payload.transaction_id ||
        payload.transactionId ||
        payload.order_id ||
        ""
    );
    if (!receipt) {
      return new Response(
        JSON.stringify({ error: "No receipt/order_id" }),
        { status: 400, headers: h }
      );
    }

    // Commission amount
    const totalAccountAmount = Number(
      payload.totalAccountAmount ||
        payload.totalaccountamount ||
        payload.affiliate_commission ||
        0
    );
    const totalOrderAmount = Number(
      payload.totalOrderAmount ||
        payload.totalorderamount ||
        payload.amount ||
        payload.ctransamount ||
        0
    );
    const amountUsd =
      totalAccountAmount > 0 ? totalAccountAmount : totalOrderAmount;

    // Convert to BRL — use daily rate from exchange_rate_log (single source of truth)
    // The rate is sourced from AwesomeAPI (dólar comercial brasileiro) to match UTMfy
    let usdToBrl = 5.15;
    try {
      const rateRes = await fetch(
        `${supabaseUrl}/rest/v1/exchange_rate_log?select=rate&order=created_at.desc&limit=1`,
        {
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
          },
        }
      );
      if (rateRes.ok) {
        const rows = await rateRes.json();
        if (rows?.[0]?.rate > 0) usdToBrl = Number(rows[0].rate);
      }
    } catch { /* fallback */ }

    // If no rate in DB, try AwesomeAPI (dólar comercial) — same source as UTMfy
    if (usdToBrl === 5.15) {
      try {
        const rateRes = await fetch(
          "https://economia.awesomeapi.com.br/json/last/USD-BRL",
          { signal: AbortSignal.timeout(3000) }
        );
        if (rateRes.ok) {
          const rateJson = await rateRes.json();
          const bid = parseFloat(rateJson?.USDBRL?.bid);
          if (bid > 0) usdToBrl = bid;
        }
      } catch { /* try next fallback */ }
    }

    // Last resort: fawazahmed0
    if (usdToBrl === 5.15) {
      try {
        const rateRes = await fetch(
          "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",
          { signal: AbortSignal.timeout(3000) }
        );
        if (rateRes.ok) {
          const rateJson = await rateRes.json();
          if (rateJson?.usd?.brl > 0) usdToBrl = rateJson.usd.brl;
        }
      } catch { /* use hardcoded fallback */ }
    }

    console.log(`[clickbank-ipn] Using exchange rate: ${usdToBrl}`);

    const revenueBrl = amountUsd * usdToBrl;

    // Product info
    const productTitle = String(
      payload.productTitle ||
        payload.product_title ||
        payload.cproditem ||
        ""
    );
    const vendor = String(payload.vendor || payload.cvendor || "");

    // ── Extract item name and quantity from lineItems (ClickBank v8/v6) ──
    // lineItems is an array of objects with itemNo, productTitle, quantity, etc.
    // Example: { itemNo: "NRDN06FE", productTitle: "NeuroDyne 6 Bottles", quantity: 1 }
    let itemName: string | null = null;
    let itemNo: string | null = null;

    const rawLineItems = rootPayload.lineItems as unknown[] | undefined;
    if (Array.isArray(rawLineItems) && rawLineItems.length > 0) {
      const fi = rawLineItems[0] as Record<string, unknown>;
      itemNo = String(fi.itemNo || fi.sku || "").trim() || null;
      itemName = String(fi.productTitle || fi.itemTitle || fi.product_title || itemNo || "").trim() || null;
      console.log(`[clickbank-ipn] lineItem: itemNo="${itemNo}", productTitle="${itemName}"`);
    }

    // Fallback: try root-level fields
    if (!itemName) {
      itemName = String(
        payload.cproditem || payload.productTitle || payload.product_title || ""
      ).trim() || null;
    }

    // ── Derive bottle quantity from SKU (itemNo) or productTitle ──
    // SKU pattern: NRDN06FE → 6, NRDN03FE → 3, NRDN02FE → 2
    // productTitle pattern: "NeuroDyne 6 Bottles" → 6
    function deriveQuantityFromSku(sku: string | null, title: string | null): number {
      // Try SKU first: extract digits from patterns like NRDN06FE
      if (sku) {
        const skuMatch = sku.match(/(\d{2})FE$/i);
        if (skuMatch) {
          const n = parseInt(skuMatch[1], 10);
          if (n === 6 || n === 3 || n === 2) return n;
        }
      }
      // Try productTitle: "NeuroDyne 6 Bottles"
      if (title) {
        const titleMatch = title.match(/(\d+)\s*Bottle/i);
        if (titleMatch) {
          const n = parseInt(titleMatch[1], 10);
          if (n === 6 || n === 3 || n === 2) return n;
        }
      }
      return 0; // Outros
    }
    const quantity = deriveQuantityFromSku(itemNo, itemName);
    console.log(`[clickbank-ipn] itemNo="${itemNo}", itemName="${itemName}", derivedQty=${quantity}, amountUsd=${amountUsd}`);

    // ── Extract affiliate nickname ──
    const affiliateNick = String(
      deepFind(rootPayload, ["affiliate", "caffitid", "aff_nickname"]) || ""
    ).toLowerCase().trim();

    // ── Extract affiliate sub params (campaign ID from UTM) ──
    const affSub2 = deepFind(rootPayload, ["aff_sub2", "affSub2", "affsub2"]);
    const affSub3 = deepFind(rootPayload, ["aff_sub3", "affSub3", "affsub3"]);

    // Also log what we found for diagnosis
    console.log(`[clickbank-ipn] affiliate="${affiliateNick}", aff_sub2="${affSub2}", aff_sub3="${affSub3}", vendor="${vendor}"`);

    // Campaign ID: prefer aff_sub3 (carries Meta campaign ID), fallback to aff_sub2
    const metaCampaignId = affSub3 || affSub2 || null;

    if (metaCampaignId) {
      console.log(`[clickbank-ipn] Campaign ID detected: ${metaCampaignId}`);
    }

    // Build AFFILIATE_TO_PROJECT dynamically from vendor configs
    // For nicknames with vendor_name specified, use "nickname::vendor" composite key
    const AFFILIATE_TO_PROJECT: Record<string, string> = {
      // Legacy static mappings as fallback
      guipires: "NDM",
      guipiresp: "NDM",
      gtxndr: "NDR",
      gtxndb: "NDB",
      gtxwl: "LDR",
    };
    // Build vendor-specific mapping: "nickname::vendor" → label
    const AFFILIATE_VENDOR_TO_PROJECT: Record<string, string> = {};
    // Overlay dynamic vendor configs (these take priority)
    for (const v of vendorConfigs) {
      if (v.vendor_name) {
        // Vendor-specific mapping (e.g. gtxndr selling for memoryon → MON)
        AFFILIATE_VENDOR_TO_PROJECT[`${v.nickname.toLowerCase()}::${v.vendor_name.toLowerCase()}`] = v.label;
      } else {
        AFFILIATE_TO_PROJECT[v.nickname] = v.label;
      }
    }

    // Map decryption key labels to projects (auto-built from vendor configs)
    const KEY_LABEL_TO_PROJECT: Record<string, string> = {};
    for (const v of vendorConfigs) {
      KEY_LABEL_TO_PROJECT[v.label] = v.label;
    }

    // ── AUTHORITATIVE project attribution via campaign name (aff_sub2 → meta_campaign_status) ──
    // The campaign name contains the real project tag (e.g. [NDB], [NDM], [CRT]).
    // This is MORE RELIABLE than affiliate nickname because projects can share affiliate accounts.
    let productName = "";
    let campaignBasedProject = "";

    if (metaCampaignId) {
      try {
        // Look up campaign name from aff_sub2 (or aff_sub3)
        const { data: campaignRow } = await supabase
          .from("meta_campaign_status")
          .select("campaign_name")
          .eq("campaign_id", String(metaCampaignId))
          .maybeSingle();

        if (campaignRow?.campaign_name) {
          const cname = campaignRow.campaign_name;
          console.log(`[clickbank-ipn] Campaign name from meta: "${cname}"`);
          // Extract project from bracket tags (same logic as projectUtils)
          const PROJECT_TAGS: [RegExp, string][] = [
            [/\[NDB2\]/i, "NDB2"],
            [/\[NDM\]/i, "NDM"],
            [/\[MEMO\]/i, "NDM"],
            [/\[NDN\]/i, "NDM"],
            [/\[NDR\]/i, "NDR"],
            [/\[MO\]|\[MON\]/i, "MO"],
            [/\[NDB\]/i, "NDB"],
            [/\[NEURO\]/i, "NDB"],
            [/\[ND\]/i, "NDB"],
            [/\[LDG\]/i, "LDR"],
            [/\[AILULA\]/i, "CRT"],
            [/\[CRT\]/i, "CRT"],
          ];
          for (const [re, code] of PROJECT_TAGS) {
            if (re.test(cname)) {
              campaignBasedProject = code;
              break;
            }
          }
          // Fallback: BM prefix without explicit project tag → NDM
          if (!campaignBasedProject && /\[(BM|BMV|BMGTX|BMHAVEN|BMLLC|BM\d)/i.test(cname)) {
            campaignBasedProject = "NDM";
          }
          if (campaignBasedProject) {
            console.log(`[clickbank-ipn] Project from campaign name: ${campaignBasedProject}`);
          }
        }
      } catch (e) {
        console.warn(`[clickbank-ipn] Campaign lookup failed:`, e);
      }
    }

    // Priority: affiliate+vendor combo > affiliate nickname > campaign name > decryption key
    // When one affiliate sells for multiple vendors, use the vendor name to disambiguate.
    const vendorLower = vendor.toLowerCase().trim();
    const compositeKey = `${affiliateNick}::${vendorLower}`;
    const vendorSpecificProject = AFFILIATE_VENDOR_TO_PROJECT[compositeKey] || "";
    const affiliateProject = AFFILIATE_TO_PROJECT[affiliateNick] || "";
    
    if (vendorSpecificProject) {
      productName = vendorSpecificProject;
      console.log(`[clickbank-ipn] Project from affiliate+vendor: ${vendorSpecificProject} (${compositeKey})`);
    } else if (affiliateProject) {
      productName = affiliateProject;
      console.log(`[clickbank-ipn] Project from affiliate nickname: ${affiliateProject} (nick=${affiliateNick})`);
    } else if (campaignBasedProject) {
      productName = campaignBasedProject;
      console.log(`[clickbank-ipn] Project from campaign name (fallback): ${campaignBasedProject}`);
    }

    // Fallback 1: Use the decryption key label when affiliate is unknown
    // Each Clickbank account uses its own secret key, so the key that decrypted
    // the payload reliably identifies which project the sale belongs to.
    if (!productName && decryptionKeyLabel) {
      const keyProject = KEY_LABEL_TO_PROJECT[decryptionKeyLabel];
      if (keyProject) {
        productName = keyProject;
        console.log(`[clickbank-ipn] Project from decryption key: ${keyProject} (key=${decryptionKeyLabel})`);
      }
    }

    // Fallback 2: check product title
    if (!productName) {
      if (/ndr/i.test(productTitle)) {
        productName = "NDR";
      } else if (/ndb/i.test(productTitle)) {
        productName = "NDB";
      } else if (/ndm|neurodyne|neuro/i.test(productTitle)) {
        productName = "NDM";
      } else if (/\bmo\b|mon|memoryon/i.test(productTitle)) {
        productName = "MO";
      } else if (/ldg|ldr|leandrops/i.test(productTitle)) {
        productName = "LDR";
      } else if (/crt|core\s*strange/i.test(productTitle)) {
        productName = "CRT";
      }
    }

    // Final fallback
    if (!productName) {
      productName = "Clickbank";
    }

    console.log(`[clickbank-ipn] Project attributed: ${productName} (affiliate: ${affiliateNick})`);

    // Transaction date — handle various Clickbank formats safely
    const txDate =
      payload.transactionTime ||
      payload.transaction_time ||
      payload.date ||
      null;
    let date = getBrasiliaDate();
    if (txDate) {
      try {
        const parsed = new Date(String(txDate));
        if (!isNaN(parsed.getTime())) {
          date = new Intl.DateTimeFormat("en-CA", {
            timeZone: "America/Sao_Paulo",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(parsed);
        } else {
          console.warn(`[clickbank-ipn] Unparseable date: "${txDate}", using today`);
        }
      } catch {
        console.warn(`[clickbank-ipn] Date parse error: "${txDate}", using today`);
      }
    }

     // IMPORTANT: Clickbank sales go ONLY to clickbank_audit. NEVER insert into sales_data.
     // RedTrack events are the authoritative source for UTM parameters in the War Room.
    // Resolve operation_id — use affiliate nickname → operation mapping first
    let resolvedOperationId: string | null = null;
    
    // Priority 1: affiliate nickname maps to a specific operation
    if (affiliateNick && nicknameToOperationId[affiliateNick]) {
      resolvedOperationId = nicknameToOperationId[affiliateNick];
      console.log(`[clickbank-ipn] Operation resolved via affiliate "${affiliateNick}": ${resolvedOperationId}`);
    }
    
    // Priority 2: vendor name maps to a specific operation (check all nicknames)
    if (!resolvedOperationId && vendor) {
      const vendorLower = vendor.toLowerCase().trim();
      if (nicknameToOperationId[vendorLower]) {
        resolvedOperationId = nicknameToOperationId[vendorLower];
        console.log(`[clickbank-ipn] Operation resolved via vendor "${vendorLower}": ${resolvedOperationId}`);
      }
    }
    
    // Fallback: pick the first active operation (legacy behavior)
    if (!resolvedOperationId) {
      try {
        const opRes = await fetch(
          `${supabaseUrl}/rest/v1/operations?status=eq.active&order=created_at.asc&limit=1&select=id`,
          { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
        );
        if (opRes.ok) {
          const ops = await opRes.json();
          if (ops.length > 0) resolvedOperationId = ops[0].id;
        }
      } catch (e) {
        console.warn("[clickbank-ipn] Could not resolve operation_id:", e);
      }
      console.log(`[clickbank-ipn] Operation resolved via fallback (first active): ${resolvedOperationId}`);
    }

    const auditRow = {
      receipt,
      transaction_type: transactionType,
      amount_usd: amountUsd,
      amount_brl: revenueBrl,
      product_name: productName,
      vendor: vendor || null,
      date,
      key_used: "IPN",
      meta_campaign_id: metaCampaignId,
      aff_sub2: affSub2 || null,
      aff_sub3: affSub3 || null,
      affiliate: affiliateNick || null,
      item_name: itemName,
      quantity,
      operation_id: resolvedOperationId,
    };

    const auditRes = await fetch(`${supabaseUrl}/rest/v1/clickbank_audit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify(auditRow),
    });

    if (!auditRes.ok) {
      const errText = await auditRes.text();
      console.error("[clickbank-ipn] Audit DB error:", errText);
    }

    console.log(
      `[clickbank-ipn] Audit: ${receipt} ${productName} $${amountUsd} → R$${revenueBrl.toFixed(2)}`
    );

    await logToDb(supabaseUrl, serviceKey, {
      integration: "clickbank",
      status: "success",
      message: `${transactionType}: ${receipt} ${productName} $${amountUsd} → R$${revenueBrl.toFixed(2)}`,
      records_processed: 1,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        receipt,
        product: productName,
        amountUsd,
        revenueBrl,
      }),
      { headers: h }
    );
  } catch (err) {
    const msg = (err as Error).message || "Unknown error";
    console.error("[clickbank-ipn] Error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: h,
    });
  }
});

// ── Helper: log to integration_logs ──
async function logToDb(
  supabaseUrl: string,
  serviceKey: string,
  data: { integration: string; status: string; message: string; records_processed: number }
) {
  try {
    await fetch(`${supabaseUrl}/rest/v1/integration_logs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify(data),
    });
  } catch {
    /* ignore */
  }
}
