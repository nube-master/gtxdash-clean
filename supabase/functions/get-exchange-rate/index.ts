// =====================================================
// get-exchange-rate (Phase 2)
//
// Tiered fallback chain per currency pair:
//   1. base === target                → rate=1 (identity)
//   2. Fresh cache (< TTL)            → cache row
//   3. External fetch (multi-source)  → primary first, then fallbacks
//        USD→BRL: awesomeapi → BCB PTAX → frankfurter
//        other:   frankfurter
//   4. exchange_rates_daily snapshot  → most recent (<=7d) USD→BRL only
//   5. Stale cache (< 24h)            → serve stale + background refresh
//   6. Hardcoded last-resort fallback → USD→BRL=5.15
//
// Cache is auto-refreshed on every miss/expiry. When serving a stale value
// the function schedules an async background refresh so the next caller
// gets fresh data without paying the latency.
// =====================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CACHE_TTL_MIN = 15;
const STALE_FALLBACK_HOURS = 24;
const DAILY_SNAPSHOT_MAX_AGE_DAYS = 7;
const FETCH_TIMEOUT_MS = 5000;

// Last-resort hardcoded fallbacks (only used when every other tier fails)
const HARDCODED_FALLBACK: Record<string, number> = {
  "USD:BRL": 5.15,
  "EUR:USD": 1.08,
  "EUR:BRL": 5.6,
};

type RateRow = {
  base_currency: string;
  target_currency: string;
  rate: number;
  source: string;
  fetched_at: string;
  expires_at: string;
};

type Resolved =
  | {
      rate: number;
      fetched_at: string;
      stale: boolean;
      source: string;
      tier: string;
    }
  | { error: string; target: string };

// ---------- cache helpers ----------
async function readCache(
  admin: any,
  base: string,
  target: string,
): Promise<RateRow | null> {
  const { data } = await admin
    .from("exchange_rates_cache")
    .select("*")
    .eq("base_currency", base)
    .eq("target_currency", target)
    .maybeSingle();
  return data ?? null;
}

async function upsertCache(
  admin: any,
  base: string,
  target: string,
  rate: number,
  source: string,
) {
  const now = new Date();
  const expires = new Date(now.getTime() + CACHE_TTL_MIN * 60 * 1000);
  await admin.from("exchange_rates_cache").upsert(
    {
      base_currency: base,
      target_currency: target,
      rate,
      source,
      fetched_at: now.toISOString(),
      expires_at: expires.toISOString(),
    },
    { onConflict: "base_currency,target_currency" },
  );
}

// ---------- HTTP ----------
async function fetchJson(url: string, timeout = FETCH_TIMEOUT_MS): Promise<any | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ---------- validation ----------
function isSane(base: string, target: string, rate: number): boolean {
  if (!Number.isFinite(rate) || rate <= 0) return false;
  if (base === "USD" && target === "BRL") return rate > 3 && rate < 10;
  if (base === "USD" && target === "EUR") return rate > 0.6 && rate < 1.5;
  if (base === "EUR" && target === "USD") return rate > 0.7 && rate < 1.8;
  if (base === "EUR" && target === "BRL") return rate > 3 && rate < 12;
  return rate > 0 && rate < 1e6;
}

const round = (n: number, dp = 6) => {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
};

// ---------- external sources ----------
async function fetchAwesomeUsdBrl() {
  const aw = await fetchJson("https://economia.awesomeapi.com.br/json/last/USD-BRL");
  const bid = parseFloat(aw?.USDBRL?.bid);
  if (isSane("USD", "BRL", bid)) {
    return { rate: round(bid, 6), source: "awesomeapi_comercial" };
  }
  return null;
}

async function fetchBcbPtaxUsdBrl() {
  // Try today, then walk back up to 5 days (weekends/holidays return empty)
  for (let i = 0; i < 5; i++) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const yyyy = d.getUTCFullYear();
    const dateStr = `${mm}-${dd}-${yyyy}`;
    const url =
      `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='${dateStr}'&$top=1&$format=json`;
    const data = await fetchJson(url);
    const row = data?.value?.[0];
    if (row) {
      const buy = Number(row.cotacaoCompra);
      const sell = Number(row.cotacaoVenda);
      const avg = (buy + sell) / 2;
      if (isSane("USD", "BRL", avg)) return { rate: round(avg, 6), source: "bcb_ptax" };
    }
  }
  return null;
}

async function fetchFrankfurter(base: string, target: string) {
  const fr = await fetchJson(
    `https://api.frankfurter.app/latest?from=${base}&to=${target}`,
  );
  const r = fr?.rates?.[target];
  if (isSane(base, target, r)) return { rate: round(r, 8), source: "frankfurter.app" };
  return null;
}

async function fetchExternal(
  base: string,
  target: string,
): Promise<{ rate: number; source: string } | null> {
  if (base === "USD" && target === "BRL") {
    return (
      (await fetchAwesomeUsdBrl()) ||
      (await fetchBcbPtaxUsdBrl()) ||
      (await fetchFrankfurter(base, target))
    );
  }
  return await fetchFrankfurter(base, target);
}

