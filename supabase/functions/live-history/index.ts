// live-history: histórico paginado das últimas 24h de sessões (live_viewers)
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
    const status = url.searchParams.get("status"); // all|started|pitch|cta|exited
    const search = (url.searchParams.get("search") ?? "").trim();
    const operationId = url.searchParams.get("operation_id");
    const crossOpIntent = req.headers.get("x-cross-op-intent") === "true";
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
    const pageSize = Math.min(parseInt(url.searchParams.get("page_size") ?? "50", 10) || 50, 1000);
    const sinceMinutes = Math.min(
      Math.max(parseInt(url.searchParams.get("since_minutes") ?? "1440", 10) || 1440, 1),
      24 * 60,
    );

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
        function_name: "live-history",
        message: `admin cross-op read`,
        metadata: { user_id: userData.user.id, path: url.pathname, query: Object.fromEntries(url.searchParams) },
        operation_id: "00000000-0000-0000-0000-000000000000",
      });
    }

    const sinceIso = new Date(Date.now() - sinceMinutes * 60_000).toISOString();
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let q = admin
      .from("live_viewers")
      .select(
        "session_id, player_id, player_name, product, country, state, city, device_type, current_second_in_video, pitch_reached, cta_clicked, exit_reason, utm_source, utm_medium, utm_campaign, utm_content, utm_term, ad_id, clickid, account_id, operation_id, started_at, last_seen_at",
        { count: "exact" },
      )
      .gte("started_at", sinceIso)
      .order("started_at", { ascending: false });

    if (playerId && playerId !== "all") q = q.eq("player_id", playerId);
    if (product && product !== "all") q = q.eq("product", product);
    if (adId && adId !== "all") q = q.eq("ad_id", adId);
    if (operationId) q = q.eq("operation_id", operationId);

    if (status === "cta") q = q.eq("cta_clicked", true);
    else if (status === "pitch") q = q.eq("pitch_reached", true).eq("cta_clicked", false);
    else if (status === "exited") q = q.in("exit_reason", ["exited", "timeout"]);
    else if (status === "started") q = q.eq("pitch_reached", false).eq("cta_clicked", false).is("exit_reason", null);

    if (search) {
      const s = search.replace(/[%,]/g, " ").trim();
      // OR busca em utm_campaign, ad_id, country, state, city, session_id, clickid
      q = q.or(
        [
          `utm_campaign.ilike.%${s}%`,
          `ad_id.ilike.%${s}%`,
          `country.ilike.%${s}%`,
          `state.ilike.%${s}%`,
          `city.ilike.%${s}%`,
          `session_id.ilike.%${s}%`,
          `clickid.ilike.%${s}%`,
          `utm_term.ilike.%${s}%`,
        ].join(","),
      );
    }

    const { data, count, error } = await q.range(from, to);
    if (error) throw error;

    return new Response(
      JSON.stringify({ rows: data ?? [], total: count ?? 0, page, page_size: pageSize }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("live-history error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
