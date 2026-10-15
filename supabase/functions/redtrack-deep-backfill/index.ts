import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// RedTrack /conversions caps any single query at 4 pages (max ~4000 rows, newest first).
// Contas com muito evento de VSL (VturbPlay/VturbPitch) estouram esse teto e as
// compras das primeiras horas do dia nunca chegam. Solução: fatiar por campaign_id.
const MAX_PAGES = 4;
const PER = 1000;

type Row = Record<string, unknown>;

function parseList(txt: string): Row[] {
  try {
    const parsed = JSON.parse(txt);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.items)) return parsed.items;
    if (Array.isArray(parsed?.data)) return parsed.data;
    if (Array.isArray(parsed?.conversions)) return parsed.conversions;
    return [];
  } catch {
    return [];
  }
}

function classify(c: Row): string {
  const rtType = String(c.type || "").toLowerCase();
  const rtStatus = String(c.status || "").toLowerCase();
  const payout = Number(c.payout) || 0;
  const payoutDefault = Number(c.payout_default) || payout;
  const isTransaction = Number(c.is_transaction) === 1 || c.is_transaction === true;

  let eventType: string;
  if (rtType === "initiatecheckout" || rtType === "initiate_checkout" || rtStatus === "ic") eventType = "initiate_checkout";
  else if (rtType === "upsell" || rtStatus === "upsell") eventType = "upsell";
  else if (rtType === "presellview" || rtType === "presell_view") eventType = "presell_view";
  else if (rtType === "vslview" || rtType === "vsl_view") eventType = "vsl_view";
  else if (rtType === "vturbplay") eventType = "vturbplay";
  else if (rtType === "vturbpitch") eventType = "vturbpitch";
  else if (rtType === "lead" || rtStatus === "lead") eventType = "lead";
  else if (rtType === "viewcontent" || rtType === "view_content") eventType = "view_content";
  else if (rtType === "purchase" || rtStatus === "purchase" || rtStatus === "approved" || rtStatus === "sale") eventType = "purchase";
  else eventType = isTransaction || payout > 0 ? "purchase" : (rtType || "event");

  // Guarda dura: purchase precisa ser transação real
  if (eventType === "purchase" && !isTransaction && payout <= 0 && payoutDefault <= 0) {
    eventType = rtType || "event";
  }
  return eventType;
}

