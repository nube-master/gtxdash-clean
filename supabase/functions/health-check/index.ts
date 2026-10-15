import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/**
 * Resolves product name for Pushcut notifications.
 * NDM/NDR → Neurodyne, LDG → LDG, etc.
 */
const OFFER_NAME_MAP: Record<string, string> = {
  "Facebook | Clickbank | NDM | Controle": "Neurodyne (NDM)",
  "NDM": "Neurodyne (NDM)",
  "Facebook | Clickbank | NDR | Controle": "Neurodyne (NDR)",
  "NDR": "Neurodyne (NDR)",
  "Facebook | Clickbank | LDG | Controle": "LDR",
  "LDG": "LDR",
};

function resolveProductForPush(offerName?: string | null, productName?: string | null): string {
  if (offerName) {
    const mapped = OFFER_NAME_MAP[offerName.trim()];
    if (mapped) return mapped;
    // Try to extract meaningful part from offer_name
    const parts = offerName.split("|").map((p: string) => p.trim());
    const generic = new Set(["Facebook", "Clickbank", "Controle", "Google", "TikTok"]);
    const meaningful = parts.find((p: string) => p && !generic.has(p));
    if (meaningful) {
      if (meaningful === "NDM" || meaningful === "NDR") return `Neurodyne (${meaningful})`;
      return meaningful;
    }
  }
  if (productName && productName !== "Clickbank" && productName !== "RedTrack") {
    return productName.slice(0, 30);
  }
  return "Produto";
}

function brDate(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function xId(v: string | null) {
  if (!v) return null;
  const p = v.split("|");
  return p.length > 1 ? p[p.length - 1].trim() : null;
}

function normalizeUtmSource(v: string | null): string | null {
  if (!v) return null;
  const lower = v.toLowerCase().trim();
  if (lower === "fb" || lower === "facebook" || lower === "metaads" || lower === "meta ads" || lower === "meta") return "FB";
  return v;
}

function mapRec(r: any) {
  // Determine event type from RedTrack's "type" field
  let ev = "purchase";
  const c = String(r.type || "").toLowerCase();
  if (c === "click") return null; // skip click events, only want conversions
  if (c.includes("initiate") || c.includes("checkout") || c === "ic") ev = "initiate_checkout";
  else if (c.includes("upsell")) ev = "upsell";

  // Based on actual API response structure:
  // - campaign = RedTrack project name (NOT the Meta campaign name)
  // - rt_medium / sub10 = Meta adset name with full nomenclature + |adset_id
  // - rt_campaign / rt_campaign_id = often empty
  // - rt_source / sub9 = traffic source (MetaAds, FB)
  // 
  // The actual Meta campaign nomenclature (e.g. [BMGTX-FBMAX-C/A1946] [H02B28] ...)
  // lives in rt_medium / sub10 (the adset name field).
  const rawAdsetName = r.rt_medium || r.sub10 || "";
  // Strip trailing pipe + numeric ID suffix to get clean adset name
  const cleanAdsetName = rawAdsetName.replace(/\|[\d]+$/, "").trim() || null;
  const isGenericMedium = !cleanAdsetName || cleanAdsetName.toLowerCase() === "paid";
  
  // rt_medium / sub10 = adset name (utm_medium), NOT campaign name
  // Campaign name comes from sub6 or the RedTrack campaign field
  const utmCampaign = r.sub6 || null;
  const utmMedium = isGenericMedium ? (r.sub5 || null) : cleanAdsetName;

  // Extract creative/ad tag from the adset name (e.g. [H02B28-THE CHOSEN])
  let utmContent = r.sub4 || r.rt_ad || null;
  if (!utmContent && rawAdsetName) {
    const tagMatch = rawAdsetName.match(/\[([A-Z0-9]+-[^\]]+)\]/);
    if (tagMatch) {
      utmContent = tagMatch[0];
    }
  }

  // Extract Meta IDs
  const metaCampaignId = r.rt_campaign_id || null;
  const metaAdsetId = r.rt_adgroup_id || xId(r.sub10) || xId(r.rt_medium) || null;
  const metaAdId = r.rt_ad_id || null;

  return {
    redtrack_id: String(r.id || r.clickid || ""),
    clickid: r.clickid || null,
    tid: r.tid || null,
    transaction_id: r.order || r.transaction_id || null,
    event_type: ev,
    amount: Number(r.payout || r.payout_default || r.revenue || 0),
    currency: r.currency || "USD",
    offer_name: r.offer || r.offer_name || null,
    product_name: r.lp_name || r.network || null,
    occurred_at: r.conv_time || r.created_at || r.track_time || new Date().toISOString(),
    status: r.status || "approved",
    utm_source: normalizeUtmSource(r.sub8 || r.sub9 || r.rt_source || null),
    utm_campaign: utmCampaign,
    utm_medium: utmMedium,
    utm_content: utmContent,
    utm_term: r.sub7 || r.rt_keyword || null,
    meta_campaign_id: metaCampaignId,
    meta_adset_id: metaAdsetId,
    meta_ad_id: metaAdId,
    raw_payload: r,
    os: r.os || null,
    device: r.device || null,
    browser: r.browser || null,
    country: r.country || null,
    city: r.city || null,
  };
}

