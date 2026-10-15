// attribute-live-sales
// 1) Match por clickid (ClickBank). 2) Fallback por IP+janela de tempo
//    (BuyGoods/Digistore/CartPanda — RedTrack gera clickid novo no redirect outbound).
// Cron: 60s. Front-End Only: USD 200-260, sem upsell/bump.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Ampliado para cobrir COD ($60-$100 tíquete físico) além do FE digital ($200-$260)
const FRONTEND_USD_MIN = 60;
const FRONTEND_USD_MAX = 300;
const UPSELL_RE = /\b(upgrade|upsell|last\s*chance|order\s*bump|bump|downsell)\b/i;
const IP_FALLBACK_LOOKBACK_MIN = 360; // 6h
const UTM_LOOKBACK_MIN = 24 * 60; // 24h — cascata Hotmart
const ESCOLA_OPERATION_ID = "1dd606e3-dac2-4064-b863-9784307c9e98";

async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function isFrontEndSale(amountUsd: number, itemName?: string | null): boolean {
  if (!Number.isFinite(amountUsd)) return false;
  if (amountUsd < FRONTEND_USD_MIN || amountUsd > FRONTEND_USD_MAX) return false;
  if (itemName && UPSELL_RE.test(itemName)) return false;
  return true;
}

function detectSource(offerName: string | null | undefined): string {
  const o = (offerName || "").toLowerCase();
  const segs = o.split("|").map((s) => s.trim());
  const trafficSrc = segs[0] || "";
  const plat = segs[1] || "";
  if (plat.includes("clickbank")) return "CLICKBANK";
  if (plat.includes("digistore")) return "DIGISTORE24";
  if (plat.includes("cartpanda")) return "CARTPANDA";
  if (plat.includes("buygoods")) return "BUYGOODS";
  if (trafficSrc.includes("newsbreak")) return "NEWSBREAK";
  return "OTHER";
}

function resolveProduct(offerName: string | null | undefined, productName: string | null | undefined): string | null {
  const offer = (offerName || "").trim();
  if (offer) {
    const segs = offer.split("|").map((s) => s.trim());
    const proj = (segs[2] || "").toUpperCase();
    if (proj === "NMP") return "NDM";
    if (proj === "MO" || proj === "MON") return "MO";
    if (proj === "LDG") return "LDR";
    if (["NDM", "NDR", "NDB", "LDR", "CRT", "MMP", "MMPB"].includes(proj)) return proj;
    // Lida com sub-tags tipo "NPP-JAPA" → tenta prefixo
    const head = proj.split(/[-_\s]/)[0];
    if (["NPP", "NDM", "NDR", "NDB", "LDR", "CRT", "MMP", "MMPB", "GLH"].includes(head)) return head;
  }
  const pn = (productName || "").toLowerCase();
  if (/memoryon|\bmon\b|\bmo\b/.test(pn)) return "MO";
  if (/\bndm\b|neurodyne/.test(pn)) return "NDM";
  if (/\bndr\b|nightrenew/.test(pn)) return "NDR";
  if (/\bndb\b/.test(pn)) return "NDB";
  if (/\bldr\b|leandrops/.test(pn)) return "LDR";
  if (/\bcrt\b|core\s*strength/.test(pn)) return "CRT";
  if (/memopryl|\bmmp\b/.test(pn)) return "MMP";
  return null;
}

function norm(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase();
}

function toBrtDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(date);
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function getHotmartSaleAt(rowDate: string | null | undefined, createdAt: string | null | undefined): string {
  const storedDate = rowDate ? String(rowDate).slice(0, 10) : null;
  const createdBrt = toBrtDate(createdAt);
  if (!storedDate) return createdAt || new Date().toISOString();

  // Corrige apenas o caso normal de venda 21h-23h59 BRT gravada como D+1 em UTC.
  // Backfills preservam a data original para não inflar o Ao Vivo/Hoje.
  const effectiveDate = createdBrt === addDays(storedDate, -1) ? createdBrt : storedDate;
  if (createdBrt === effectiveDate && createdAt) return createdAt;
  return new Date(`${effectiveDate}T12:00:00-03:00`).toISOString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const t0 = Date.now();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const url = new URL(req.url);
    const lookbackMin = Math.max(1, Number(url.searchParams.get("lookback_min") ?? "30"));
    const limit = Math.min(Math.max(1, Number(url.searchParams.get("limit") ?? "500")), 2000);
    const onlyOrphans = url.searchParams.get("only_orphans") === "1";
    const since = new Date(Date.now() - lookbackMin * 60_000).toISOString();

    // 1. Buscar purchases recentes com clickid
    let events: any[] | null = null;
    let evErr: any = null;
    if (onlyOrphans) {
      const { data: orphanRows, error: orphanErr } = await supabase
        .from("live_sale_attribution")
        .select("clickid")
        .eq("is_orphan", true)
        .gte("sale_at", since)
        .order("sale_at", { ascending: false })
        .limit(limit);
      if (orphanErr) throw orphanErr;
      const clickids = Array.from(new Set((orphanRows ?? []).map((r: any) => r.clickid).filter(Boolean)));
      if (clickids.length) {
        const res = await supabase
          .from("redtrack_events")
          .select("clickid, occurred_at, amount, currency, offer_name, product_name, operation_id, status, raw_payload")
          .eq("event_type", "purchase")
          .in("clickid", clickids)
          .order("occurred_at", { ascending: false })
          .limit(limit);
        events = res.data;
        evErr = res.error;
      } else {
        events = [];
      }
    } else {
      const res = await supabase
        .from("redtrack_events")
        .select("clickid, occurred_at, amount, currency, offer_name, product_name, operation_id, status, raw_payload")
        .eq("event_type", "purchase")
        .not("clickid", "is", null)
        .gte("occurred_at", since)
        .order("occurred_at", { ascending: false })
        .limit(limit);
      events = res.data;
      evErr = res.error;
    }

    if (evErr) throw evErr;

    let upserted = 0;
    let skipped = 0;
    let orphans = 0;
    let ipFallbackHits = 0;
    const errors: string[] = [];

    for (const ev of events ?? []) {
      const clickid = (ev.clickid || "").trim();
      if (!clickid) { skipped++; continue; }

      const amountUsd = Number(ev.amount || 0);
      const itemName: string | null = (ev as any).raw_payload?.item_name ?? ev.product_name ?? null;
      if (!isFrontEndSale(amountUsd, itemName)) { skipped++; continue; }

      // 2. Match primário por clickid (mais recente)
      const { data: viewers } = await supabase
        .from("live_viewers")
        .select("session_id, player_id, player_name, started_at, operation_id")
        .eq("clickid", clickid)
        .order("last_seen_at", { ascending: false })
        .limit(1);

      let match = viewers?.[0] ?? null;
      let matchedVia: "clickid" | "ip_fallback" | null = match ? "clickid" : null;

      // 3. Fallback IP + janela de tempo (BuyGoods/Digistore/CartPanda)
      if (!match) {
        const rawIp = (ev as any).raw_payload?.ip as string | undefined;
        if (rawIp && rawIp !== "0.0.0.0") {
          const ipTrim = rawIp.trim();
          // Detecta se RedTrack mandou IP mascarado /24 (último octeto = 0)
          const v4 = ipTrim.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
          const isMasked = !!v4 && v4[4] === "0";
          const ipHashFull = await sha256(ipTrim);
          const ipHashC24 = v4 ? await sha256(`${v4[1]}.${v4[2]}.${v4[3]}.0`) : ipHashFull;

          const saleTs = new Date(ev.occurred_at).getTime();
          const fromTs = new Date(saleTs - IP_FALLBACK_LOOKBACK_MIN * 60_000).toISOString();
          const toTs = new Date(saleTs + 5 * 60_000).toISOString();

          const product = resolveProduct(ev.offer_name, ev.product_name);

          // Coluna de match: se IP veio mascarado, cruza contra ip_hash_c24; caso contrário ip_hash direto.
          const ipCol = isMasked ? "ip_hash_c24" : "ip_hash";
          const ipVal = isMasked ? ipHashC24 : ipHashFull;

          let candidates: any[] | null = null;
          if (product) {
            const { data } = await supabase
              .from("live_viewers")
              .select("session_id, player_id, player_name, started_at, operation_id, product")
              .eq(ipCol, ipVal)
              .eq("product", product)
              .gte("started_at", fromTs)
              .lte("started_at", toTs)
              .order("last_seen_at", { ascending: false })
              .limit(1);
            candidates = data ?? null;
          }
          if (!candidates || candidates.length === 0) {
            const { data } = await supabase
              .from("live_viewers")
              .select("session_id, player_id, player_name, started_at, operation_id")
              .eq(ipCol, ipVal)
              .gte("started_at", fromTs)
              .lte("started_at", toTs)
              .order("last_seen_at", { ascending: false })
              .limit(1);
            candidates = data ?? null;
          }

          if (candidates && candidates.length > 0) {
            match = candidates[0];
            matchedVia = "ip_fallback";
            ipFallbackHits++;
          }
        }
      }

      const isOrphan = !match;
      if (isOrphan) orphans++;

      const operationId = match?.operation_id ?? ev.operation_id ?? null;
      if (!operationId) { skipped++; continue; }

      const saleAt = ev.occurred_at;
      let tts: number | null = null;
      if (match?.started_at) {
        const diff = Math.floor((new Date(saleAt).getTime() - new Date(match.started_at).getTime()) / 1000);
        tts = diff > 0 ? diff : null;
      }

      const status = String(ev.status || "").toLowerCase();
      const saleStatus =
        status.includes("refund") ? "REFUNDED" :
        status.includes("charge") ? "CHARGEBACK" :
        "CONVERTED";

      const row = {
        clickid,
        operation_id: operationId,
        sale_status: saleStatus,
        sale_value_usd: amountUsd,
        sale_at: saleAt,
        product: resolveProduct(ev.offer_name, ev.product_name),
        offer_name: ev.offer_name,
        sale_source: detectSource(ev.offer_name),
        sale_platform: "REDTRACK",
        matched_via: matchedVia,
        matched_session_id: match?.session_id ?? null,
        matched_player_id: match?.player_id ?? null,
        matched_player_name: match?.player_name ?? null,
        first_seen_at: match?.started_at ?? null,
        time_to_sale_seconds: tts,
        is_orphan: isOrphan,
        updated_at: new Date().toISOString(),
      };

      const { error: upErr } = await supabase
        .from("live_sale_attribution")
        .upsert(row, { onConflict: "clickid,operation_id" });

      if (upErr) {
        errors.push(`${clickid}: ${upErr.message}`);
      } else {
        upserted++;
        if (matchedVia === "ip_fallback") {
          console.log(`[ip_fallback] clickid=${clickid} → session=${match?.session_id} player=${match?.player_name}`);
        }
      }
    }

    // ============================================================
    // BLOCO ESCOLA DO DÓLAR — Hotmart cascata (clickid → utm_content → utm_campaign+source)
    // ============================================================
    let hotmartUpserted = 0;
    let hotmartOrphans = 0;
    const hotmartCascade = { clickid: 0, utm_content: 0, utm_campaign: 0, orphan: 0 };

    try {
      const { data: hotCfgRow } = await supabase
        .from("app_settings")
        .select("value")
        .eq("operation_id", ESCOLA_OPERATION_ID)
        .eq("key", "hotmart_config")
        .maybeSingle();
      const hotCfg = (hotCfgRow?.value && typeof hotCfgRow.value === "object") ? hotCfgRow.value as any : {};
      const allowedProducts = new Set<string>(
        Array.isArray(hotCfg.allowed_products)
          ? hotCfg.allowed_products.map((p: unknown) => norm(String(p)))
          : [],
      );
      const productCategories = (hotCfg.product_categories && typeof hotCfg.product_categories === "object")
        ? hotCfg.product_categories as Record<string, string>
        : {};

      const { data: hotSales, error: hotQErr } = await supabase
        .from("clickbank_audit")
        .select("receipt, product_name, item_name, amount_usd, amount_brl, date, created_at, aff_sub2, utm_source, utm_medium, utm_campaign, utm_content, utm_term, sck")
        .eq("operation_id", ESCOLA_OPERATION_ID)
        .eq("vendor", "hotmart")
        .eq("transaction_type", "SALE")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (hotQErr) errors.push(`hotmart_query: ${hotQErr.message}`);

      for (const s of hotSales ?? []) {
        const amountUsd = Number(s.amount_usd || 0);
        const amountBrl = Number(s.amount_brl || 0);
        const itemName: string | null = s.product_name || s.item_name || null;
        // Hotmart: valida somente por nome (allowlist já filtrada na ingestão). Rejeita upsell/bump explícito.
        if (amountBrl <= 0 && amountUsd <= 0) continue;
        const itemKey = norm(itemName);
        if (allowedProducts.size > 0 && !allowedProducts.has(itemKey)) continue;
        if (productCategories[itemKey] === "ignore") continue;
        if (itemName && UPSELL_RE.test(itemName)) continue;

        const externalId = String(s.receipt || "").trim();
        if (!externalId) continue;

        // Cascata: clickid → utm_content → utm_campaign+source
        let match: any = null;
        let matchedVia: string | null = null;
        const clickid = String(s.aff_sub2 || "").trim();
        const saleAtIso = getHotmartSaleAt(s.date, s.created_at);
        const saleTs = new Date(saleAtIso).getTime();
        const fromTs = new Date(saleTs - UTM_LOOKBACK_MIN * 60_000).toISOString();
        const toTs = new Date(saleTs + 5 * 60_000).toISOString();

        if (clickid) {
          const { data } = await supabase
            .from("live_viewers")
            .select("session_id, player_id, player_name, started_at")
            .eq("operation_id", ESCOLA_OPERATION_ID)
            .eq("clickid", clickid)
            .order("last_seen_at", { ascending: false })
            .limit(1);
          if (data && data.length) { match = data[0]; matchedVia = "clickid"; hotmartCascade.clickid++; }
        }

        if (!match && s.utm_content) {
          const { data } = await supabase
            .from("live_viewers")
            .select("session_id, player_id, player_name, started_at")
            .eq("operation_id", ESCOLA_OPERATION_ID)
            .eq("utm_content", s.utm_content)
            .gte("started_at", fromTs)
            .lte("started_at", toTs)
            .order("last_seen_at", { ascending: false })
            .limit(1);
          if (data && data.length) { match = data[0]; matchedVia = "utm_content"; hotmartCascade.utm_content++; }
        }

        if (!match && s.utm_campaign) {
          let q = supabase
            .from("live_viewers")
            .select("session_id, player_id, player_name, started_at")
            .eq("operation_id", ESCOLA_OPERATION_ID)
            .eq("utm_campaign", s.utm_campaign)
            .gte("started_at", fromTs)
            .lte("started_at", toTs)
            .order("last_seen_at", { ascending: false })
            .limit(1);
          if (s.utm_source) q = q.eq("utm_source", s.utm_source);
          const { data } = await q;
          if (data && data.length) { match = data[0]; matchedVia = "utm_campaign"; hotmartCascade.utm_campaign++; }
        }

        const isOrphan = !match;
        if (isOrphan) { hotmartCascade.orphan++; hotmartOrphans++; }

        let tts: number | null = null;
        if (match?.started_at) {
          const diff = Math.floor((saleTs - new Date(match.started_at).getTime()) / 1000);
          tts = diff > 0 ? diff : null;
        }

        const hotRow = {
          clickid: `hot:${externalId}`, // namespaced pra não colidir com redtrack
          operation_id: ESCOLA_OPERATION_ID,
          sale_status: "CONVERTED",
          sale_value_usd: amountUsd > 0 ? amountUsd : Math.round((amountBrl / 5.5) * 100) / 100,
          sale_at: saleAtIso,
          product: itemName,
          offer_name: itemName,
          sale_source: "HOTMART",
          sale_platform: "HOTMART",
          matched_via: matchedVia,
          matched_session_id: match?.session_id ?? null,
          matched_player_id: match?.player_id ?? null,
          matched_player_name: match?.player_name ?? null,
          first_seen_at: match?.started_at ?? null,
          time_to_sale_seconds: tts,
          is_orphan: isOrphan,
          updated_at: new Date().toISOString(),
        };

        const { error: hotErr } = await supabase
          .from("live_sale_attribution")
          .upsert(hotRow, { onConflict: "clickid,operation_id" });

        if (hotErr) errors.push(`hot:${externalId}: ${hotErr.message}`);
        else hotmartUpserted++;
      }
    } catch (hotFatal) {
      errors.push(`hotmart_block: ${String(hotFatal)}`);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        scanned: events?.length ?? 0,
        upserted,
        orphans,
        ip_fallback_hits: ipFallbackHits,
        skipped,
        hotmart_upserted: hotmartUpserted,
        hotmart_orphans: hotmartOrphans,
        hotmart_cascade: hotmartCascade,
        errors: errors.slice(0, 5),
        duration_ms: Date.now() - t0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("attribute-live-sales error", e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e), duration_ms: Date.now() - t0 }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
