// viewer-ping: heartbeat de viewers de VSL
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const PRODUCT_REGEX = /\[(MMP|MMPB|NDM|NDB|NDR|CRT|CST|GLP|ERX|GLH|MEMO|LDR|NEURO)\]/i;
const ACCOUNT_BMG_REGEX = /\[BMGTX-([^\]]+)\]/i;

const geoCache = new Map<string, { country: string | null; state: string | null; city: string | null; t: number }>();
const opSlugCache = new Map<string, { id: string | null; t: number }>();
const accountOpCache = new Map<string, { op: string | null; t: number }>();
const TTL = 60 * 60 * 1000;

async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function geoLookup(ip: string) {
  const cached = geoCache.get(ip);
  if (cached && Date.now() - cached.t < TTL) return cached;
  try {
    const r = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,regionName,city`);
    const j = await r.json();
    const result = { country: j?.country ?? null, state: j?.regionName ?? null, city: j?.city ?? null, t: Date.now() };
    geoCache.set(ip, result);
    return result;
  } catch {
    return { country: null, state: null, city: null, t: Date.now() };
  }
}

async function resolveOperationId(opSlug: string | null, accountId: string | null): Promise<string | null> {
  if (opSlug) {
    const c = opSlugCache.get(opSlug);
    if (c && Date.now() - c.t < TTL) return c.id;
    const { data } = await supabase.from("operations").select("id").eq("slug", opSlug).maybeSingle();
    const id = data?.id ?? null;
    opSlugCache.set(opSlug, { id, t: Date.now() });
    if (id) return id;
  }
  if (accountId) {
    const c = accountOpCache.get(accountId);
    if (c && Date.now() - c.t < TTL) return c.op;
    const { data } = await supabase.from("meta_ad_accounts").select("operation_id").eq("account_id", accountId).maybeSingle();
    const op = data?.operation_id ?? null;
    accountOpCache.set(accountId, { op, t: Date.now() });
    return op;
  }
  return null;
}

function extractProduct(campaign: string | null): string | null {
  if (!campaign) return null;
  const m = campaign.match(PRODUCT_REGEX);
  return m ? m[1].toUpperCase() : null;
}

function extractAccount(campaign: string | null): string | null {
  if (!campaign) return null;
  const m = campaign.match(ACCOUNT_BMG_REGEX);
  return m ? m[1] : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const sessionId = String(body.session_id ?? "").slice(0, 128);
    const playerId = String(body.player_id ?? "unknown").slice(0, 128);
    if (!sessionId) return new Response(JSON.stringify({ error: "session_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "0.0.0.0";
    const ipHash = await sha256(ip);
    // /24 mask (zera último octeto do IPv4) — para bater com IPs mascarados enviados no postback da RedTrack
    let ipC24 = ip;
    const v4 = ip.match(/^(\d+)\.(\d+)\.(\d+)\.\d+$/);
    if (v4) ipC24 = `${v4[1]}.${v4[2]}.${v4[3]}.0`;
    const ipHashC24 = await sha256(ipC24);
    const geo = ip !== "0.0.0.0" ? await geoLookup(ip) : { country: null, state: null, city: null };

    const utmCampaign = body.utm_campaign ?? null;
    const productFromRegex = extractProduct(utmCampaign);
    const productSlugRaw = body.product_slug ?? body.product ?? null;
    const productSlug = productSlugRaw ? String(productSlugRaw).toLowerCase().slice(0, 32) : null;
    // `product` (legado, uppercase) usado pelos filtros existentes — prioriza meta tag se vier
    const product = productSlug ? productSlug.toUpperCase() : productFromRegex;
    const adId = body.ad_id ?? null;
    const accountId = body.account_id ?? extractAccount(utmCampaign);
    const opSlug = body.op ?? body.operation_slug ?? null;
    const operationId = await resolveOperationId(opSlug, accountId);

    const device = ["mobile", "desktop", "tablet"].includes(body.device_type) ? body.device_type : "unknown";

    const row = {
      session_id: sessionId,
      player_id: playerId,
      player_name: body.player_name ?? null,
      clickid: body.clickid ?? null,
      utm_source: body.utm_source ?? null,
      utm_medium: body.utm_medium ?? null,
      utm_campaign: utmCampaign,
      utm_content: body.utm_content ?? null,
      utm_term: body.utm_term ?? null,
      ad_id: adId,
      account_id: accountId,
      operation_id: operationId,
      product,
      product_slug: productSlug,
      country: geo.country,
      state: geo.state,
      city: geo.city,
      device_type: device,
      user_agent: (body.user_agent ?? req.headers.get("user-agent") ?? "").slice(0, 500),
      ip_hash: ipHash,
      ip_hash_c24: ipHashC24,
      current_second_in_video: Number(body.current_second_in_video ?? 0) || 0,
      pitch_reached: !!body.pitch_reached,
      cta_clicked: !!body.cta_clicked,
      last_seen_at: new Date().toISOString(),
      exit_reason: "active",
    };

    await supabase.from("live_viewers").upsert(row, { onConflict: "session_id,player_id" });

    await supabase.from("live_events").insert({
      session_id: sessionId,
      player_id: playerId,
      event_type: "heartbeat",
      second_in_video: row.current_second_in_video,
      clickid: row.clickid,
      utm_campaign: utmCampaign,
      ad_id: adId,
      account_id: accountId,
      operation_id: operationId,
      product,
      product_slug: productSlug,
      country: geo.country,
      device_type: device,
    });

    return new Response(JSON.stringify({ status: "ok" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("viewer-ping error", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