// ── War Room Report Generator ──
async function handleWarRoomReport(params: URLSearchParams, supabase: any) {
  const periodHours = Number(params.get("hours") || "3");
  const reportType = `${periodHours}h`;
  const now = new Date();
  const brNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const since = new Date(brNow.getTime() - periodHours * 60 * 60 * 1000).toISOString();
  const sinceDate = since.split("T")[0];

  // ── Fetch sales from redtrack_events ──
  const { data: sales } = await supabase
    .from("redtrack_events")
    .select("amount, occurred_at, os, device, browser, country, city, utm_campaign, event_type, status")
    .in("event_type", ["purchase", "upsell"])
    .in("status", ["approved", "other"])
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: false });

  const validSales = (sales || []).filter((s: any) => s.amount > 0);
  const totalVendas = validSales.length;
  const totalReceita = validSales.reduce((s: number, r: any) => s + Number(r.amount), 0);
  const ticketMedio = totalVendas > 0 ? totalReceita / totalVendas : 0;

  // ── Fetch spend from traffic_data ──
  const { data: traffic } = await supabase
    .from("traffic_data")
    .select("spend")
    .gte("date", sinceDate);
  const totalSpend = (traffic || []).reduce((s: number, r: any) => s + Number(r.spend), 0);
  const roas = totalSpend > 0 ? totalReceita / totalSpend : 0;
  const lucro = totalReceita - totalSpend;

  // ── Interval between sales ──
  let intervaloMedio = 0;
  let ultimaVenda = "Sem vendas";
  if (validSales.length > 0) {
    ultimaVenda = new Date(validSales[0].occurred_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    if (validSales.length > 1) {
      const timestamps = validSales.map((s: any) => new Date(s.occurred_at).getTime()).sort((a: number, b: number) => b - a);
      let totalInterval = 0;
      for (let i = 0; i < timestamps.length - 1; i++) {
        totalInterval += timestamps[i] - timestamps[i + 1];
      }
      intervaloMedio = Math.round(totalInterval / (timestamps.length - 1) / 60000); // minutes
    }
  }

  // ── Technical distributions ──
  const countBy = (arr: any[], key: string) => {
    const map: Record<string, number> = {};
    for (const item of arr) {
      const v = item[key] || "Desconhecido";
      map[v] = (map[v] || 0) + 1;
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  };
  const revenueBy = (arr: any[], key: string) => {
    const map: Record<string, number> = {};
    for (const item of arr) {
      const v = item[key] || "Desconhecido";
      map[v] = (map[v] || 0) + Number(item.amount);
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  };

  const osDist = countBy(validSales, "os");
  const browserDist = countBy(validSales, "browser");
  const topPais = countBy(validSales, "country");
  const topCidade = countBy(validSales, "city");
  const campaignRevenue = revenueBy(validSales, "utm_campaign");

  // OS percentage for Android check
  const androidCount = osDist.find(([k]) => k.toLowerCase().includes("android"))?.[1] || 0;
  const androidPct = totalVendas > 0 ? (androidCount / totalVendas) * 100 : 0;

  // Campaign concentration
  const topCampaignPct = totalReceita > 0 && campaignRevenue.length > 0
    ? (campaignRevenue[0][1] / totalReceita) * 100
    : 0;

  // ── Historical average interval (last 24h for comparison) ──
  const since24h = new Date(brNow.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const { data: historicalSales } = await supabase
    .from("redtrack_events")
    .select("occurred_at")
    .in("event_type", ["purchase", "upsell"])
    .in("status", ["approved", "other"])
    .gte("occurred_at", since24h)
    .order("occurred_at", { ascending: false });
  let historicalInterval = 0;
  if (historicalSales && historicalSales.length > 1) {
    const ts = historicalSales.map((s: any) => new Date(s.occurred_at).getTime()).sort((a: number, b: number) => b - a);
    let ti = 0;
    for (let i = 0; i < ts.length - 1; i++) ti += ts[i] - ts[i + 1];
    historicalInterval = Math.round(ti / (ts.length - 1) / 60000);
  }

  // ── Strategic Analysis ──
  const analyses: string[] = [];
  if (roas > 1.5) analyses.push("🔥 Operação AQUECIDA — ROAS acima de 1.5x");
  else if (roas < 1) analyses.push("🚨 Operação NEGATIVA — ROAS abaixo de 1.0x");
  else analyses.push("⚡ Operação NEUTRA — ROAS entre 1.0x e 1.5x");

  if (topCampaignPct > 60 && campaignRevenue.length > 0) {
    analyses.push(`⚠️ RISCO: ${Math.round(topCampaignPct)}% da receita concentrada em 1 campanha`);
  }
  if (androidPct < 30 && totalVendas > 0) {
    analyses.push(`📱 GARGALO: Android com apenas ${Math.round(androidPct)}% das vendas`);
  }
  if (intervaloMedio > historicalInterval && historicalInterval > 0) {
    analyses.push(`⏳ RITMO desacelerando — intervalo atual ${intervaloMedio}min vs histórico ${historicalInterval}min`);
  }

  // ── Status Badge ──
  let statusBadge = "🟡 NEUTRO";
  if (roas > 1.5 && totalVendas > 0) statusBadge = "🟢 AQUECIDO";
  else if (roas < 1 || totalVendas === 0) statusBadge = "🔴 ATENÇÃO";

  // ── Format Report ──
  const fmt = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const topN = (arr: [string, number][], n = 3) => arr.slice(0, n).map(([k, v]) => `  ${k}: ${v}`).join("\n");

  const report = [
    `━━━━━━━━━━━━━━━━━━━━`,
    `📊 RELATÓRIO ${reportType.toUpperCase()} GTX OS`,
    `${statusBadge}`,
    `━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `💰 MÉTRICAS PRINCIPAIS`,
    `├ Receita: R$ ${fmt(totalReceita)}`,
    `├ Vendas: ${totalVendas}`,
    `├ Ticket Médio: R$ ${fmt(ticketMedio)}`,
    `├ Investimento: R$ ${fmt(totalSpend)}`,
    `├ ROAS: ${fmt(roas)}x`,
    `├ Lucro: R$ ${fmt(lucro)}`,
    `├ Intervalo Médio: ${intervaloMedio}min`,
    `└ Última Venda: ${ultimaVenda}`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📱 PERFORMANCE TÉCNICA`,
    ``,
    `🖥 OS:`,
    topN(osDist),
    ``,
    `🌐 Browser:`,
    topN(browserDist),
    ``,
    `🌍 País:`,
    topN(topPais),
    ``,
    `🏙 Cidade:`,
    topN(topCidade),
    ``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `🧠 ANÁLISE ESTRATÉGICA`,
    ``,
    ...analyses.map(a => `  ${a}`),
    ``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `⏱ ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
  ].join("\n");

  // ── Metrics object for log ──
  const metrics = {
    receita: totalReceita,
    vendas: totalVendas,
    ticket_medio: ticketMedio,
    investimento: totalSpend,
    roas,
    lucro,
    intervalo_medio: intervaloMedio,
    ultima_venda: ultimaVenda,
    top_os: osDist.slice(0, 3),
    top_browser: browserDist.slice(0, 3),
    top_pais: topPais.slice(0, 3),
    top_cidade: topCidade.slice(0, 3),
    top_campaign_pct: topCampaignPct,
    android_pct: androidPct,
    analyses,
    status: statusBadge,
  };

  // ── Pushcut disabled by user request ──
  const pushcutStatus = "disabled_by_user_request";

  // ── Log to database ──
  await supabase.from("automated_reports_log").insert({
      operation_id: null,
      report_type: reportType,
    period_hours: periodHours,
    metrics,
    report_text: report,
    pushcut_status: pushcutStatus,
  });

  return jsonRes({ success: true, report_type: reportType, pushcut_status: pushcutStatus, metrics });
}

async function handleRedTrack(mode: string, params: URLSearchParams, supabase: any) {
  const operationId = params.get("operation_id");
  let apiKey = params.get("api_key");

  if (!apiKey) {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "redtrack_api_key")
      .eq("operation_id", operationId)
      .maybeSingle();
    apiKey = data?.value || Deno.env.get("REDTRACK_API_KEY") || "";
  }
  
  if (!apiKey) return jsonRes({ success: false, error: "API Key não fornecida ou não configurada." }, 400);

  if (mode === "redtrack-debug") {
    const results: Record<string, unknown> = {
      key_length: apiKey.length,
      key_prefix: apiKey.substring(0, 6),
      key_suffix: apiKey.substring(apiKey.length - 4),
    };
    const today = brDate();
    const endpoints = [
      { name: "conversions", url: `https://api.redtrack.io/conversions?api_key=${encodeURIComponent(apiKey)}&date_from=${today}&date_to=${today}&per=5` },
      { name: "tracks", url: `https://api.redtrack.io/tracks?api_key=${encodeURIComponent(apiKey)}&date_from=${today}&date_to=${today}&per=5` },
      { name: "report", url: `https://api.redtrack.io/report?api_key=${encodeURIComponent(apiKey)}&date_from=${today}&date_to=${today}` },
    ];
    for (const ep of endpoints) {
      try {
        const r = await fetch(ep.url);
        const txt = await r.text();
        let parsed: unknown;
        try { parsed = JSON.parse(txt); } catch { parsed = txt.slice(0, 500); }
        results[ep.name] = { status: r.status, body: parsed };
      } catch (e) {
        results[ep.name] = { error: (e as Error).message };
      }
    }
    return jsonRes(results);
  }

  if (mode === "redtrack-test") {
    try {
      const r = await fetch(
        `https://api.redtrack.io/conversions?api_key=${encodeURIComponent(apiKey)}&date_from=${brDate()}&date_to=${brDate()}&per=1`,
      );
      const txt = await r.text();
      return jsonRes({
        success: r.status === 200,
        message: r.status === 200 ? "API OK" : `Error ${r.status}: ${txt.slice(0, 80)}`,
      });
    } catch (e) {
      return jsonRes({ success: false, error: (e as Error).message }, 500);
    }
  }

  const days = Number(params.get("days") || "30");
  let dateFrom = params.get("date_from") || brDate();
  let dateTo = params.get("date_to") || brDate();
  if (mode === "redtrack-backfill") {
    dateFrom = brDate(days);
    dateTo = brDate();
  }

  let page = 1, tot = 0, errs = 0, more = true;
  try {
    while (more) {
      const startTime = Date.now();
      const r = await fetch(
        `https://api.redtrack.io/conversions?api_key=${encodeURIComponent(apiKey)}&date_from=${dateFrom}&date_to=${dateTo}&per=500&page=${page}`,
      );

      // Handle Rate Limiting (429) gracefully
      if (r.status === 429) {
        console.warn(`[health-check] RedTrack API 429 at page ${page}. Waiting 2s...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        // Retry same page
        continue;
      }

      if (r.status !== 200) throw new Error(`RedTrack API ${r.status}`);
      const data = await r.json();
      
      const recs: any[] = Array.isArray(data) ? data : (data?.items || []);
      if (!recs.length) break;
      const mapped = recs.map((x: any) => mapRec(x)).filter((m: any) => m && m.redtrack_id);
      if (mapped.length) {
        const { error } = await supabase.from("redtrack_events").upsert(mapped, {
          onConflict: "redtrack_id",
          ignoreDuplicates: false,
        });
        if (error) {
          console.error("Upsert error:", JSON.stringify(error));
          errs += mapped.length;
        } else {
          tot += mapped.length;
        }
      }
      more = recs.length >= 500;
      page++;
      if (page > 50) break;

      // Small delay between pages to avoid hitting rate limits on high-volume days
      const elapsed = Date.now() - startTime;
      if (elapsed < 500) await new Promise(resolve => setTimeout(resolve, 500 - elapsed));
    }
    // ── Enrich Type B events: fill utm_campaign from traffic_data via adset_name match ──
    if (tot > 0) {
      try {
        const { data: orphans } = await supabase
          .from("redtrack_events")
          .select("id, utm_medium")
          .is("utm_campaign", null)
          .not("utm_medium", "is", null)
          .gte("occurred_at", `${dateFrom}T00:00:00`)
          .lte("occurred_at", `${dateTo}T23:59:59`)
          .limit(500);

        if (orphans && orphans.length > 0) {
          // Strip |ID suffix from utm_medium to get clean adset name for matching
          const cleanAdsetMap = new Map<string, string[]>(); // cleanName → [orphan ids...]
          for (const o of orphans) {
            const clean = (o.utm_medium || "").replace(/\|[\d]+$/, "").trim();
            if (!clean) continue;
            if (!cleanAdsetMap.has(clean)) cleanAdsetMap.set(clean, []);
            cleanAdsetMap.get(clean)!.push(o.id);
          }
          const adsetNames = [...cleanAdsetMap.keys()];
          const { data: matches } = await supabase
            .from("traffic_data")
            .select("adset_name, campaign_name")
            .in("adset_name", adsetNames)
            .limit(1000);

          if (matches && matches.length > 0) {
            const adsetToCampaign = new Map<string, string>();
            for (const m of matches) {
              if (!adsetToCampaign.has(m.adset_name)) {
                adsetToCampaign.set(m.adset_name, m.campaign_name);
              }
            }
            let enriched = 0;
            for (const [cleanName, ids] of cleanAdsetMap) {
              const campaign = adsetToCampaign.get(cleanName);
              if (campaign) {
                for (const id of ids) {
                  await supabase.from("redtrack_events").update({ utm_campaign: campaign }).eq("id", id);
                  enriched++;
                }
              }
            }
            if (enriched > 0) console.log(`Enriched ${enriched}/${orphans.length} events with campaign name`);
          }
        }
      } catch (enrichErr) {
        console.error("Campaign enrichment error:", (enrichErr as Error).message);
      }
    }

    // ── Pushcut notifications disabled by user request ──
    const pushSent = 0;

    const msg = `Synced ${dateFrom} to ${dateTo}: ${tot} records, ${errs} errors, ${pushSent} push sent`;
    await supabase.from("integration_logs").insert({
      integration: "redtrack",
      status: errs > 0 ? "error" : "success",
      records_processed: tot,
      message: msg,
    });
    return jsonRes({ success: true, records: tot, errors: errs, push_sent: pushSent, message: msg });
  } catch (e) {
    const msg = (e as Error).message || "Unknown error";
    await supabase.from("integration_logs").insert({
      integration: "redtrack",
      status: "error",
      records_processed: 0,
      message: msg,
    });
    return jsonRes({ success: false, error: msg }, 500);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "health";

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Cron jobs can use service role key OR anon key
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();
  const isServiceRole = token === supabaseServiceKey;
  // Check all possible anon key env var names
  const anonKeyCandidates = [
    Deno.env.get("SUPABASE_ANON_KEY"),
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY"),
    Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY"),
  ].filter(Boolean);
  const isAnonKey = anonKeyCandidates.some(k => k === token);
  // Also detect anon role from JWT payload as fallback
  let isAnonRole = false;
  if (!isServiceRole && !isAnonKey && token) {
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      isAnonRole = payload?.role === "anon";
    } catch { /* ignore */ }
  }
  const isCronAuth = isServiceRole || isAnonKey || isAnonRole;

  // For redtrack-sync actions from cron (requires service role key)
  if (action.startsWith("redtrack") && isCronAuth) {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ── Resolve primary operation_id for log attribution ──
    let primaryOperationId: string | null = null;
    try {
      const { data: ops } = await supabase
        .from("operations")
        .select("id")
        .eq("status", "active")
        .order("created_at", { ascending: true })
        .limit(1);
      if (ops?.length) primaryOperationId = ops[0].id;
    } catch { /* fallback to null */ }

    // RECOVERY MODE guard for cron-triggered syncs
    try {
      const { data: rm } = await supabase.from("app_settings").select("value").eq("key", "recovery_mode").maybeSingle();
      if (rm?.value === true) {
        return jsonRes({ skipped: true, reason: "recovery_mode" });
      }
    } catch { /* proceed */ }
    return handleRedTrack(action, url.searchParams, supabase);
  }
  // War room report — allowed from cron (service role) or with any valid bearer
  if (action === "war-room-report") {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    return handleWarRoomReport(url.searchParams, supabase);
  }

  // All other actions require authenticated admin user
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonRes({ error: "Unauthorized" }, 401);
  }
  const authClient = createClient(
    supabaseUrl,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: claimsData, error: claimsErr } = await authClient.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims) {
    return jsonRes({ error: "Unauthorized" }, 401);
  }
  const callerId = claimsData.claims.sub;
  const { data: callerRoles } = await authClient
    .from("user_roles")
    .select("role")
    .eq("user_id", callerId);
  if (!callerRoles?.some((r: any) => r.role === "admin")) {
    return jsonRes({ error: "Admin access required" }, 403);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // RedTrack actions (admin authenticated)
  if (action.startsWith("redtrack")) {
    return handleRedTrack(action, url.searchParams, supabase);
  }

  // War Room Report already handled above (before auth check)

  // ── Default: health check ──
  const checks: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    edge_function: "ok",
  };

  try {
    const { count, error } = await supabase
      .from("integration_logs")
      .select("id", { count: "exact", head: true });
    checks.database = error ? { status: "error", message: error.message } : { status: "ok", total_logs: count };
  } catch (e) {
    checks.database = { status: "error", message: e instanceof Error ? e.message : String(e) };
  }

  const metaToken = Deno.env.get("META_ADS_ACCESS_TOKEN");
  checks.meta_token_configured = !!metaToken;

  if (metaToken) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(`https://graph.facebook.com/v21.0/me?access_token=${metaToken}`, { signal: controller.signal });
      clearTimeout(timer);
      const j = await res.json();
      checks.meta_api = res.ok
        ? { status: "ok", user_id: j.id, name: j.name }
        : { status: "error", code: res.status, message: j.error?.message || "Unknown" };
    } catch (e) {
      checks.meta_api = { status: "error", message: e instanceof Error ? e.message : String(e) };
    }
  }

  try {
    const { data } = await supabase
      .from("integration_logs")
      .select("integration, status, message, created_at")
      .order("created_at", { ascending: false })
      .limit(5);
    checks.last_logs = data || [];
  } catch { checks.last_logs = []; }

  try {
    const { data } = await supabase
      .from("system_logs")
      .select("type, function_name, message, created_at")
      .order("created_at", { ascending: false })
      .limit(5);
    checks.last_errors = data || [];
  } catch { checks.last_errors = []; }

  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from("integration_logs")
      .select("id", { count: "exact", head: true })
      .eq("integration", "cartpanda")
      .gte("created_at", oneHourAgo);
    checks.cartpanda_active_last_1h = (count || 0) > 0;
  } catch { checks.cartpanda_active_last_1h = false; }

  await supabase.from("system_logs").insert({
    type: "HEALTH_CHECK",
    function_name: "health-check",
    message: "Health check executed",
    metadata: checks,
  });

  return jsonRes(checks);
});
