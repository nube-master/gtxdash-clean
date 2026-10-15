// live-viewers: snapshot agregado para o painel
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
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const url = new URL(req.url);
    const playerId = url.searchParams.get("player_id");
    const product = url.searchParams.get("product");
    const accountId = url.searchParams.get("account_id");
    const adId = url.searchParams.get("ad_id");
    const operationId = url.searchParams.get("operation_id");
    const mode = url.searchParams.get("mode"); // "player_history" → drill-down hourly
    const crossOpIntent = req.headers.get("x-cross-op-intent") === "true";

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    // determine accessible operations for the user
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userData.user.id);
    const isAdmin = (roles ?? []).some((r: any) => r.role === "admin");

    // ── Strict scoping (F9-DIA3.5) ────────────────────────────────
    // Requer operation_id OU header x-cross-op-intent (admin only).
    // Bloqueia leituras cross-op não intencionais (admin bypass anterior).
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
        function_name: "live-viewers",
        message: `admin cross-op read`,
        metadata: { user_id: userData.user.id, path: url.pathname, query: Object.fromEntries(url.searchParams) },
        operation_id: "00000000-0000-0000-0000-000000000000",
      });
    }
    // opIds fallback removido — sempre filtra por operationId quando presente;
    // sem operationId, só admin+intent chega até aqui (sem filtro = leitura cross-op consciente).

    // ──────────────────────────────────────────────────────────
    // MODE: player_history → evolução horária do tempo na sessão
    // (BRT, hoje 00:00 → agora). Requer player_id.
    // ──────────────────────────────────────────────────────────
    if (mode === "player_history") {
      if (!playerId) {
        return new Response(JSON.stringify({ error: "player_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      // Início do dia em BRT (UTC-3): hoje 00:00 BRT == 03:00 UTC
      const now = new Date();
      const brtNow = new Date(now.getTime() - 3 * 3600_000);
      const brtMidnight = new Date(Date.UTC(brtNow.getUTCFullYear(), brtNow.getUTCMonth(), brtNow.getUTCDate(), 0, 0, 0));
      const startUtc = new Date(brtMidnight.getTime() + 3 * 3600_000); // 03:00 UTC

      let hq = admin.from("live_viewers")
        .select("session_id, started_at, last_seen_at, current_second_in_video, account_id, operation_id, product, player_id")
        .eq("player_id", playerId)
        .gte("started_at", startUtc.toISOString());
      if (product) hq = hq.eq("product", product);
      if (accountId) hq = hq.eq("account_id", accountId);
      if (operationId) hq = hq.eq("operation_id", operationId);

      const { data: rows, error: hErr } = await hq.limit(20000);
      if (hErr) throw hErr;

      // Bucketize por hora BRT
      type HBucket = { hour: number; t: string; viewers: number; sessions: number[] };
      const buckets = new Map<number, HBucket>();
      const seenSession = new Set<string>();
      for (const r of rows ?? []) {
        if (seenSession.has(r.session_id)) continue;
        seenSession.add(r.session_id);
        const startedUtc = new Date(r.started_at).getTime();
        const lastUtc = new Date(r.last_seen_at).getTime();
        const durationSecs = Math.max(0, Math.round((lastUtc - startedUtc) / 1000));
        // Hora BRT
        const startedBrt = new Date(startedUtc - 3 * 3600_000);
        const hour = startedBrt.getUTCHours();
        const hourKey = hour;
        if (!buckets.has(hourKey)) {
          // representação ISO da hora cheia em UTC (para o cliente formatar)
          const hourStartUtc = new Date(startUtc.getTime() + hour * 3600_000);
          buckets.set(hourKey, { hour, t: hourStartUtc.toISOString(), viewers: 0, sessions: [] });
        }
        const b = buckets.get(hourKey)!;
        b.viewers++;
        b.sessions.push(durationSecs);
      }
      const med = (arr: number[]) => {
        if (!arr.length) return 0;
        const s = [...arr].sort((a, b) => a - b);
        const m = Math.floor(s.length / 2);
        return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
      };
      const av = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
      const series = Array.from(buckets.values())
        .sort((a, b) => a.hour - b.hour)
        .map((b) => ({
          hour: b.hour,
          t: b.t,
          viewers: b.viewers,
          avg_secs: av(b.sessions),
          median_secs: med(b.sessions),
          p90_secs: (() => {
            if (!b.sessions.length) return 0;
            const s = [...b.sessions].sort((a, b) => a - b);
            return s[Math.min(s.length - 1, Math.floor(s.length * 0.9))];
          })(),
          session_seconds: b.sessions, // raw para client-side bucketize
        }));

      return new Response(JSON.stringify({ player_id: playerId, series }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let q = admin.from("live_viewers")
      .select("player_id, player_name, country, state, city, device_type, pitch_reached, cta_clicked, ad_id, account_id, product, operation_id, current_second_in_video, started_at, last_seen_at")
      .gte("last_seen_at", new Date(Date.now() - 180_000).toISOString())
      .eq("exit_reason", "active");

    if (playerId) q = q.eq("player_id", playerId);
    if (product) q = q.eq("product", product);
    if (accountId) q = q.eq("account_id", accountId);
    if (adId) q = q.eq("ad_id", adId);
    if (operationId) q = q.eq("operation_id", operationId);

    const { data: viewers, error } = await q.limit(5000);
    if (error) throw error;

    const list = viewers ?? [];

    type LocAgg = { country: string; state: string | null; count: number };
    type DeviceAgg = { mobile: number; desktop: number; tablet: number };
    type DeviceFunnel = { count: number; pitch: number; cta: number };
    type DeviceFunnelAgg = { mobile: DeviceFunnel; desktop: DeviceFunnel; tablet: DeviceFunnel; unknown: DeviceFunnel };
    const newDeviceFunnel = (): DeviceFunnelAgg => ({
      mobile: { count: 0, pitch: 0, cta: 0 },
      desktop: { count: 0, pitch: 0, cta: 0 },
      tablet: { count: 0, pitch: 0, cta: 0 },
      unknown: { count: 0, pitch: 0, cta: 0 },
    });
    type PlayerAgg = {
      player_id: string;
      player_name: string | null;
      product: string | null;
      count: number;
      by_country: LocAgg[];
      by_device: DeviceAgg;
      viewers_at_pitch: number;
      viewers_at_cta: number;
      by_session_duration?: { d_0_5: number; d_5_15: number; d_15_30: number; d_30_60: number; d_60_plus: number };
      avg_session_seconds?: number;
      median_session_seconds?: number;
      bucket_avg_seconds?: { d_0_5: number; d_5_15: number; d_15_30: number; d_30_60: number; d_60_plus: number };
    };

    type DurAgg = { d_0_5: number; d_5_15: number; d_15_30: number; d_30_60: number; d_60_plus: number };
    type BucketKey = keyof DurAgg;
    const newDur = (): DurAgg => ({ d_0_5: 0, d_5_15: 0, d_15_30: 0, d_30_60: 0, d_60_plus: 0 });
    const bucketOf = (secs: number): BucketKey => {
      const m = secs / 60;
      if (m < 5) return "d_0_5";
      if (m < 15) return "d_5_15";
      if (m < 30) return "d_15_30";
      if (m < 60) return "d_30_60";
      return "d_60_plus";
    };
    const bumpDur = (agg: DurAgg, secs: number) => { agg[bucketOf(secs)]++; };
    const median = (arr: number[]): number => {
      if (!arr.length) return 0;
      const s = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(s.length / 2);
      return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
    };
    const avg = (arr: number[]): number => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

    const globalCountry = new Map<string, LocAgg>();
    const playerMap = new Map<string, {
      player_id: string;
      player_name: string | null;
      product: string | null;
      count: number;
      country: Map<string, LocAgg>;
      device: DeviceAgg;
      atPitch: number;
      atCta: number;
      duration: DurAgg;
      sessions: number[];
      bucketSecs: Record<BucketKey, number[]>;
    }>();
    let mobile = 0, desktop = 0, tablet = 0;
    let atPitch = 0, atCta = 0;
    const globalDeviceFunnel = newDeviceFunnel();
    const globalDuration = newDur();
    const globalSessions: number[] = [];
    const globalBucketSecs: Record<BucketKey, number[]> = { d_0_5: [], d_5_15: [], d_15_30: [], d_30_60: [], d_60_plus: [] };
    // Curva de retenção live: distribuição de current_second_in_video por player (bucket de 30s)
    const SECONDS_BUCKET_SIZE = 30;
    const playerSecondsHist = new Map<string, Map<number, number>>();
    const now = Date.now();

    for (const v of list) {
      if (v.country) {
        const k = `${v.country}|${v.state ?? ""}`;
        const cur = globalCountry.get(k) ?? { country: v.country, state: v.state, count: 0 };
        cur.count++;
        globalCountry.set(k, cur);
      }
      const pk = v.player_id;
      let p = playerMap.get(pk);
      if (!p) {
        p = {
          player_id: pk,
          player_name: v.player_name,
          product: v.product,
          count: 0,
          country: new Map(),
          device: { mobile: 0, desktop: 0, tablet: 0 },
          atPitch: 0,
          atCta: 0,
          duration: newDur(),
          sessions: [],
          bucketSecs: { d_0_5: [], d_5_15: [], d_15_30: [], d_30_60: [], d_60_plus: [] },
        };
        playerMap.set(pk, p);
      }
      p.count++;
      if (v.country) {
        const k = `${v.country}|${v.state ?? ""}`;
        const cur = p.country.get(k) ?? { country: v.country, state: v.state, count: 0 };
        cur.count++;
        p.country.set(k, cur);
      }
      const devKey: keyof DeviceFunnelAgg =
        v.device_type === "mobile" ? "mobile" :
        v.device_type === "desktop" ? "desktop" :
        v.device_type === "tablet" ? "tablet" : "unknown";
      if (devKey === "mobile") { mobile++; p.device.mobile++; }
      else if (devKey === "desktop") { desktop++; p.device.desktop++; }
      else if (devKey === "tablet") { tablet++; p.device.tablet++; }
      globalDeviceFunnel[devKey].count++;
      if (v.pitch_reached) { atPitch++; p.atPitch++; globalDeviceFunnel[devKey].pitch++; }
      if (v.cta_clicked) { atCta++; p.atCta++; globalDeviceFunnel[devKey].cta++; }
      const startedMs = v.started_at ? new Date(v.started_at).getTime() : now;
      const sessionSecs = Math.max(0, Math.floor((now - startedMs) / 1000));
      const bk = bucketOf(sessionSecs);
      bumpDur(globalDuration, sessionSecs);
      bumpDur(p.duration, sessionSecs);
      globalSessions.push(sessionSecs);
      globalBucketSecs[bk].push(sessionSecs);
      p.sessions.push(sessionSecs);
      p.bucketSecs[bk].push(sessionSecs);
      // Live retention curve por VSL
      const cur = Math.max(0, Math.floor(Number(v.current_second_in_video) || 0));
      const bucketSec = Math.floor(cur / SECONDS_BUCKET_SIZE) * SECONDS_BUCKET_SIZE;
      let hist = playerSecondsHist.get(pk);
      if (!hist) { hist = new Map(); playerSecondsHist.set(pk, hist); }
      hist.set(bucketSec, (hist.get(bucketSec) ?? 0) + 1);
    }

    const total = list.length;
    const byCountry = Array.from(globalCountry.values())
      .map(c => ({ ...c, pct: total ? Math.round((c.count / total) * 1000) / 10 : 0 }))
      .sort((a, b) => b.count - a.count);

    const players: (PlayerAgg & { share_pct: number; session_seconds?: number[] })[] = Array.from(playerMap.values())
      .map(p => ({
        player_id: p.player_id,
        player_name: p.player_name,
        product: p.product,
        count: p.count,
        share_pct: total ? Math.round((p.count / total) * 1000) / 10 : 0,
        by_country: Array.from(p.country.values())
          .map(c => ({ ...c, pct: p.count ? Math.round((c.count / p.count) * 1000) / 10 : 0 }))
          .sort((a, b) => b.count - a.count),
        by_device: p.device,
        viewers_at_pitch: p.atPitch,
        viewers_at_cta: p.atCta,
        by_session_duration: p.duration,
        avg_session_seconds: avg(p.sessions),
        median_session_seconds: median(p.sessions),
        bucket_avg_seconds: {
          d_0_5: avg(p.bucketSecs.d_0_5),
          d_5_15: avg(p.bucketSecs.d_5_15),
          d_15_30: avg(p.bucketSecs.d_15_30),
          d_30_60: avg(p.bucketSecs.d_30_60),
          d_60_plus: avg(p.bucketSecs.d_60_plus),
        },
        session_seconds: p.sessions, // raw, for client-side dynamic bucketing
        seconds_curve: (() => {
          const hist = playerSecondsHist.get(p.player_id);
          if (!hist) return [];
          return Array.from(hist.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([sec, viewers]) => ({ sec, viewers }));
        })(),
      }))
      .sort((a, b) => b.count - a.count);

    const byPlayer = players.map(p => ({ player_id: p.player_id, player_name: p.player_name, count: p.count }));

    // Concurrent series (last 24h, 5min buckets)
    let series: { t: string; viewers: number }[] = [];
    {
      let evQ = admin.from("live_events")
        .select("session_id, created_at, player_id, product, account_id, operation_id")
        .gte("created_at", new Date(Date.now() - 24 * 3600_000).toISOString())
        .eq("event_type", "heartbeat");
      if (playerId) evQ = evQ.eq("player_id", playerId);
      if (product) evQ = evQ.eq("product", product);
      if (accountId) evQ = evQ.eq("account_id", accountId);
      if (adId) evQ = evQ.eq("ad_id", adId);
      if (operationId) evQ = evQ.eq("operation_id", operationId);

      const { data: events } = await evQ.limit(50000);
      const buckets = new Map<number, Set<string>>();
      for (const e of events ?? []) {
        const t = new Date(e.created_at).getTime();
        const b = Math.floor(t / 300_000) * 300_000;
        if (!buckets.has(b)) buckets.set(b, new Set());
        buckets.get(b)!.add(e.session_id);
      }
      series = Array.from(buckets.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([t, s]) => ({ t: new Date(t).toISOString(), viewers: s.size }));
    }

    // VSLs INATIVAS no momento (com tráfego nas últimas N horas, mas zero viewers ativos agora)
    const inactiveWindowHours = Number(url.searchParams.get("inactive_window_hours") ?? "6");
    let inactive_players: { player_id: string; player_name: string | null; product: string | null; viewers_window: number; last_seen_at: string }[] = [];
    {
      const windowStart = new Date(Date.now() - inactiveWindowHours * 3600_000).toISOString();
      let iq = admin.from("live_viewers")
        .select("player_id, player_name, product, last_seen_at, session_id")
        .gte("last_seen_at", windowStart);
      if (playerId) iq = iq.eq("player_id", playerId);
      if (product) iq = iq.eq("product", product);
      if (accountId) iq = iq.eq("account_id", accountId);
      if (adId) iq = iq.eq("ad_id", adId);
      if (operationId) iq = iq.eq("operation_id", operationId);

      const { data: recentRows } = await iq.limit(20000);
      const activeIds = new Set(players.map((p) => p.player_id));
      type Acc = { player_id: string; player_name: string | null; product: string | null; sessions: Set<string>; last_seen_at: string };
      const map = new Map<string, Acc>();
      for (const r of recentRows ?? []) {
        if (activeIds.has(r.player_id)) continue;
        let acc = map.get(r.player_id);
        if (!acc) {
          acc = { player_id: r.player_id, player_name: r.player_name, product: r.product, sessions: new Set(), last_seen_at: r.last_seen_at };
          map.set(r.player_id, acc);
        }
        acc.sessions.add(r.session_id);
        if (new Date(r.last_seen_at).getTime() > new Date(acc.last_seen_at).getTime()) {
          acc.last_seen_at = r.last_seen_at;
        }
      }
      inactive_players = Array.from(map.values())
        .map((a) => ({
          player_id: a.player_id,
          player_name: a.player_name,
          product: a.product,
          viewers_window: a.sessions.size,
          last_seen_at: a.last_seen_at,
        }))
        .sort((a, b) => new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime());
    }
    // ──────────────────────────────────────────────────────────
    // SALE ATTRIBUTION: vendas atribuídas hoje (BRT) e por player
    // ──────────────────────────────────────────────────────────
    const nowMs = Date.now();
    const brtNow2 = new Date(nowMs - 3 * 3600_000);
    const brtMid2 = new Date(Date.UTC(brtNow2.getUTCFullYear(), brtNow2.getUTCMonth(), brtNow2.getUTCDate(), 0, 0, 0));
    const todayStartUtc = new Date(brtMid2.getTime() + 3 * 3600_000).toISOString();

    let live_kpis = {
      sales_today: 0,
      revenue_today_usd: 0,
      cr_live_pct: 0,
      avg_time_to_sale_seconds: 0,
      tts_p50_seconds: 0,
      tts_p90_seconds: 0,
      orphans_today: 0,
      matched_today: 0,
      coverage_pct: 0,
    };
    const salesByPlayer = new Map<string, { sales: number; revenue: number; last_sale_at: string | null }>();

    {
      let sq = admin.from("live_sale_attribution")
        .select("sale_value_usd, sale_at, matched_player_id, time_to_sale_seconds, is_orphan, sale_status, operation_id")
        .gte("sale_at", todayStartUtc)
        .eq("sale_status", "CONVERTED");
      if (operationId) sq = sq.eq("operation_id", operationId);

      const { data: sales } = await sq.limit(5000);
      const ttsArr: number[] = [];
      for (const s of sales ?? []) {
        live_kpis.sales_today++;
        live_kpis.revenue_today_usd += Number(s.sale_value_usd || 0);
        if (s.is_orphan) live_kpis.orphans_today++;
        if (Number.isFinite(s.time_to_sale_seconds) && s.time_to_sale_seconds! > 0) {
          ttsArr.push(s.time_to_sale_seconds as number);
        }
        const pid = s.matched_player_id;
        if (pid) {
          let acc = salesByPlayer.get(pid);
          if (!acc) { acc = { sales: 0, revenue: 0, last_sale_at: null }; salesByPlayer.set(pid, acc); }
          acc.sales++;
          acc.revenue += Number(s.sale_value_usd || 0);
          if (!acc.last_sale_at || new Date(s.sale_at).getTime() > new Date(acc.last_sale_at).getTime()) {
            acc.last_sale_at = s.sale_at;
          }
        }
      }
      live_kpis.revenue_today_usd = Math.round(live_kpis.revenue_today_usd * 100) / 100;
      live_kpis.avg_time_to_sale_seconds = avg(ttsArr);
      // p50/p90 do TTS
      const percentile = (arr: number[], p: number) => {
        if (!arr.length) return 0;
        const s = [...arr].sort((a, b) => a - b);
        return s[Math.min(s.length - 1, Math.floor(s.length * p))];
      };
      live_kpis.tts_p50_seconds = percentile(ttsArr, 0.5);
      live_kpis.tts_p90_seconds = percentile(ttsArr, 0.9);
      live_kpis.matched_today = live_kpis.sales_today - live_kpis.orphans_today;
      live_kpis.coverage_pct = live_kpis.sales_today
        ? Math.round((live_kpis.matched_today / live_kpis.sales_today) * 10000) / 100
        : 0;
      // CR live = sales atribuídas (não-órfãs) / viewers únicos hoje. Para snapshot, usa total ativos como proxy.
      live_kpis.cr_live_pct = total ? Math.round((live_kpis.matched_today / total) * 10000) / 100 : 0;
    }

    // Enriquece players com vendas atribuídas
    const playersEnriched = players.map((p) => {
      const s = salesByPlayer.get(p.player_id);
      return {
        ...p,
        sales_today: s?.sales ?? 0,
        revenue_today_usd: s ? Math.round(s.revenue * 100) / 100 : 0,
        last_sale_at: s?.last_sale_at ?? null,
      };
    });

    return new Response(JSON.stringify({
      total_viewers: total,
      by_country: byCountry,
      by_device: { mobile, desktop, tablet },
      device_funnel: globalDeviceFunnel,
      by_player: byPlayer,
      players: playersEnriched,
      viewers_at_pitch: atPitch,
      viewers_at_cta: atCta,
      by_session_duration: globalDuration,
      avg_session_seconds: avg(globalSessions),
      median_session_seconds: median(globalSessions),
      bucket_avg_seconds: {
        d_0_5: avg(globalBucketSecs.d_0_5),
        d_5_15: avg(globalBucketSecs.d_5_15),
        d_15_30: avg(globalBucketSecs.d_15_30),
        d_30_60: avg(globalBucketSecs.d_30_60),
        d_60_plus: avg(globalBucketSecs.d_60_plus),
      },
      session_seconds: globalSessions,
      concurrent_series: series,
      inactive_players,
      inactive_window_hours: inactiveWindowHours,
      live_kpis,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("live-viewers error", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