function mapRow(c: Row, operationId: string) {
  const convTime = (c.conv_time as string) || (c.postback_timestamp as string) || (c.date as string) || new Date().toISOString();
  const payout = Number(c.payout) || 0;
  const payoutDefault = Number(c.payout_default) || payout;
  let amount = payoutDefault > 0 ? payoutDefault : payout;
  if (amount > 300) amount = 235; // cap front-end (regra Core)

  const rtStatus = String(c.status || "").toLowerCase();
  const offerName = (c.offer as string) || (c.offer_name as string) || null;
  const rawSource = String((c.source as string) || (c.network as string) || "").trim().toUpperCase();
  const isNonMetaNative = rawSource === "MGID" || rawSource === "SPHERE" || rawSource.includes("NATIVE");

  return {
    redtrack_id: (c.id as string) || (c._id as string) || (c.clickid as string) || null,
    occurred_at: convTime,
    event_type: classify(c),
    amount,
    currency: (c.currency as string) || "USD",
    status: (rtStatus === "approved" || rtStatus === "other" || rtStatus === "sale" || rtStatus === "purchase") ? "approved" : rtStatus || "approved",
    offer_name: offerName,
    product_name: offerName || "RedTrack",
    clickid: (c.clickid as string) || null,
    tid: (c.tid as string) || null,
    transaction_id: (c.transaction_id as string) || null,
    utm_source: isNonMetaNative ? rawSource : ((c.sub9 as string) || null),
    utm_campaign: isNonMetaNative ? ((c.campaign as string) || null) : ((c.sub6 as string) || null),
    utm_medium: isNonMetaNative ? "native" : (((c.sub5 as string) || "").replace(/\|[\d]+$/, "") || null),
    utm_content: isNonMetaNative ? ((c.sub1 as string) || null) : ((c.sub4 as string) || null),
    utm_term: isNonMetaNative ? ((c.sub6 as string) || null) : ((c.sub10 as string) || null),
    meta_campaign_id: isNonMetaNative ? null : ((c.sub2 as string) || null),
    meta_adset_id: isNonMetaNative ? null : ((c.sub3 as string) || null),
    meta_ad_id: isNonMetaNative ? null : ((c.sub1 as string) || null),
    device: (c.device_type as string) || (c.device as string) || null,
    browser: (c.browser as string) || null,
    os: (c.os as string) || null,
    country: (c.country as string) || (c.geo as string) || null,
    city: (c.city as string) || null,
    raw_payload: c,
    operation_id: operationId,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const h = { ...corsHeaders, "Content-Type": "application/json" };

  const url = new URL(req.url);
  const operationId = url.searchParams.get("operation_id") || "";
  const dateFrom = url.searchParams.get("date_from") || "";
  const dateTo = url.searchParams.get("date_to") || dateFrom;
  const budgetMs = Number(url.searchParams.get("budget_ms") || 110000);

  if (!operationId || !dateFrom) {
    return new Response(JSON.stringify({ success: false, error: "operation_id e date_from são obrigatórios" }), { status: 400, headers: h });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");

  const { data: setting } = await supabase
    .from("app_settings")
    .select("value")
    .eq("operation_id", operationId)
    .eq("key", "redtrack_api_key")
    .maybeSingle();

  const apiKey = String(setting?.value || Deno.env.get("REDTRACK_API_KEY") || "").replace(/"/g, "");
  if (!apiKey) {
    return new Response(JSON.stringify({ success: false, error: "RedTrack API key não configurada para esta operação" }), { status: 400, headers: h });
  }

  const started = Date.now();
  const base = `https://api.redtrack.io/conversions?api_key=${encodeURIComponent(apiKey)}&date_from=${dateFrom}&date_to=${dateTo}&per=${PER}`;

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const fetchPages = async (extra = ""): Promise<Row[]> => {
    const out: Row[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      if (Date.now() - started > budgetMs) break;
      let rows: Row[] | null = null;
      for (let attempt = 0; attempt < 3 && rows === null; attempt++) {
        if (attempt > 0) await sleep(1500 * attempt);
        const resp = await fetch(`${base}&page=${page}${extra}`);
        if (resp.status === 200) rows = parseList(await resp.text());
        else await resp.text().catch(() => "");
      }
      if (rows === null) break;
      out.push(...rows);
      if (rows.length < PER) break;
      await sleep(400);
    }
    return out;
  };


  const seen = new Set<string>();
  let upserted = 0;
  let purchaseCount = 0;
  let purchaseAmount = 0;

  const flush = async (rows: Row[]) => {
    const mapped: any[] = [];
    for (const r of rows) {
      const key = String(r.id || r._id || r.clickid || "");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const row = mapRow(r, operationId);
      if (!row.redtrack_id) continue;
      if (row.event_type === "purchase") {
        purchaseCount++;
        purchaseAmount += Number(row.amount || 0);
      }
      mapped.push(row);
    }
    for (let i = 0; i < mapped.length; i += 500) {
      const chunk = mapped.slice(i, i + 500);
      const { error } = await supabase.from("redtrack_events").upsert(chunk, { onConflict: "redtrack_id", ignoreDuplicates: false });
      if (error) throw new Error(error.message);
      upserted += chunk.length;
    }
  };

  try {
    // Fase 1: varredura geral (últimos 4000 eventos) só para descobrir as campanhas ativas no dia
    const discovery = await fetchPages();
    const campaignIds = new Set<string>();
    for (const r of discovery) {
      const id = String(r.campaign_id || "").trim();
      if (id) campaignIds.add(id);
    }
    const discoveryRows = discovery.length;
    await flush(discovery);
    discovery.length = 0;

    // Fase 2: refaz a busca fatiada por campanha (cada fatia tem seu próprio teto de 4000)
    let campaignsScanned = 0;
    for (const cid of campaignIds) {
      if (Date.now() - started > budgetMs) break;
      const rows = await fetchPages(`&campaign_id=${encodeURIComponent(cid)}`);
      campaignsScanned++;
      await flush(rows);
      rows.length = 0;
    }

    await supabase.from("integration_logs").insert({
      integration: "redtrack",
      status: "success",
      records_processed: upserted,
      message: `Deep backfill ${dateFrom}→${dateTo}: campanhas=${campaignsScanned}/${campaignIds.size} eventos=${upserted} compras=${purchaseCount}`,
      operation_id: operationId,
    });


    return new Response(
      JSON.stringify({
        success: true,
        date_from: dateFrom,
        date_to: dateTo,
        discovery_rows: discoveryRows,
        campaigns_found: campaignIds.size,
        campaigns_scanned: campaignsScanned,
        unique_events: seen.size,
        purchases: purchaseCount,
        purchases_amount: purchaseAmount,

        upserted,
        elapsed_ms: Date.now() - started,
      }),
      { headers: h },
    );
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: (err as Error).message }), { status: 500, headers: h });
  }
});
