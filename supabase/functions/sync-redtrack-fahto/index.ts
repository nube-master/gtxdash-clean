// sync-redtrack-fahto
// Polling da API RedTrack (GET /conversions) para a operação FAHTO.
// PADRONIZADO: Agora grava em redtrack_events para ser consumido pelo sync-redtrack-sales global.
// 2026-08-22: Adicionado extractProjectCode para persistir project_slug e backfill melhorado.


import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FAHTO_OPERATION_ID = "8707b3f8-ab41-4a63-902c-9ab97fe50c8a";

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

function pick(o: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = o[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v);
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const h = { ...corsHeaders, "Content-Type": "application/json" };

  const url = new URL(req.url);
  const dateFrom = url.searchParams.get("date_from") || brDate(3);
  const dateTo = url.searchParams.get("date_to") || brDate(0);


  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  );

  let apiKey = "";
  const { data: setting } = await supabase
    .from("app_settings")
    .select("value")
    .eq("operation_id", FAHTO_OPERATION_ID)
    .eq("key", "redtrack_api_key")
    .maybeSingle();
  if (setting?.value) apiKey = String(setting.value).replace(/^"|"$/g, "");
  if (!apiKey) apiKey = Deno.env.get("REDTRACK_API_KEY_FAHTO") || "";
  if (!apiKey) {
    return new Response(JSON.stringify({ success: false, error: "RedTrack API key FAHTO não configurada" }), { status: 400, headers: h });
  }

  const perPage = 500;
  let page = 1;
  let fetched = 0;
  let upserted = 0;
  const errors: string[] = [];

  while (page <= 20) {
    const api = `https://api.redtrack.io/conversions?api_key=${encodeURIComponent(apiKey)}&date_from=${dateFrom}&date_to=${dateTo}&per=${perPage}&page=${page}`;
    let res = await fetch(api);
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 5000));
      res = await fetch(api);
    }
    if (!res.ok) break;

    const json = await res.json();
    const items: Record<string, unknown>[] = Array.isArray(json) ? json : (json?.items || json?.data || []);
    if (!items.length) break;

    fetched += items.length;

    const rows = items
      .filter((c) => {
        const type = (pick(c, "type", "event_type") || "").toLowerCase();
        const isPurchase = type.includes("purchase") || type === "sale" || type === "conversion";
        return isPurchase;
      })
      .map((c) => {
        const rtId = pick(c, "id", "_id", "transaction_id", "tid", "clickid") || crypto.randomUUID();
        const convRaw = pick(c, "conv_time", "created_at", "date", "postback_time", "click_time");
        let convTime = new Date().toISOString();
        if (convRaw) {
          const parsed = new Date(/^\d+$/.test(convRaw) ? Number(convRaw) * 1000 : convRaw);
          if (!isNaN(parsed.getTime())) convTime = parsed.toISOString();
        }

        return {
          operation_id: FAHTO_OPERATION_ID,
          redtrack_id: rtId,
          clickid: pick(c, "clickid", "click_id"),
          transaction_id: pick(c, "transaction_id", "external_id", "order_id"),
          amount: Number(pick(c, "payout", "revenue", "amount") || 0),
          currency: "USD",
          event_type: "purchase",
          status: "approved",
          offer_name: pick(c, "offer", "offer_name"),
          product_name: pick(c, "product", "product_name"),
          utm_source: pick(c, "source", "rt_source", "traffic_source"),
          utm_campaign: pick(c, "campaign", "campaign_name", "rt_campaign", "sub6"),
          utm_medium: pick(c, "rt_medium", "sub10"),
          utm_content: pick(c, "rt_ad", "sub4"),
          utm_term: pick(c, "rt_placement", "sub7"),
          country: pick(c, "country", "geo"),
          city: pick(c, "city"),
          os: pick(c, "os"),
          device: pick(c, "device_fullname", "device"),
          browser: pick(c, "browser"),
          occurred_at: convTime,
          raw_payload: c,
        };
      });

    if (rows.length) {
      const { error } = await supabase
        .from("redtrack_events")
        .upsert(rows, { onConflict: "redtrack_id" });
      if (error) errors.push(`upsert page ${page}: ${error.message}`);
      else upserted += rows.length;
    }

    if (items.length < perPage) break;
    page++;
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(`[sync-redtrack-fahto] ${dateFrom}..${dateTo} fetched=${fetched} upserted=${upserted}`);

  return new Response(
    JSON.stringify({ success: errors.length === 0, date_from: dateFrom, date_to: dateTo, fetched, upserted, errors }),
    { headers: h },
  );
});