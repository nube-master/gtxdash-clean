// Captura screenshot da página de vendas e cacheia no bucket offer-previews
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { offer_id, force } = await req.json();
    if (!offer_id) {
      return new Response(JSON.stringify({ error: "offer_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: offer, error: oErr } = await supabase
      .from("offers")
      .select(
        "id, apelido_interno, sales_page_url, landing_pages, vsl_url, link_checkout, preview_image_url, preview_image_updated_at",
      )
      .eq("id", offer_id)
      .maybeSingle();

    if (oErr || !offer) {
      return new Response(JSON.stringify({ error: "offer not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve preview URL — normaliza (adiciona https://) e descarta strings que não são URLs
    const normalize = (raw?: string | null): string | null => {
      if (!raw) return null;
      const s = String(raw).trim();
      if (!s || !s.includes(".")) return null; // ex: "NMP-BG01" não é URL
      if (/^https?:\/\//i.test(s)) return s;
      return `https://${s.replace(/^\/+/, "")}`;
    };

    const target =
      normalize(offer.sales_page_url) ||
      normalize(offer.landing_pages?.[0]) ||
      normalize(offer.vsl_url) ||
      normalize(offer.link_checkout);

    if (!target) {
      return new Response(JSON.stringify({ error: "no URL to preview" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Skip if recente (<7 dias) e não forçado
    if (!force && offer.preview_image_url && offer.preview_image_updated_at) {
      const ageDays =
        (Date.now() - new Date(offer.preview_image_updated_at).getTime()) /
        86400000;
      if (ageDays < 7) {
        return new Response(
          JSON.stringify({ ok: true, cached: true, url: offer.preview_image_url }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Tenta múltiplos provedores (free tier do Microlink limita; thum.io é fallback)
    const providers = [
      `https://api.microlink.io/?url=${encodeURIComponent(target)}&screenshot=true&meta=false&embed=screenshot.url&viewport.width=1024&viewport.height=1280&waitUntil=networkidle0`,
      `https://image.thum.io/get/width/1024/crop/1280/png/${target}`,
      `https://s.wordpress.com/mshots/v1/${encodeURIComponent(target)}?w=1024&h=1280`,
    ];

    let imgRes: Response | null = null;
    let lastErr = "";
    for (const url of providers) {
      try {
        const r = await fetch(url, { redirect: "follow" });
        const ct = r.headers.get("content-type") || "";
        if (r.ok && ct.startsWith("image/")) { imgRes = r; break; }
        lastErr = `${url.split("?")[0]} → ${r.status} ${ct}`;
        try { await r.body?.cancel(); } catch {}
      } catch (e) {
        lastErr = `${url.split("?")[0]} → ${String(e)}`;
      }
    }
    if (!imgRes) {
      console.warn("[capture-offer-preview] all providers failed:", lastErr);
      return new Response(
        JSON.stringify({ ok: false, fallback: true, error: lastErr }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const bytes = new Uint8Array(await imgRes.arrayBuffer());
    const contentType = imgRes.headers.get("content-type") || "image/png";
    const ext = contentType.includes("jpeg") ? "jpg" : "png";
    const path = `${offer.id}/${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from("offer-previews")
      .upload(path, bytes, { contentType, upsert: true });
    if (upErr) throw upErr;

    const { data: pub } = supabase.storage
      .from("offer-previews")
      .getPublicUrl(path);

    await supabase
      .from("offers")
      .update({
        preview_image_url: pub.publicUrl,
        preview_image_updated_at: new Date().toISOString(),
      })
      .eq("id", offer.id);

    return new Response(
      JSON.stringify({ ok: true, url: pub.publicUrl, source: target }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[capture-offer-preview] error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
