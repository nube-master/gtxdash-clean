// sync-redtrack-sales
// Lê redtrack_events (purchase/upsell/sale com amount > 0) e faz upsert em sales_data
// classificando automaticamente:
//   - store: 'cartpanda' | 'clickbank' | 'buygoods' | 'digistore' | 'redtrack_unknown'
//   - product_name: código curto via offer_name ("| Plataforma | PROJETO | ...")
// Webhooks oficiais (CartPanda/ClickBank/Digistore) continuam tendo prioridade:
// usamos order_id distinto (prefixo "rt:") para nunca colidir com webhooks.

import { createClient } from "npm:@supabase/supabase-js@2";
import { mirrorSaleToWebPush } from "../_shared/push-mirror.ts";
import { getRedTrackStandbyOps } from "../_shared/redtrack-standby.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function brDate(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Escolhe o melhor nome de campanha entre sub6 (nome real da campanha Meta),
 * o campo campaign do RedTrack (correto para MGID/Newsbreak) e utm_campaign.
 * Regra: prioriza valor com tags [..]; ignora domínios puros (ex.: "site.com").
 */
function bestCampaignName(...candidates: (string | null | undefined)[]): string | null {
  const isDomain = (v: string) => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(v);
  // remove sufixo " | dominio.tld" que o RedTrack cola no nome da própria campanha
  const strip = (v: string) => v.replace(/\s*\|\s*[a-z0-9.-]+\.[a-z]{2,}\s*$/i, "").trim();

  const clean = candidates
    .map((c) => (typeof c === "string" ? strip(c) : ""))
    .filter((c) => c.length > 0);
  if (!clean.length) return null;

  const tagged = clean.filter((v) => /\[[^\]]+\]/.test(v) && !isDomain(v));
  if (tagged.length) {
    // Entre os "tagueados", prefere o mais descritivo (mais tags)
    tagged.sort((a, b) => (b.match(/\[/g)?.length ?? 0) - (a.match(/\[/g)?.length ?? 0));
    return tagged[0];
  }
  const nonDomain = clean.find((v) => !isDomain(v));
  return nonDomain ?? clean[0];
}




/** Vendor → store mapping (offers.vendor → sales_data.store) */
const VENDOR_TO_STORE: Record<string, { store: string; label: string }> = {
  clickbank: { store: "clickbank", label: "ClickBank" },
  cartpanda: { store: "cartpanda", label: "CartPanda" },
  buygoods: { store: "buygoods", label: "BuyGoods" },
  digistore: { store: "digistore", label: "Digistore24" },
  hotmart: { store: "hotmart", label: "Hotmart" },
  kiwify: { store: "kiwify", label: "Kiwify" },
  monetizze: { store: "monetizze", label: "Monetizze" },
};

type OfferLite = { apelido: string; apelidoUpper: string; vendor: string };

/** Find an offer whose apelido_interno appears anywhere in the given strings (bracket or |segment) */
function findOfferMatch(offers: OfferLite[], ...sources: (string | null | undefined)[]): OfferLite | null {
  const haystack = sources.filter(Boolean).join(" | ").toUpperCase();
  if (!haystack) return null;
  // Match apelido as a standalone token (word boundary) to avoid "MO" matching "MORE"
  for (const o of offers) {
    const escaped = o.apelidoUpper.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
    const re = new RegExp(`(^|[^A-Z0-9_])${escaped}([^A-Z0-9_]|$)`);
    if (re.test(haystack)) return o;
  }
  return null;
}

/** Classify checkout platform from RedTrack offer_name "Source | Platform | Project | ..." with offers fallback */
function resolvePlatform(
  offerName: string | null | undefined,
  utmCampaign: string | null | undefined,
  offers: OfferLite[],
): {
  store: string;
  label: string;
  trafficSource: string;
} {
  const offer = (offerName || "").trim();
  const segs = offer.split("|").map((s) => s.trim().toLowerCase());
  const trafficSource = segs[0] || "";
  
  // 1) Detect platform from offer_name segments
  if (offer) {
    const plat = segs[1] || "";
    if (plat.includes("cartpanda")) return { store: "cartpanda", label: "CartPanda", trafficSource };
    if (plat.includes("buygoods")) return { store: "buygoods", label: "BuyGoods", trafficSource };
    if (plat.includes("digistore")) return { store: "digistore", label: "Digistore24", trafficSource };
    if (plat.includes("clickbank")) return { store: "clickbank", label: "ClickBank", trafficSource };
    
    // EXPLICIT COD DETECTION
    if (
      plat.includes("cod") || 
      plat.includes("sphere") || 
      plat.includes("auravita") || 
      plat.includes("vitalis") ||
      plat.includes("fahto") ||
      plat.includes("xperi") ||
      plat.includes("fato")
    ) {
      return { store: "sphere", label: "Sphere (COD)", trafficSource };
    }

    if (plat.includes("h&w") || plat.includes("h & w") || plat === "hw" || (plat.includes("health") && plat.includes("wellness"))) {
      return { store: "h&w", label: "H&W", trafficSource };
    }
  }

  // 2) Detect from utm_campaign tags (e.g., [COD])
  const camp = (utmCampaign || "").toUpperCase();
  if (
    camp.includes("[COD]") || 
    camp.includes("[SPHERE]") || 
    camp.includes("[AURAVITA]") || 
    camp.includes("[VITALIS]") ||
    camp.includes("[FAHTO]") ||
    camp.includes("[XPERI]") ||
    camp.includes("[FATO]")
  ) {
    return { store: "sphere", label: "Sphere (COD)", trafficSource };
  }

  // Fallback: try to match against configured offers (apelido_interno)
  const matched = findOfferMatch(offers, offerName, utmCampaign);
  if (matched) {
    const mapped = VENDOR_TO_STORE[matched.vendor];
    if (mapped) return { ...mapped, trafficSource };
  }
  return { store: "redtrack_unknown", label: "Indefinido", trafficSource };
}

/** Tráfegos sem fonte autoritativa de receita (IPN/webhook não captura) — precisam de fallback RedTrack mesmo em ClickBank */
function isFallbackTrafficSource(trafficSource: string): boolean {
  const ts = (trafficSource || "").toLowerCase();
  return ts.includes("newsbreak") || ts.includes("news_break") || ts.includes("news break") || ts.includes("mgid");
}

/** Retorna o slug do canal fallback derivado do trafficSource (ex: newsbreak, mgid) */
function fallbackChannelSlug(trafficSource: string): string | null {
  const ts = (trafficSource || "").toLowerCase();
  if (ts.includes("mgid")) return "mgid";
  if (ts.includes("newsbreak") || ts.includes("news_break") || ts.includes("news break")) return "newsbreak";
  return null;
}

/** Pattern-based product detection on offer_name third segment, with offers fallback */
function resolveProduct(
  offerName: string | null | undefined,
  productName: string | null | undefined,
  utmCampaign: string | null | undefined,
  offers: OfferLite[],
): string {
  // 1) Offer apelido bracket match (highest priority — user-configured)
  const matched = findOfferMatch(offers, offerName, productName, utmCampaign);
  if (matched) return matched.apelidoUpper;

  // 2) Legacy hardcoded pattern fallback
  const offer = (offerName || "").trim();
  if (offer) {
    const segs = offer.split("|").map((s) => s.trim());
    const proj = (segs[2] || "").toUpperCase();
    if (proj === "MO" || proj === "MON") return "MO";
    if (proj === "LDG") return "LDR";
    if (proj === "NDM" || proj === "NDR" || proj === "NDB" || proj === "LDR" || proj === "CRT" || proj === "AURAVITA" || proj === "VTP") {
      return proj;
    }
    // Check Vitalis variants
    if (offer.toUpperCase().includes("VITALIS")) return "VTP";
  }
  
  // 3) Detect from utm_campaign brackets (e.g. [AURAVITA])
  const campBrackets = (utmCampaign || "").match(/\[([A-Z0-9_\- ]+)\]/gi);
  if (campBrackets) {
    for (const b of campBrackets) {
      const tag = b.replace(/[\[\]]/g, "").toUpperCase();
      if (tag === "AURAVITA") return "AURAVITA";
      if (tag === "VTP" || tag === "VITALIS") return "VTP";
    }
  }
  const pn = (productName || "").toLowerCase();
  if (/memoryon|\bmon\b|\bmo\b/.test(pn)) return "MO";
  if (/\bndm\b|neurodyne/.test(pn)) return "NDM";
  if (/\bndr\b|nightrenew/.test(pn)) return "NDR";
  if (/\bndb\b/.test(pn)) return "NDB";
  if (/\bldr\b|leandrops|\bldg\b/.test(pn)) return "LDR";
  if (/\bcrt\b|core\s*strength|ailula/.test(pn)) return "CRT";
  return "OUTROS";
}


/** Convert USD → BRL using last available rate from exchange_rate_log (fallback 5.30) */
async function getUsdToBrl(supabase: any): Promise<number> {
  try {
    const { data } = await supabase
      .from("exchange_rate_log")
      .select("rate")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const r = Number(data?.rate);
    if (r && r > 0) return r;
  } catch (_e) { /* ignore */ }
  return 5.30;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const h = { ...corsHeaders, "Content-Type": "application/json" };

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "Missing env vars" }), { status: 500, headers: h });
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  // Aceita query string OU body JSON pra facilitar invocação
  const url = new URL(req.url);
  let body: Record<string, unknown> = {};
  if (req.method === "POST") {
    try { body = await req.json(); } catch { /* ignore */ }
  }
  const getParam = (key: string): string | null => {
    const fromQs = url.searchParams.get(key);
    if (fromQs !== null) return fromQs;
    const v = body[key];
    return v == null ? null : String(v);
  };
  const operationId = getParam("operation_id");
  const lookbackMin = Math.min(Math.max(parseInt(getParam("lookback_min") || "30", 10), 2), 1440);
  const since = new Date(Date.now() - lookbackMin * 60_000).toISOString();
  const backfillDate = getParam("date");
  const includeAllPlatforms = getParam("include_known") === "1";
  console.log("[sync-redtrack-sales] v2 params:", JSON.stringify({ lookbackMin, backfillDate, includeAllPlatforms, body, qs: Object.fromEntries(url.searchParams) }));

  // Operações com RedTrack em STANDBY (flag redtrack_standby) — não geram sales_data
  const standbyOps = await getRedTrackStandbyOps(supabase);
  if (operationId && standbyOps.has(operationId)) {
    return new Response(JSON.stringify({ success: true, skipped: "redtrack_standby", operation_id: operationId }), { status: 200, headers: h });
  }

  const usdToBrl = await getUsdToBrl(supabase);

  // Load configured offers for apelido/vendor fallback matching
  let offersList: OfferLite[] = [];
  try {
    const { data: offData } = await supabase
      .from("offers")
      .select("apelido_interno, vendor, status")
      .neq("status", "arquivada");
    offersList = (offData || [])
      .filter((o: any) => o.apelido_interno && o.apelido_interno.length >= 2)
      .map((o: any) => ({
        apelido: String(o.apelido_interno),
        apelidoUpper: String(o.apelido_interno).toUpperCase(),
        vendor: String(o.vendor || ""),
      }))
      // Match longest apelidos first to avoid "MMP" eating "MMPB"
      .sort((a, b) => b.apelidoUpper.length - a.apelidoUpper.length);
  } catch (e) {
    console.warn("[sync-redtrack-sales] could not load offers for matching:", (e as Error).message);
  }


  // Buscar eventos RedTrack relevantes
  // FALLBACK CartPanda: aceitamos amount=0 também, pois CartPanda às vezes não envia o valor no postback.
  // Vamos deduplicar por receipt/clickid e usar MAX(amount) como receita.
  const PAGE = 1000;
  let allEvents: any[] = [];
  let from = 0;
  while (true) {
    let q = supabase
      .from("redtrack_events")
      .select("id, occurred_at, event_type, offer_name, product_name, amount, currency, transaction_id, clickid, redtrack_id, utm_source, utm_campaign, utm_content, utm_term, operation_id, raw_payload")
      .in("event_type", ["purchase", "upsell", "sale"])
      .order("occurred_at", { ascending: false })
      .range(from, from + PAGE - 1);
      
    if (operationId) q = q.eq("operation_id", operationId);

    if (backfillDate) {
      // Janela BRT: de 03:00Z (= 00:00 BRT) do dia até 03:00Z do dia seguinte
      const start = new Date(`${backfillDate}T03:00:00Z`);
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      q = q.gte("occurred_at", start.toISOString()).lt("occurred_at", end.toISOString());
    } else {
      q = q.gte("occurred_at", since);
    }

    const { data, error } = await q;
    if (error) {
      console.error("[sync-redtrack-sales] fetch error:", error.message);
      break;
    }
    allEvents = allEvents.concat(
      (data || []).filter((ev: any) => !(ev.operation_id && standbyOps.has(String(ev.operation_id))))
    );
    if ((data?.length || 0) < PAGE) break;
    from += PAGE;
  }

  if (allEvents.length === 0) {
    await supabase.from("integration_logs").insert({
      integration: "sync-redtrack-sales",
      status: "success",
      message: `No eligible RedTrack events in last ${lookbackMin}min`,
      records_processed: 0,
    });
    return new Response(JSON.stringify({ success: true, processed: 0, lookback_min: lookbackMin }), { status: 200, headers: h });
  }

  // ──────────────────────────────────────────────────────────────────
  // DEDUP por receipt/clickid e fallback CartPanda (amount=0)
  // ──────────────────────────────────────────────────────────────────
  // Resolve a "chave de venda única" — preferindo receipt da CartPanda/CB → transaction_id → clickid → id
  const ROY_OP_ID = "72951a45-5fa5-4cea-841e-6ec26fdf25a3";
  const dedupKeyOf = (ev: any): string => {
    // ROY only: upsell é venda própria — nunca fundir com a venda principal do mesmo clickid
    if (ev.event_type === "upsell" && ev.operation_id === ROY_OP_ID) {
      return `u:${ev.redtrack_id || ev.id}`;
    }
    const rp = ev.raw_payload || {};
    const receipt = String(rp.p_sub1 || rp.receipt || rp.order_id || "").trim();
    if (receipt) return `r:${receipt}`;
    if (ev.transaction_id) return `t:${ev.transaction_id}`;
    if (ev.clickid) return `c:${ev.clickid}`;
    if (ev.redtrack_id) return `x:${ev.redtrack_id}`;
    return `i:${ev.id}`;
  };

  // Agrupa eventos por chave única — para cada grupo pegamos:
  //   - O evento mais recente (metadata: utm, offer_name, occurred_at)
  //   - O MAX(amount) entre todos os eventos do grupo (cobre fallback CartPanda)
  const groups = new Map<string, { latest: any; maxAmount: number; maxAmountCurrency: string; count: number }>();
  for (const ev of allEvents) {
    const key = dedupKeyOf(ev);
    const amt = Number(ev.amount) || 0;
    const curr = (ev.currency || "USD").toUpperCase();
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { latest: ev, maxAmount: amt, maxAmountCurrency: curr, count: 1 });
    } else {
      existing.count++;
      // Latest = occurred_at maior
      if (new Date(ev.occurred_at).getTime() > new Date(existing.latest.occurred_at).getTime()) {
        existing.latest = ev;
      }
      if (amt > existing.maxAmount) {
        existing.maxAmount = amt;
        existing.maxAmountCurrency = curr;
      }
    }
  }

  // Inserir em lotes via upsert
  const rows: any[] = [];
  const counters = { cartpanda: 0, clickbank: 0, buygoods: 0, digistore: 0, redtrack_unknown: 0, newsbreak: 0, skipped_known: 0, skipped_zero: 0 };

  for (const [key, grp] of groups) {
    const ev = grp.latest;
    const { store, label, trafficSource } = resolvePlatform(ev.offer_name, ev.utm_campaign, offersList);
    const isFallbackTraffic = isFallbackTrafficSource(trafficSource);

    // ClickBank: IPN é a fonte autoritativa — pulamos por padrão.
    // EXCEÇÃO: tráfegos como NewsBreak não são capturados pelo IPN (sem aff_sub2/sub3 padrão),
    // então processamos via RedTrack com fallback amount=0 (igual CartPanda).
    if (store === "clickbank" && !isFallbackTraffic) {
      counters.skipped_known++;
      continue;
    }

    // Digistore tem webhook próprio — só processa se include_known=1 ou backfill.
    if (store === "digistore" && !includeAllPlatforms && !backfillDate) {
      counters.skipped_known++;
      continue;
    }

    // CartPanda: webhook está mudo — sempre processamos via fallback.
    // NewsBreak: ClickBank IPN não captura essas vendas — fallback RedTrack obrigatório.
    // Deduplicação cross-source (rt: vs webhook) é feita pelo War Room (useLiveSales/salesMerge).

    const product = resolveProduct(ev.offer_name, ev.product_name, ev.utm_campaign, offersList);
    console.log(`[sync-redtrack-sales] item classification: order=${key} platform=${store} product=${product} campaign=${ev.utm_campaign}`);

    // Receita: MAX(amount) do grupo. Se zero, é uma venda válida mas sem valor reportado pelo postback.
    // Para CartPanda e tráfegos-fallback (NewsBreak) mantemos a venda mesmo com revenue=0 para registrar a contagem.
    // Para outras plataformas desconhecidas, exigimos amount > 0.
    const currency = grp.maxAmountCurrency;
    const revenueBrl = grp.maxAmount > 0
      ? (currency === "BRL" ? grp.maxAmount : grp.maxAmount * usdToBrl)
      : 0;

    // Vendas REAIS sempre têm amount > 0 no postback final do RedTrack.
    // Eventos purchase com amount=0 são duplicações/checkouts intermediários — NÃO são vendas.
    // Aplicado a TODAS as fontes (incluindo NewsBreak): a ClickBank IPN é a fonte autoritativa
    // para revenue; eventos RedTrack zerados não devem entrar em sales_data.
    if (revenueBrl <= 0) {
      counters.skipped_zero++;
      continue;
    }

    const dateBr = brDate(new Date(ev.occurred_at));
    // Order ID: usamos a chave dedup (sem prefixo r:/t:/c:/i:) para garantir 1 venda por receipt
    const dedupSuffix = key.replace(/^[rtcxiu]:/, "");
    const orderId = `rt:${dedupSuffix}`;

    // Para NewsBreak/MGID (via ClickBank ou tráfegos Sphere/COD identificados como "redtrack_unknown"),
    // marcamos o store com o slug do canal (newsbreak|mgid) para que /media-channels e War Room
    // exibam como canal próprio (separado do clickbank IPN autoritativo).
    const fbSlug = fallbackChannelSlug(trafficSource);
    const finalStore = isFallbackTraffic && fbSlug && (store === "clickbank" || store === "redtrack_unknown")
      ? fbSlug
      : store;

    rows.push({
      order_id: orderId,
      date: dateBr,
      revenue: revenueBrl,
      status: "approved",
      product_name: product,
      utm_source: ev.utm_source || (fbSlug || null),
      utm_campaign: bestCampaignName(
        ev.raw_payload?.sub6 as string,
        ev.raw_payload?.campaign as string,
        ev.utm_campaign,
        ev.raw_payload?.rt_campaign as string,
      ),

      utm_content: (ev.raw_payload?.rt_ad || ev.utm_content || null),
      utm_term: ev.utm_term || null,
      store: finalStore,
      operation_id: ev.operation_id || null,
      created_at: ev.occurred_at,
    });

    counters[finalStore as keyof typeof counters] = (counters[finalStore as keyof typeof counters] || 0) + 1;
  }

  let inserted = 0;
  if (rows.length > 0) {
    // Upsert atualiza vendas já conhecidas em toda execução do cron. Somente IDs
    // ainda ausentes são elegíveis para push; evita reenviar a janela de 30 min.
    const existingOrderIds = new Set<string>();
    for (let i = 0; i < rows.length; i += 500) {
      const ids = rows.slice(i, i + 500).map((r) => r.order_id as string);
      const { data: existingRows, error: existingError } = await supabase
        .from("sales_data")
        .select("order_id")
        .in("order_id", ids);
      if (existingError) {
        console.error("[sync-redtrack-sales] existing order lookup error:", existingError.message);
        return new Response(JSON.stringify({ success: false, error: existingError.message }), { status: 500, headers: h });
      }
      for (const existing of existingRows || []) existingOrderIds.add(existing.order_id);
    }
    const freshRows = rows.filter((r) => !existingOrderIds.has(r.order_id as string));

    // upsert by order_id (evita duplicatas se o sync rodar várias vezes)
    const { error: upsertErr, count } = await supabase
      .from("sales_data")
      .upsert(rows, { onConflict: "order_id", ignoreDuplicates: false, count: "exact" });
    if (upsertErr) {
      console.error("[sync-redtrack-sales] upsert error:", upsertErr.message);
      await supabase.from("integration_logs").insert({
        integration: "sync-redtrack-sales",
        status: "error",
        message: `Upsert failed: ${upsertErr.message}`,
        records_processed: 0,
      });
      return new Response(JSON.stringify({ success: false, error: upsertErr.message }), { status: 500, headers: h });
    }
    inserted = count ?? rows.length;

    // Canal PARALELO: Web Push por venda (só no modo tempo real; backfill não notifica).
    // Cap de 10 para não inundar o iPhone em rajadas.
    if (!backfillDate) {
      const recentCutoff = Date.now() - 10 * 60_000;
      const recentFreshRows = freshRows.filter((r) => Date.parse(r.created_at as string) >= recentCutoff);
      for (const r of recentFreshRows.slice(0, 10)) {
        await mirrorSaleToWebPush({
          operation_id: (r.operation_id as string) ?? null,
          order_id: r.order_id as string,
          valor: r.revenue as number,
          currency: "BRL",
          produto: (r.product_name as string) ?? null,
          canal: (r.store as string) ?? "redtrack",
          url: "/war-room",
          utm_campaign: (r.utm_campaign as string) ?? null,
          sale_created_at: (r.created_at as string) ?? null,
        });
      }
    }
  }

  await supabase.from("integration_logs").insert({
    integration: "sync-redtrack-sales",
    operation_id: operationId,
    status: "success",
    message: `Synced ${inserted} sales from RedTrack | ${JSON.stringify(counters)} | lookback=${lookbackMin}min${backfillDate ? ` backfill=${backfillDate}` : ""}`,
    records_processed: inserted,
  });

  return new Response(
    JSON.stringify({
      success: true,
      processed: inserted,
      events_evaluated: allEvents.length,
      counters,
      usd_to_brl: usdToBrl,
      lookback_min: lookbackMin,
      backfill_date: backfillDate,
      include_known: includeAllPlatforms,
    }),
    { status: 200, headers: h },
  );
});
