// live-leads: feed dos últimos N leads (viewers) com UTMs/ad_id + lista de ad_ids ativos 24h
// Inclui agora top_campaigns com pitch%/cta% (P8) e summary global 24h.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const jwt = auth.replace(/^Bearer\s+/i, "").trim();
    const authClient = createClient(SUPABASE_URL, SERVICE_ROLE || ANON, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = jwt
      ? await authClient.auth.getUser(jwt)
      : { data: null as any, error: new Error("missing token") };
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const playerId = url.searchParams.get("player_id");
    const product = url.searchParams.get("product");
    const adId = url.searchParams.get("ad_id");
    const accountId = url.searchParams.get("account_id");
    const operationId = url.searchParams.get("operation_id");
    const crossOpIntent = req.headers.get("x-cross-op-intent") === "true";
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 200);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userData.user.id);
    const isAdmin = (roles ?? []).some((r: any) => r.role === "admin");

    // ── Strict scoping (F9-DIA3.5) ─────
    if (crossOpIntent && !isAdmin) {
      return new Response(JSON.stringify({ error: "cross_op_intent requires admin" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!operationId && !crossOpIntent) {
      return new Response(JSON.stringify({ error: "operation_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!isAdmin && operationId) {
      const { data: mem } = await admin.from("operation_members").select("operation_id").eq("user_id", userData.user.id).eq("operation_id", operationId).eq("status", "active").maybeSingle();
      if (!mem) return new Response(JSON.stringify({ error: "operation not accessible" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (crossOpIntent && isAdmin) {
      await admin.from("system_logs").insert({
        type: "cross_op_read",
        function_name: "live-leads",
        message: `admin cross-op read`,
        metadata: { user_id: userData.user.id, path: url.pathname, query: Object.fromEntries(url.searchParams) },
        operation_id: "00000000-0000-0000-0000-000000000000",
      });
    }

    const since24h = new Date(Date.now() - 24 * 3600_000).toISOString();
    const since60m = new Date(Date.now() - 60 * 60_000).toISOString();

    // Últimos N leads
    let q = admin
      .from("live_viewers")
      .select(
        "session_id, player_id, player_name, product, country, state, city, device_type, current_second_in_video, pitch_reached, cta_clicked, exit_reason, utm_source, utm_medium, utm_campaign, utm_content, utm_term, ad_id, clickid, account_id, operation_id, started_at, last_seen_at",
      )
      .gte("started_at", since24h)
      .order("started_at", { ascending: false });

    if (playerId && playerId !== "all") q = q.eq("player_id", playerId);
    if (product && product !== "all") q = q.eq("product", product);
    if (adId && adId !== "all") q = q.eq("ad_id", adId);
    if (accountId) q = q.eq("account_id", accountId);
    if (operationId) q = q.eq("operation_id", operationId);

    const { data: leads, error } = await q.limit(limit);
    if (error) throw error;

    // Lista de ad_ids 24h
    let adsQ = admin
      .from("live_viewers")
      .select("ad_id, utm_campaign")
      .not("ad_id", "is", null)
      .gte("started_at", since24h);
    if (operationId) adsQ = adsQ.eq("operation_id", operationId);
    const { data: adsRows } = await adsQ.limit(5000);
    const adAgg = new Map<string, { ad_id: string; utm_campaign: string | null; count: number }>();
    for (const r of adsRows ?? []) {
      if (!r.ad_id) continue;
      const cur = adAgg.get(r.ad_id) ?? { ad_id: r.ad_id, utm_campaign: r.utm_campaign, count: 0 };
      cur.count++;
      if (!cur.utm_campaign && r.utm_campaign) cur.utm_campaign = r.utm_campaign;
      adAgg.set(r.ad_id, cur);
    }
    const ads = Array.from(adAgg.values()).sort((a, b) => b.count - a.count);

    // Top campanhas 60min com conversão (P8)
    // Tráfego nativo (MGID/Newsbreak) chega sem utm_campaign no player.
    // Nesse caso resolvemos Viewer -> clickid -> redtrack_events -> campanha real (MGID).
    let campQ = admin
      .from("live_viewers")
      .select("utm_campaign, utm_source, player_name, ad_id, clickid, product_slug, product, pitch_reached, cta_clicked")
      .gte("started_at", since60m);
    if (playerId && playerId !== "all") campQ = campQ.eq("player_id", playerId);
    if (product && product !== "all") campQ = campQ.eq("product", product);
    if (adId && adId !== "all") campQ = campQ.eq("ad_id", adId);
    if (operationId) campQ = campQ.eq("operation_id", operationId);
    const { data: campRows } = await campQ.limit(5000);

    // ── Resolução clickid -> campanha real ──────────────────────────────
    // clickids dos viewers sem utm_campaign
    const pendingClickIds = Array.from(
      new Set(
        (campRows ?? [])
          .filter((r: any) => !(r.utm_campaign ?? "").trim() && (r.clickid ?? "").trim())
          .map((r: any) => String(r.clickid).trim()),
      ),
    ).slice(0, 3000);

    // clickid -> { source, campaignId, campaignName }
    const clickMap = new Map<string, { source: string; campaignId: string | null; campaignName: string | null }>();
    if (pendingClickIds.length) {
      const CHUNK = 300;
      for (let i = 0; i < pendingClickIds.length; i += CHUNK) {
        const slice = pendingClickIds.slice(i, i + CHUNK);
        let rtQ = admin
          .from("redtrack_events")
          .select("clickid, utm_source, utm_campaign, utm_content, occurred_at")
          .in("clickid", slice)
          .gte("occurred_at", new Date(Date.now() - 48 * 3600_000).toISOString())
          .order("occurred_at", { ascending: false });
        if (operationId) rtQ = rtQ.eq("operation_id", operationId);
        const { data: rtRows } = await rtQ.limit(5000);
        for (const r of rtRows ?? []) {
          const cid = (r.clickid ?? "").trim();
          if (!cid || clickMap.has(cid)) continue; // primeiro = mais recente
          const src = (r.utm_source ?? "").trim().toUpperCase();
          const content = (r.utm_content ?? "").trim();
          clickMap.set(cid, {
            source: src,
            campaignId: /^\d{4,}$/.test(content) ? content : null,
            campaignName: (r.utm_campaign ?? "").trim() || null,
          });
        }
      }
    }

    // nomes reais das campanhas MGID
    const mgidIds = Array.from(
      new Set(Array.from(clickMap.values()).filter((v) => v.source === "MGID" && v.campaignId).map((v) => v.campaignId!)),
    );
    const mgidNames = new Map<string, string>();
    if (mgidIds.length) {
      let mQ = admin.from("mgid_campaign_status").select("campaign_id, campaign_name").in("campaign_id", mgidIds);
      if (operationId) mQ = mQ.eq("operation_id", operationId);
      const { data: mRows } = await mQ;
      for (const m of mRows ?? []) {
        if (m.campaign_id && m.campaign_name) mgidNames.set(String(m.campaign_id), m.campaign_name);
      }
    }

    const campAgg = new Map<string, {
      utm_campaign: string;
      viewers: number;
      ad_ids: Set<string>;
      product: string | null;
      pitch: number;
      cta: number;
    }>();
    for (const r of campRows ?? []) {
      const utm = (r.utm_campaign ?? "").trim();
      const player = (r.player_name ?? "").trim();
      const src = (r.utm_source ?? "").trim();
      const cid = (r.clickid ?? "").trim();
      let key = utm;
      if (!key && cid) {
        const hit = clickMap.get(cid);
        if (hit) {
          if (hit.source === "MGID") {
            const realName = hit.campaignId ? mgidNames.get(hit.campaignId) : null;
            key = realName
              ? `[MGID] ${realName}`
              : hit.campaignId
                ? `[MGID] Campanha ${hit.campaignId}`
                : "[MGID] — identificando campanha";
          } else if (hit.campaignName) {
            key = hit.source ? `[${hit.source}] ${hit.campaignName}` : hit.campaignName;
          }
        }
      }
      if (!key) {
        // fallback: sem UTM e sem match no RedTrack -> usa default da operação
        const OP_DEFAULT_SOURCE = {
          '8707b3f8-ab41-4a63-902c-9ab97fe50c8a': 'FACEBOOK',  // FAHTO 100% FB
          '1dd606e3-dac2-4064-b863-9784307c9e98': 'FACEBOOK',  // EDD 100% FB
          '0b758a2b-1b92-4769-b47b-416c567e320d': 'MGID',      // GTX default MGID
        };
        const defaultSrc = (OP_DEFAULT_SOURCE as any)[operationId ?? ''] || 'MGID';
        const srcTag = src ? `[${src.toUpperCase()}] ` : cid ? `[${defaultSrc}] — identificando campanha · ` : "[SEM UTM] ";
        key = player ? `${srcTag}${player}` : "";
      }
      if (!key) continue;
      const cur = campAgg.get(key) ?? {
        utm_campaign: key,
        viewers: 0,
        ad_ids: new Set<string>(),
        product: r.product_slug ?? r.product ?? null,
        pitch: 0,
        cta: 0,
      };
      cur.viewers++;
      if (r.pitch_reached) cur.pitch++;
      if (r.cta_clicked) cur.cta++;
      if (r.ad_id) cur.ad_ids.add(r.ad_id);
      campAgg.set(key, cur);
    }


    const top_campaigns = Array.from(campAgg.values())
      .map((c) => ({
        utm_campaign: c.utm_campaign,
        viewers: c.viewers,
        ads: c.ad_ids.size,
        product: c.product,
        pitch: c.pitch,
        cta: c.cta,
        pitch_rate: c.viewers ? Math.round((c.pitch / c.viewers) * 1000) / 10 : 0,
        cta_rate: c.viewers ? Math.round((c.cta / c.viewers) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.viewers - a.viewers)
      .slice(0, 15);

    // Lista de produtos 24h
    let prodQ = admin
      .from("live_viewers")
      .select("product_slug, product")
      .gte("started_at", since24h);
    if (operationId) prodQ = prodQ.eq("operation_id", operationId);
    const { data: prodRows } = await prodQ.limit(5000);
    const prodAgg = new Map<string, { product: string; count: number }>();
    for (const r of prodRows ?? []) {
      const p = (r.product_slug ?? r.product ?? "").toString().toUpperCase();
      if (!p) continue;
      const cur = prodAgg.get(p) ?? { product: p, count: 0 };
      cur.count++;
      prodAgg.set(p, cur);
    }
    const products = Array.from(prodAgg.values()).sort((a, b) => b.count - a.count);

    // Summary global 24h (P8)
    let sumQ = admin
      .from("live_viewers")
      .select("pitch_reached, cta_clicked", { count: "exact" })
      .gte("started_at", since24h);
    if (playerId && playerId !== "all") sumQ = sumQ.eq("player_id", playerId);
    if (product && product !== "all") sumQ = sumQ.eq("product", product);
    if (adId && adId !== "all") sumQ = sumQ.eq("ad_id", adId);
    if (operationId) sumQ = sumQ.eq("operation_id", operationId);
    const { data: sumRows, count: total24 } = await sumQ.limit(10000);
    let pitch24 = 0, cta24 = 0;
    for (const r of sumRows ?? []) {
      if (r.pitch_reached) pitch24++;
      if (r.cta_clicked) cta24++;
    }
    const summary_24h = {
      total: total24 ?? (sumRows?.length ?? 0),
      pitch: pitch24,
      cta: cta24,
      pitch_rate: (total24 ?? 0) ? Math.round((pitch24 / (total24 as number)) * 1000) / 10 : 0,
      cta_rate: (total24 ?? 0) ? Math.round((cta24 / (total24 as number)) * 1000) / 10 : 0,
    };

    return new Response(JSON.stringify({ leads: leads ?? [], ads, top_campaigns, products, summary_24h }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("live-leads error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