// ---------- daily snapshot fallback ----------
async function fetchDailySnapshot(
  admin: any,
  base: string,
  target: string,
): Promise<{ rate: number; source: string; fetched_at: string } | null> {
  if (!(base === "USD" && target === "BRL")) return null;
  const minDate = new Date();
  minDate.setUTCDate(minDate.getUTCDate() - DAILY_SNAPSHOT_MAX_AGE_DAYS);
  const { data } = await admin
    .from("exchange_rates_daily")
    .select("rate_avg, source, rate_date")
    .eq("currency_from", base)
    .eq("currency_to", target)
    .gte("rate_date", minDate.toISOString().slice(0, 10))
    .order("rate_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data && isSane(base, target, Number(data.rate_avg))) {
    return {
      rate: Number(data.rate_avg),
      source: `daily_snapshot:${data.source}`,
      fetched_at: `${data.rate_date}T00:00:00Z`,
    };
  }
  return null;
}

// ---------- resolver ----------
async function resolvePair(
  admin: any,
  base: string,
  target: string,
  opts: { force?: boolean } = {},
): Promise<Resolved> {
  if (base === target) {
    return {
      rate: 1,
      fetched_at: new Date().toISOString(),
      stale: false,
      source: "identity",
      tier: "identity",
    };
  }

  const cached = await readCache(admin, base, target);
  const now = Date.now();
  const cacheFresh =
    cached && new Date(cached.expires_at).getTime() > now && !opts.force;

  // Tier 2: fresh cache
  if (cacheFresh) {
    return {
      rate: Number(cached!.rate),
      fetched_at: cached!.fetched_at,
      stale: false,
      source: cached!.source,
      tier: "cache_fresh",
    };
  }

  // Tier 3: external
  const fresh = await fetchExternal(base, target);
  if (fresh) {
    await upsertCache(admin, base, target, fresh.rate, fresh.source);
    return {
      rate: fresh.rate,
      fetched_at: new Date().toISOString(),
      stale: false,
      source: fresh.source,
      tier: "external_fresh",
    };
  }

  // Tier 4: daily snapshot
  const snap = await fetchDailySnapshot(admin, base, target);
  if (snap) {
    await upsertCache(admin, base, target, snap.rate, snap.source);
    return {
      rate: snap.rate,
      fetched_at: snap.fetched_at,
      stale: true,
      source: snap.source,
      tier: "daily_snapshot",
    };
  }

  // Tier 5: stale cache <24h + schedule background refresh
  if (cached) {
    const ageHours = (now - new Date(cached.fetched_at).getTime()) / (3600 * 1000);
    if (ageHours < STALE_FALLBACK_HOURS) {
      scheduleBackgroundRefresh(admin, base, target);
      return {
        rate: Number(cached.rate),
        fetched_at: cached.fetched_at,
        stale: true,
        source: cached.source,
        tier: "cache_stale",
      };
    }
  }

  // Tier 6: hardcoded
  const hc = HARDCODED_FALLBACK[`${base}:${target}`];
  if (hc) {
    return {
      rate: hc,
      fetched_at: new Date().toISOString(),
      stale: true,
      source: "hardcoded_fallback",
      tier: "hardcoded",
    };
  }

  return { error: "rate_unavailable", target };
}

// Best-effort background refresh: re-attempt external fetch and update cache
function scheduleBackgroundRefresh(admin: any, base: string, target: string) {
  const task = (async () => {
    try {
      const fresh = await fetchExternal(base, target);
      if (fresh) {
        await upsertCache(admin, base, target, fresh.rate, fresh.source);
        console.log(`[bg-refresh] ${base}->${target} updated via ${fresh.source}`);
      }
    } catch (e) {
      console.warn(`[bg-refresh] ${base}->${target} failed:`, e);
    }
  })();
  // @ts-ignore EdgeRuntime is provided by Supabase Edge Functions runtime
  try { EdgeRuntime.waitUntil(task); } catch { /* noop in local dev */ }
}

// ---------- handler ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const url = new URL(req.url);
  const hasBase = !!url.searchParams.get("base");
  const base = (url.searchParams.get("base") || "USD").toUpperCase();
  const targetsParam = url.searchParams.get("targets");
  const force = url.searchParams.get("force") === "1";
  const legacyMode = !targetsParam && !hasBase;
  const targets = (targetsParam ? targetsParam.split(",") : ["BRL", "EUR"])
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);

  try {
    const entries = await Promise.all(
      targets.map(async (t) => [t, await resolvePair(admin, base, t, { force })] as const),
    );
    const rates: Record<string, Resolved> = {};
    for (const [t, v] of entries) rates[t] = v;

    // Backward compat: legacy call (no params) → { rate, source, cached, timestamp }
    if (legacyMode) {
      const brl = rates["BRL"];
      if (brl && !("error" in brl)) {
        return new Response(
          JSON.stringify({
            rate: brl.rate,
            source: brl.source,
            cached: brl.tier === "cache_fresh" || brl.tier === "cache_stale",
            stale: brl.stale,
            tier: brl.tier,
            timestamp: new Date().toISOString(),
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          rate: HARDCODED_FALLBACK["USD:BRL"],
          source: "hardcoded_fallback",
          cached: false,
          stale: true,
          tier: "hardcoded",
          error: "all_tiers_failed",
          timestamp: new Date().toISOString(),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ base, rates, ts: new Date().toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("get-exchange-rate error:", error);
    return new Response(
      JSON.stringify({ error: "internal_error", message: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
