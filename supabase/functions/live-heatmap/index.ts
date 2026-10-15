// live-heatmap: agrega viewers únicos (sessions) por hora x dia da semana (BRT) nos últimos 7 dias
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
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
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
    const operationId = url.searchParams.get("operation_id");
    const crossOpIntent = req.headers.get("x-cross-op-intent") === "true";
    const days = Math.min(Math.max(parseInt(url.searchParams.get("days") ?? "7", 10) || 7, 1), 30);

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
        function_name: "live-heatmap",
        message: `admin cross-op read`,
        metadata: { user_id: userData.user.id, path: url.pathname, query: Object.fromEntries(url.searchParams) },
        operation_id: "00000000-0000-0000-0000-000000000000",
      });
    }

    const sinceIso = new Date(Date.now() - days * 24 * 3600_000).toISOString();

    // Agregação server-side via RPC (evita puxar dezenas de milhares de rows)
    const { data: aggRows, error: aggErr } = await userClient.rpc("get_live_viewers_heatmap", {
      p_since: sinceIso,
      p_player_id: playerId && playerId !== "all" ? playerId : null,
      p_product: product && product !== "all" ? product : null,
      p_ad_id: adId && adId !== "all" ? adId : null,
      p_operation_id: operationId || null,
      p_operation_ids: null,
    });
    if (aggErr) throw aggErr;

    const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    let samplesCount = 0;
    for (const r of (aggRows ?? []) as any[]) {
      const d = Number(r.dow);
      const h = Number(r.hour);
      if (d >= 0 && d < 7 && h >= 0 && h < 24) {
        grid[d][h] = Number(r.viewers) || 0;
        samplesCount += Number(r.samples) || 0;
      }
    }

    // peak detection
    let max = 0, peakDay = 0, peakHour = 0;
    let total = 0;
    const hourTotals = Array(24).fill(0);
    const dayTotals = Array(7).fill(0);
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        const v = grid[d][h];
        total += v;
        hourTotals[h] += v;
        dayTotals[d] += v;
        if (v > max) { max = v; peakDay = d; peakHour = h; }
      }
    }

    return new Response(
      JSON.stringify({
        grid,
        max,
        total,
        peak: { day: peakDay, hour: peakHour, viewers: max },
        hour_totals: hourTotals,
        day_totals: dayTotals,
        days_window: days,
        samples: samplesCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    const msg = e?.message ?? e?.error_description ?? e?.hint ?? (typeof e === "string" ? e : JSON.stringify(e));
    console.error("live-heatmap error", { message: msg, code: e?.code, details: e?.details, hint: e?.hint, raw: e });
    return new Response(JSON.stringify({ error: msg, code: e?.code ?? null, details: e?.details ?? null }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
