// Spy v2 — Sync a single offer via Apify (Facebook Ad Library) + Lovable AI analysis
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const APIFY_TOKEN = Deno.env.get("APIFY_API_TOKEN")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Apify actor for Facebook Ad Library scraping
const APIFY_ACTOR = "curious_coder~facebook-ads-library-scraper";

function trim(s: any, n = 600): string | null {
  if (!s || typeof s !== "string") return null;
  const t = s.trim();
  return t.length > n ? t.slice(0, n) : t;
}

async function runApify(adLibraryUrl: string, count: number) {
  // 5 min — máximo confiável do endpoint run-sync. Para volumes >2k seria necessário modo async.
  const url = `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=300`;
  const body = {
    urls: [{ url: adLibraryUrl }],
    count,
    "scrapePageAds.activeStatus": "active",
    period: "",
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Apify error ${res.status}: ${txt.slice(0, 400)}`);
  }
  return (await res.json()) as any[];
}

function parseCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.round(value);
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[^\d.,]/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned.replace(/[.,]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function extractApifyTotalCount(items: any[]): number | null {
  const totals = items
    .map((item) => parseCount(item?.total ?? item?.total_count ?? item?.results_count ?? item?.search_results_count))
    .filter((n): n is number => n != null);
  return totals.length ? Math.max(...totals) : null;
}

/**
 * Scrapes the FB Ad Library URL for the "results" total count text.
 * This is the SAME number the user sees in the library header ("~50,000 results").
 * Doesn't fetch ad bodies — just the count badge.
 * Returns null if it can't parse.
 */
async function scrapeLibraryTotalCount(adLibraryUrl: string): Promise<number | null> {
  try {
    const res = await fetch(adLibraryUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();
    // FB injects something like: "~50,000 results" / "About 12,345 results" / "50.000 resultados"
    const patterns = [
      /([\d.,]+)\s*results?\b/i,
      /([\d.,]+)\s*resultados?\b/i,
      /"total_count":(\d+)/,
      /"collationCount":(\d+)/,
      /About\s+([\d.,]+)\s+results?/i,
      /~\s*([\d.,]+)\s+results?/i,
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m?.[1]) {
        const n = parseCount(m[1]);
        if (n) return n;
      }
    }
    return null;
  } catch (e) {
    console.warn("[scrapeLibraryTotalCount] failed", (e as any)?.message);
    return null;
  }
}

function normalizeAd(item: any) {
  // Apify schema varies; defensively pick common fields
  const snapshot = item?.snapshot ?? item?.adSnapshot ?? {};
  const body =
    snapshot?.body?.text ??
    item?.ad_creative_body ??
    item?.adCreativeBody ??
    item?.text ??
    null;
  const headline = snapshot?.title ?? item?.headline ?? null;
  const description = snapshot?.link_description ?? item?.description ?? null;
  const cta = snapshot?.cta_text ?? item?.ctaText ?? null;
  const destination =
    snapshot?.link_url ??
    item?.snapshot?.link_url ??
    item?.url ??
    item?.adUrl ??
    null;
  const thumb =
    snapshot?.images?.[0]?.resized_image_url ??
    snapshot?.images?.[0]?.original_image_url ??
    snapshot?.videos?.[0]?.video_preview_image_url ??
    null;
  const creative_url =
    snapshot?.videos?.[0]?.video_hd_url ??
    snapshot?.videos?.[0]?.video_sd_url ??
    snapshot?.images?.[0]?.original_image_url ??
    null;
  const creative_type =
    (snapshot?.videos?.length ?? 0) > 0
      ? "video"
      : (snapshot?.cards?.length ?? 0) > 0
      ? "carousel"
      : "image";
  const advertiser_name =
    item?.page_name ?? item?.pageName ?? snapshot?.page_name ?? null;
  const advertiser_page_id =
    String(item?.page_id ?? item?.pageId ?? snapshot?.page_id ?? "") || null;
  const meta_ad_id = String(item?.ad_archive_id ?? item?.adArchiveId ?? item?.id ?? "") || null;
  const is_active = item?.is_active ?? item?.isActive ?? true;
  const createdRaw =
    item?.start_date ?? item?.startDate ?? item?.ad_delivery_start_time ?? null;

  return {
    meta_ad_id,
    advertiser_name,
    advertiser_page_id,
    creative_type,
    creative_url,
    thumbnail_url: thumb,
    primary_text: trim(body, 4000),
    headline: trim(headline, 300),
    description: trim(description, 600),
    cta_text: trim(cta, 60),
    destination_url: destination,
    ad_active_status: is_active ? "active" : "inactive",
    ad_creation_time: createdRaw ? new Date(Number(createdRaw) * 1000 || createdRaw).toISOString() : null,
  };
}

async function analyzeWithAI(offer: any, ads: any[]) {
  const sample = ads
    .slice(0, 8)
    .map((a, i) => `--- AD ${i + 1} ---\nHeadline: ${a.headline ?? "—"}\nCopy: ${a.primary_text ?? "—"}\nCTA: ${a.cta_text ?? "—"}`)
    .join("\n\n");

  const prompt = `Você é um analista de Direct Response. Analise os anúncios da oferta "${offer.offer_name}" (produto: ${offer.product_name ?? "?"}, nicho atual: ${offer.nicho ?? "?"}).

${sample || "(sem ads disponíveis)"}

Retorne JSON estrito.`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: "Você devolve apenas tool_calls. Sem texto livre." },
        { role: "user", content: prompt },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "analyze_offer",
            description: "Analisa nicho, ângulos e resumo da oferta",
            parameters: {
              type: "object",
              properties: {
                summary: { type: "string", description: "Resumo em 2-3 frases: promessa, mecanismo, público-alvo." },
                niche_tags: {
                  type: "array",
                  items: { type: "string" },
                  description: "Até 4 tags de nicho (ex.: Brain, Diabetes, Joint, Weight Loss).",
                },
                angles: {
                  type: "array",
                  items: { type: "string" },
                  description: "Até 5 ângulos persuasivos detectados (ex.: medo, prova social, antes/depois, autoridade).",
                },
              },
              required: ["summary", "niche_tags", "angles"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "analyze_offer" } },
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    console.error("[AI] failed", res.status, t);
    return null;
  }
  const data = await res.json();
  const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return null;
  try {
    return JSON.parse(args);
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const reqBody = await req.json().catch(() => ({} as any));
    const { offer_id } = reqBody;
    const requestedCount = Number(reqBody?.max_ads) || 0;
    if (!offer_id) throw new Error("offer_id required");

    const supa = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: offer, error: offErr } = await supa
      .from("spy_offers")
      .select("*")
      .eq("id", offer_id)
      .maybeSingle();
    if (offErr) throw offErr;
    if (!offer) throw new Error("offer not found");
    if (!offer.ad_library_url) throw new Error("offer has no ad_library_url");

    await supa.from("spy_offers").update({ sync_status: "running", sync_error: null }).eq("id", offer_id);

    // MODO COUNT-ONLY: rastreamos só o TOTAL de ads ativos que a biblioteca exibe.
    // Pequena amostra (default 50, máx 200) só pra alimentar AI summary + Copy Intel.
    const sampleCount = Math.min(Math.max(requestedCount || 50, 20), 200);

    // 1. Total real de ads ativos exibidos na biblioteca (best effort via HTML)
    const htmlLibraryTotal = await scrapeLibraryTotalCount(offer.ad_library_url);
    console.log(`[spy-sync-offer] ${offer_id} html library total=${htmlLibraryTotal}`);

    // 2. Amostra pequena via Apify (pra AI/Copy Intel) — não varremos os 50k
    const items = await runApify(offer.ad_library_url, sampleCount);
    console.log(`[spy-sync-offer] ${offer_id} apify sample=${items.length} (requested ${sampleCount})`);

    // A Apify retorna o total oficial em cada item (`total`). Use isso antes da amostra.
    const apifyLibraryTotal = extractApifyTotalCount(items);
    const libraryTotal = apifyLibraryTotal ?? htmlLibraryTotal;
    console.log(`[spy-sync-offer] ${offer_id} library total=${libraryTotal} (apify=${apifyLibraryTotal}, html=${htmlLibraryTotal})`);

    const normalized = items.map(normalizeAd).filter((a) => a.meta_ad_id);

    // 3. Upsert da amostra (pra Copy Intel ter material de análise)
    let sampleActive = 0;
    const advertisers = new Set<string>();
    let heroThumb: string | null = offer.hero_thumbnail_url;
    const now = new Date().toISOString();

    let oldestActiveMs: number | null = null;
    const nowMs = Date.now();
    const rows = normalized.map((ad) => {
      if (ad.ad_active_status === "active") {
        sampleActive++;
        if (ad.ad_creation_time) {
          const t = new Date(ad.ad_creation_time).getTime();
          if (Number.isFinite(t) && (oldestActiveMs === null || t < oldestActiveMs)) oldestActiveMs = t;
        }
      }
      if (ad.advertiser_page_id) advertisers.add(ad.advertiser_page_id);
      if (!heroThumb && ad.thumbnail_url) heroThumb = ad.thumbnail_url;
      return { ...ad, offer_id, ad_last_seen_at: now };
    });
    const daysRunningMax = oldestActiveMs ? Math.max(0, Math.floor((nowMs - oldestActiveMs) / 86400000)) : null;

    const CHUNK = 200;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      const { error: upErr } = await supa
        .from("spy_ads")
        .upsert(slice, { onConflict: "meta_ad_id" });
      if (upErr) console.error("[spy-sync-offer] upsert chunk error", upErr.message);
    }

    // Se nenhuma fonte expõe o total, não trate a amostra como total oficial.
    const activeCount = libraryTotal ?? sampleActive;
    const totalCount = libraryTotal ?? normalized.length;
    const countSource = libraryTotal == null ? "sample" : "library";

    // 4. AI analysis (best effort, usa amostra)
    const ai = await analyzeWithAI(offer, normalized);

    // 5. Update offer aggregates
    const update: any = {
      active_ads_count: activeCount,
      total_ads_count: totalCount,
      advertiser_count: advertisers.size || offer.advertiser_count || 0,
      hero_thumbnail_url: heroThumb,
      last_synced_at: new Date().toISOString(),
      last_updated_at: new Date().toISOString(),
      sync_status: countSource === "library" ? "ok" : "partial",
      sync_error: countSource === "library" ? null : "Total oficial da biblioteca indisponível; exibindo somente a amostra sincronizada.",
    };
    if (daysRunningMax !== null) update.days_running_max = daysRunningMax;
    if (oldestActiveMs !== null) update.oldest_active_ad_at = new Date(oldestActiveMs).toISOString();
    if (ai) {
      update.ai_summary = ai.summary ?? null;
      update.ai_angles = Array.isArray(ai.angles) ? ai.angles.slice(0, 5) : [];
      update.ai_niche_tags = Array.isArray(ai.niche_tags) ? ai.niche_tags.slice(0, 4) : [];
      update.ai_analyzed_at = new Date().toISOString();
    }

    await supa.from("spy_offers").update(update).eq("id", offer_id);

    // 5b. Snapshot diário em spy_history — base do gráfico de Evolução (hoje vs ontem)
    try {
      await supa.from("spy_history").insert({
        operation_id: offer.operation_id,
        offer_id,
        snapshot_at: new Date().toISOString(),
        active_ads_count: activeCount,
        total_ads_count: totalCount,
        raw_snapshot: { count_source: countSource, library_total: libraryTotal, sample_seen: normalized.length, sample_active: sampleActive },
      });
    } catch (e: any) {
      console.warn("[spy-sync-offer] history insert failed", e?.message);
    }

    // 6. Trigger copy intelligence analysis (fire-and-forget)
    try {
      fetch(`${SUPABASE_URL}/functions/v1/spy-analyze-copy`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_ROLE}`,
        },
        body: JSON.stringify({ offer_id }),
      }).catch((e) => console.warn("[spy-sync-offer] analyze trigger failed", e?.message));
    } catch (_) {}

    return new Response(
      JSON.stringify({
        ok: true,
        library_total: libraryTotal,
        count_source: countSource,
        sample_seen: normalized.length,
        sample_active: sampleActive,
        ads_active: activeCount,
        ai: !!ai,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("[spy-sync-offer] error:", e?.message);
    try {
      const { offer_id } = await req.clone().json().catch(() => ({ offer_id: null }));
      if (offer_id) {
        const supa = createClient(SUPABASE_URL, SERVICE_ROLE);
        await supa
          .from("spy_offers")
          .update({ sync_status: "error", sync_error: String(e?.message ?? e).slice(0, 500) })
          .eq("id", offer_id);
      }
    } catch (_) {}
    return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
