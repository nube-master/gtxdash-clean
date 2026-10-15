import { createClient } from "npm:@supabase/supabase-js@2";
import { getRedTrackStandbyOps } from "../_shared/redtrack-standby.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function brDate(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function normalizeExcludedIds(value: unknown): Set<string> {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\n,;\s]+/)
      : [];
  return new Set(
    raw
      .map((item) => String(item || "").trim())
      .filter(Boolean),
  );
}

// ROY GROUP: upsells chegam com o mesmo clickid da venda principal; sem id único
// o upsert por redtrack_id fundiria o upsell na venda. Regra aplicada SOMENTE à ROY.
const ROY_OP_ID = "72951a45-5fa5-4cea-841e-6ec26fdf25a3";

function conversionIds(c: Record<string, unknown>): string[] {
  return [c.id, c._id, c.clickid, c.transaction_id, c.tid]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const h = { ...corsHeaders, "Content-Type": "application/json" };

  const reqUrl = new URL(req.url);
  const mode = reqUrl.searchParams.get("mode") || "sync";
  const operationIdParam = reqUrl.searchParams.get("operation_id");

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ success: false, error: "Missing SUPABASE env vars" }), { status: 500, headers: h });
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  // 1. Resolve API Key: Try operation_id param first, then fallback to global env
  let apiKey = Deno.env.get("REDTRACK_API_KEY") || "";
  let resolvedOpIdFromKey = null;

  if (operationIdParam) {
    const { data: opSetting } = await supabase
      .from("app_settings")
      .select("value")
      .eq("operation_id", operationIdParam)
      .eq("key", "redtrack_api_key")
      .maybeSingle();
    
    if (opSetting?.value) {
      apiKey = String(opSetting.value);
      resolvedOpIdFromKey = operationIdParam;
      console.log(`[pull-conversions] Using specific API Key for operation ${operationIdParam}`);
    }
  }

  if (!apiKey) {
    return new Response(JSON.stringify({ success: false, error: "REDTRACK_API_KEY not set" }), { status: 400, headers: h });
  }

  // --- TEST MODE ---
  if (mode === "test") {
    const testUrl = `https://api.redtrack.io/conversions?api_key=${encodeURIComponent(apiKey)}&date_from=${brDate()}&date_to=${brDate()}&per=1`;
    const r = await fetch(testUrl);
    const txt = await r.text();
    return new Response(
      JSON.stringify({
        success: r.status === 200,
        status: r.status,
        endpoint: "conversions",
        message: r.status === 200 ? "API OK" : `Error ${r.status}: ${txt.slice(0, 200)}`,
      }),
      { headers: h }
    );
  }

  // --- BACKFILL MODE (explicit date range) ---
  const explicitDateFrom = reqUrl.searchParams.get("date_from");
  const explicitDateTo = reqUrl.searchParams.get("date_to");
  const isBackfill = !!(explicitDateFrom && explicitDateTo);

  let excludedConversionIds = new Set<string>();
  try {
    const { data: excludedSetting } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "redtrack_excluded_conversion_ids")
      .maybeSingle();
    excludedConversionIds = normalizeExcludedIds(excludedSetting?.value);
    if (excludedConversionIds.size > 0) {
      console.log(`[pull-conversions] Excluding ${excludedConversionIds.size} RedTrack conversion ids`);
    }
  } catch (e) {
    console.warn("[pull-conversions] Could not load excluded conversion ids:", (e as Error).message);
  }

  // Operações com RedTrack em STANDBY (flag redtrack_standby) — não ingerimos eventos delas
  const standbyOps = await getRedTrackStandbyOps(supabase);
  let skippedStandby = 0;
  if (standbyOps.size > 0) {
    console.log(`[pull-conversions] RedTrack standby ops: ${[...standbyOps].join(", ")}`);
  }
  if (operationIdParam && standbyOps.has(operationIdParam)) {
    return new Response(JSON.stringify({ success: true, skipped: "redtrack_standby", operation_id: operationIdParam }), { status: 200, headers: h });
  }

  // Resolve operation_id: build a map from Meta account_id → operation_id
  // This ensures each conversion is attributed to the correct operation
  let defaultOperationId: string | null = null;
  const accountToOperationMap = new Map<string, string>();
  try {
    const { data: ops } = await supabase
      .from("operations")
      .select("id")
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1);
    if (ops && ops.length > 0) defaultOperationId = ops[0].id;

    // Build account → operation mapping from meta_ad_accounts
    const { data: metaAccounts } = await supabase
      .from("meta_ad_accounts")
      .select("account_id, operation_id")
      .eq("is_active", true);
    if (metaAccounts) {
      for (const acc of metaAccounts) {
        if (acc.operation_id) {
          accountToOperationMap.set(acc.account_id, acc.operation_id);
        }
      }
    }
    console.log(`[pull-conversions] Account→Operation map: ${accountToOperationMap.size} entries, default op: ${defaultOperationId}`);
  } catch { /* fallback to null */ }

  // --- INCREMENTAL SYNC MODE (default, cron) ---
  // Fetch last_redtrack_sync_at from app_settings
  let syncSince: string | null = null;
  if (!isBackfill) {
    const { data: settings } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", ["last_redtrack_sync_at", "last_redtrack_full_backfill_at"]);

    const settingsMap = new Map((settings || []).map((s: any) => [s.key, String(s.value).replace(/"/g, "")]));
    syncSince = settingsMap.get("last_redtrack_sync_at") || null;
    const lastFullBackfill = settingsMap.get("last_redtrack_full_backfill_at") || null;

    // If no previous sync, default to 3 minutes ago
    if (!syncSince) {
      syncSince = new Date(Date.now() - 3 * 60 * 1000).toISOString();
    }

    // Force full-day backfill if:
    // 1) syncSince is older than 10 minutes (original logic), OR
    // 2) last full backfill was more than 30 minutes ago (catch late Clickbank postbacks)
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
    const needsBackfillFromMarker = new Date(syncSince) < tenMinAgo;
    const needsPeriodicBackfill = !lastFullBackfill || new Date(lastFullBackfill) < thirtyMinAgo;

    if (needsBackfillFromMarker || needsPeriodicBackfill) {
      const reason = needsBackfillFromMarker ? "sync marker stale" : "periodic 30min backfill";
      console.log(`[pull-conversions] Full-day backfill triggered: ${reason}`);
      syncSince = null; // disable time filtering, fetch all for the date range
    }
  }

  const dateFrom = isBackfill ? explicitDateFrom! : brDate();
  const dateTo = isBackfill ? explicitDateTo! : brDate();

  let page = 1;
  const isFullDaySync = !isBackfill && !syncSince; // triggered when marker was too old
  const perPage = (isBackfill || isFullDaySync) ? 500 : 100;
  let totalFetched = 0;
  let totalUpserted = 0;
  let totalErrors = 0;
  let latestOccurredAt: string | null = null;

  try {
    // Timeout guard: max 5s for incremental, 25s for backfill
    const maxMs = (isBackfill || isFullDaySync) ? 25000 : 5000;
    const startTime = Date.now();

    while (true) {
      if (Date.now() - startTime > maxMs) {
        console.log(`Timeout reached after ${Date.now() - startTime}ms, stopping.`);
        break;
      }

      const url = `https://api.redtrack.io/conversions?api_key=${encodeURIComponent(apiKey)}&date_from=${dateFrom}&date_to=${dateTo}&per=${perPage}&page=${page}`;
      const resp = await fetch(url);
      if (resp.status !== 200) {
        const errTxt = await resp.text();
        throw new Error(`RedTrack API error ${resp.status}: ${errTxt.slice(0, 300)}`);
      }

      const rawBody = await resp.text();
      let data: Record<string, unknown>[];
      try {
        const parsed = JSON.parse(rawBody);
        if (Array.isArray(parsed)) data = parsed;
        else if (parsed?.items && Array.isArray(parsed.items)) data = parsed.items;
        else if (parsed?.data && Array.isArray(parsed.data)) data = parsed.data;
        else if (parsed?.conversions && Array.isArray(parsed.conversions)) data = parsed.conversions;
        else data = [];
      } catch {
        data = [];
      }
      if (data.length === 0) break;

      // For incremental: filter only events newer than syncSince
      let filtered = data;
      if (!isBackfill && syncSince) {
        const sinceMs = new Date(syncSince).getTime();
        filtered = data.filter((c) => {
          const t = c.conv_time as string || c.postback_timestamp as string || c.date as string || "";
          return t ? new Date(t).getTime() > sinceMs : true;
        });
      }

      if (excludedConversionIds.size > 0) {
        const before = filtered.length;
        filtered = filtered.filter((c) => !conversionIds(c).some((id) => excludedConversionIds.has(id)));
        const removed = before - filtered.length;
        if (removed > 0) console.log(`[pull-conversions] Skipped ${removed} excluded RedTrack conversions`);
      }

      totalFetched += filtered.length;

      if (filtered.length > 0) {
        const rows = filtered.map((c) => {
          const convTime = c.conv_time as string || c.postback_timestamp as string || c.date as string || new Date().toISOString();
          const payout = Number(c.payout) || 0;
          const payoutDefault = Number(c.payout_default) || payout;
          let amount = payoutDefault > 0 ? payoutDefault : payout;
          // Front-end commission cap: RedTrack/CartPanda às vezes envia o total do pedido (com upsells) no payout_default.
          // Regra Core do projeto: front-end USD 200-260. Acima de USD 300 é upsell/order bump → trava em USD 235 (comissão padrão).
          // ROY upsell: o valor É o upsell em si — não aplicar o teto de front-end
          const royUpsellEarly =
            (String(c.type || "").toLowerCase() === "upsell" || String(c.status || "").toLowerCase() === "upsell") &&
            apiKey.startsWith("EukqYME7");
          if (amount > 300 && !royUpsellEarly) {
            console.warn(`[pull-conversions] Capping inflated amount USD ${amount} → 235 (clickid=${c.clickid}, offer=${c.offer})`);
            amount = 235;
          }

          // Track latest occurred_at
          if (!latestOccurredAt || convTime > latestOccurredAt) {
            latestOccurredAt = convTime;
          }

          const rtType = String(c.type || "").toLowerCase();
          const rtStatus = String(c.status || "").toLowerCase();
          const isTransaction = Number(c.is_transaction) === 1 || c.is_transaction === true;

          // Default classification by type/status
          let eventType: string;
          if (rtType === "initiatecheckout" || rtType === "initiate_checkout" || rtStatus === "ic" || rtStatus === "initiate_checkout") {
            eventType = "initiate_checkout";
          } else if (rtType === "upsell" || rtStatus === "upsell") {
            eventType = "upsell";
          } else if (rtType === "presellview" || rtType === "presell_view" || rtStatus === "presellview") {
            eventType = "presell_view";
          } else if (rtType === "vslview" || rtType === "vsl_view" || rtStatus === "vslview") {
            eventType = "vsl_view";
          } else if (rtType === "lead" || rtStatus === "lead") {
            eventType = "lead";
          } else if (rtType === "viewcontent" || rtType === "view_content") {
            eventType = "view_content";
          } else if (rtType === "purchase" || rtStatus === "purchase" || rtStatus === "approved" || rtStatus === "sale") {
            eventType = "purchase";
          } else {
            // Unknown type → only treat as purchase if it's an actual financial transaction
            eventType = isTransaction || payout > 0 ? "purchase" : (rtType || "event");
          }

          // Hard guard: a 'purchase' MUST be a real transaction (is_transaction=1 OR payout>0)
          // Prevents PRESELLView/VSLView/Lead being misclassified as purchase by upstream payload quirks
          if (eventType === "purchase" && !isTransaction && payout <= 0 && payoutDefault <= 0) {
            // Fallback: try to derive from raw type, otherwise mark as generic event
            if (rtType === "presellview" || rtType === "presell_view") eventType = "presell_view";
            else if (rtType === "vslview" || rtType === "vsl_view") eventType = "vsl_view";
            else if (rtType === "lead") eventType = "lead";
            else eventType = rtType || "event";
          }

          const redtrackId = (c.id as string) || (c._id as string) || (c.clickid as string) || null;
          const offerName = (c.offer as string) || (c.offer_name as string) || null;

          // Detect non-Meta native traffic sources (MGID/Sphere, Native, etc.)
          // These use RedTrack subs with completely different semantics than Meta.
          // Mapping subs as Meta would corrupt utm_* and meta_*_id fields.
          const rawSource = String((c.source as string) || (c.network as string) || "").trim();
          const rawCampaign = String((c.campaign as string) || "").trim();
          const sourceUpper = rawSource.toUpperCase();
          const isMgid = sourceUpper === "MGID" || sourceUpper === "SPHERE" || /^MGID\s*\|/i.test(rawCampaign);
          const isNative = sourceUpper === "NATIVE" || sourceUpper.includes("NATIVE");
          const isNonMetaNative = isMgid || isNative;

          let utmCampaign: string | null;
          let utmMedium: string | null;
          let utmContent: string | null;
          let utmTerm: string | null;
          let metaAdId: string | null;
          let metaCampaignId: string | null;
          let metaAdsetId: string | null;
          let utmSourceRaw: string | null;

          if (isNonMetaNative) {
            // MGID/Sphere schema: sub1=teaser, sub2=campaign, sub3=widget,
            // sub5=country, sub6=site placement, sub9=region
            utmSourceRaw = isMgid ? "MGID" : (rawSource || "native");
            utmCampaign = rawCampaign || (c.sub2 as string) || null;
            utmMedium = "native";
            utmContent = (c.sub1 as string) || null; // teaser id
            utmTerm = (c.sub6 as string) || null;    // site placement
            metaAdId = null;
            metaCampaignId = null;
            metaAdsetId = null;
          } else {
            // Meta schema (default) — unchanged
            utmCampaign = (c.sub6 as string) || null;
            utmMedium = ((c.sub5 as string) || "").replace(/\|[\d]+$/, "") || null;
            utmContent = (c.sub4 as string) || null;
            utmTerm = (c.sub10 as string) || null;
            metaAdId = (c.sub1 as string) || null;
            metaCampaignId = (c.sub2 as string) || null;
            metaAdsetId = (c.sub3 as string) || null;

            // Fallback: when sub6 is empty but sub10 has data (ad_name|ad_id format)
            if (!utmCampaign && utmTerm) {
              const pipeIdx = utmTerm.lastIndexOf("|");
              if (pipeIdx > 0) {
                const adNamePart = utmTerm.substring(0, pipeIdx).trim();
                const adIdPart = utmTerm.substring(pipeIdx + 1).trim();
                if (!utmContent && adNamePart) utmContent = adNamePart;
                if (!metaAdId && /^\d+$/.test(adIdPart)) metaAdId = adIdPart;
              } else if (!utmContent) {
                utmContent = utmTerm;
              }
            }

            utmSourceRaw = (c.sub9 as string) || null;
          }

          // Resolve operation_id from utm_source (FB_<account_id>) → meta_ad_accounts mapping
          let resolvedOperationId = resolvedOpIdFromKey || defaultOperationId;
          
          if (!resolvedOpIdFromKey && utmSourceRaw && !isNonMetaNative) {
            const accIdMatch = utmSourceRaw.match(/^FB_(\d+)$/);
            if (accIdMatch) {
              const mappedOp = accountToOperationMap.get(accIdMatch[1]);
              if (mappedOp) resolvedOperationId = mappedOp;
            }
          }

          // FINAL FALLBACK FOR FAHTO MEDIA (Global RedTrack account without tags)
          if (!resolvedOperationId && apiKey) {
            const fahtoOpId = "8707b3f8-ab41-4a63-902c-9ab97fe50c8a";
            if (apiKey.startsWith("qU9HO")) {
               resolvedOperationId = fahtoOpId;
            }
          }

          // ROY only: upsell recebe id próprio para não colapsar na venda principal
          let finalRedtrackId = redtrackId;
          if (eventType === "upsell" && resolvedOperationId === ROY_OP_ID && redtrackId) {
            const suffix = (c.transaction_id as string) || (c.tid as string) || convTime;
            finalRedtrackId = `${redtrackId}-upsell-${suffix}`;
          }

          return {
            redtrack_id: finalRedtrackId,
            occurred_at: convTime,
            event_type: eventType,
            amount,
            currency: (c.currency as string) || "USD",
            status: (rtStatus === "approved" || rtStatus === "other" || rtStatus === "sale" || rtStatus === "purchase") ? "approved" : rtStatus || "approved",
            offer_name: offerName,
            product_name: offerName || "Clickbank",
            clickid: c.clickid as string || null,
            tid: c.tid as string || null,
            transaction_id: c.transaction_id as string || null,
            utm_source: utmSourceRaw,
            utm_campaign: utmCampaign,
            utm_medium: utmMedium,
            utm_content: utmContent,
            utm_term: utmTerm,
            meta_campaign_id: metaCampaignId,
            meta_adset_id: metaAdsetId,
            meta_ad_id: metaAdId,
            device: c.device_type as string || (c.device as string) || null,
            browser: c.browser as string || null,
            os: c.os as string || null,
            country: (c.country as string) || (c.geo as string) || null,
            city: c.city as string || null,
            raw_payload: c,
            operation_id: resolvedOperationId,
          };
        });


        // Operações com RedTrack em STANDBY não recebem ingestão (ex.: GTX desde 29/08/2026)
        const validRows = rows.filter((r) => {
          if (!r.redtrack_id) return false;
          if (r.operation_id && standbyOps.has(String(r.operation_id))) {
            skippedStandby += 1;
            return false;
          }
          return true;
        });

        if (validRows.length > 0) {
          const { error } = await supabase
            .from("redtrack_events")
            .upsert(validRows, { onConflict: "redtrack_id", ignoreDuplicates: false });

          if (error) {
            console.error("Upsert error:", error.message);
            totalErrors += validRows.length;
          } else {
            totalUpserted += validRows.length;
          }
        }
      }

      // For incremental: only 1 page (small window), no pagination needed
      if (!isBackfill && !isFullDaySync) break;

      if (data.length < perPage) break;
      page++;
      if (page > 20) break;
    }

    // Save last_redtrack_sync_at on success
    if (totalErrors === 0) {
      const newSyncAt = latestOccurredAt || new Date().toISOString();
      const upserts: any[] = [
        { key: "last_redtrack_sync_at", value: JSON.stringify(newSyncAt) },
      ];
      // If this was a full-day sync, update the backfill marker too
      if (isBackfill || isFullDaySync) {
        upserts.push({ key: "last_redtrack_full_backfill_at", value: JSON.stringify(new Date().toISOString()) });
      }
      await supabase
        .from("app_settings")
        .upsert(upserts, { onConflict: "key" });
    }

    // Log only if we actually fetched something, or it's a backfill
    if (isBackfill || totalFetched > 0) {
      await supabase.from("integration_logs").insert({
        integration: "redtrack",
        status: totalErrors > 0 ? "error" : "success",
        records_processed: totalUpserted,
        message: isBackfill
          ? `Backfill ${dateFrom} → ${dateTo}: fetched=${totalFetched} upserted=${totalUpserted} errors=${totalErrors}`
          : `Incremental: fetched=${totalFetched} upserted=${totalUpserted} new=${totalUpserted}`,
      });
    }

    return new Response(
      JSON.stringify({
        success: totalErrors === 0,
        mode: isBackfill ? "backfill" : "incremental",
        date_from: dateFrom,
        date_to: dateTo,
        fetched: totalFetched,
        upserted: totalUpserted,
        errors: totalErrors,
        pages: page,
      }),
      { headers: h }
    );
  } catch (err) {
    const msg = (err as Error).message || "Unknown error";
    console.error("pull-conversions error:", msg);

    try {
      await supabase.from("integration_logs").insert({
        integration: "redtrack",
        status: "error",
        records_processed: totalUpserted,
        message: `Sync error: ${msg}`,
      });
    } catch (_) { /* ignore */ }

    return new Response(
      JSON.stringify({ success: false, error: msg, fetched: totalFetched, upserted: totalUpserted }),
      { status: 500, headers: h }
    );
  }
});
