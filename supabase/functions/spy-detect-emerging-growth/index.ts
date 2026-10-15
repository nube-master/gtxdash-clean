// Spy — Detecta ofertas em "Emerging Growth" (5d constantes + crescimento)
// Critério (PO 24/05):
//  - active_ads_count >= 10.000 em TODOS os 5 dias BRT consecutivos
//  - crescimento dia5 / dia1 >= +15% (OBRIGATÓRIO — diferente do constant_growth)
//  - cooldown próprio de 5d em spy_offers.last_emerging_growth_alert_at
//  - independente do constant_growth (7d/20k) — pode coexistir
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MIN_ADS = 10_000;
const MIN_DAYS = 5;
const MIN_GROWTH_PCT = 15;
const COOLDOWN_DAYS = 5;
const BRT_OFFSET_MS = -3 * 60 * 60 * 1000;

function brtDayKey(iso: string): string {
  const d = new Date(new Date(iso).getTime() + BRT_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

interface OfferRow {
  id: string;
  operation_id: string;
  offer_name: string;
  product_name: string | null;
  nicho: string | null;
  subnicho: string | null;
  trafego: string | null;
  active_ads_count: number;
  last_emerging_growth_alert_at: string | null;
}

interface HistoryRow {
  offer_id: string;
  snapshot_at: string;
  active_ads_count: number | null;
}

async function dispatchPushcut(alertId: string) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/spy-pushcut-notify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE}`,
      },
      body: JSON.stringify({ alert_id: alertId }),
    });
  } catch (e) {
    console.error(`[emerging-growth] pushcut dispatch failed for ${alertId}:`, (e as Error).message);
  }
}

async function detect() {
  const supa = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: offers, error: oErr } = await supa
    .from("spy_offers")
    .select("id, operation_id, offer_name, product_name, nicho, subnicho, trafego, active_ads_count, last_emerging_growth_alert_at")
    .gte("active_ads_count", MIN_ADS);

  if (oErr) {
    console.error("[emerging-growth] offers fetch error:", oErr.message);
    return { ok: false, error: oErr.message };
  }

  const candidates = (offers ?? []) as OfferRow[];
  console.log(`[emerging-growth] ${candidates.length} candidatas (>=${MIN_ADS} ads)`);

  if (!candidates.length) return { ok: true, scanned: 0, fired: 0 };

  // 6 dias pra ter margem (5 dias + hoje)
  const sinceIso = new Date(Date.now() - 6 * 24 * 3600 * 1000).toISOString();
  const ids = candidates.map((c) => c.id);
  const { data: history, error: hErr } = await supa
    .from("spy_history")
    .select("offer_id, snapshot_at, active_ads_count")
    .in("offer_id", ids)
    .gte("snapshot_at", sinceIso)
    .order("snapshot_at", { ascending: true });

  if (hErr) {
    console.error("[emerging-growth] history error:", hErr.message);
    return { ok: false, error: hErr.message };
  }

  const byOffer = new Map<string, Map<string, number>>();
  for (const h of (history ?? []) as HistoryRow[]) {
    const k = brtDayKey(h.snapshot_at);
    const inner = byOffer.get(h.offer_id) ?? new Map<string, number>();
    inner.set(k, h.active_ads_count ?? 0); // último do dia (ASC)
    byOffer.set(h.offer_id, inner);
  }

  const now = Date.now();
  const cooldownMs = COOLDOWN_DAYS * 24 * 3600 * 1000;
  let fired = 0;

  for (const offer of candidates) {
    if (offer.last_emerging_growth_alert_at) {
      const last = new Date(offer.last_emerging_growth_alert_at).getTime();
      if (now - last < cooldownMs) continue;
    }

    const days = byOffer.get(offer.id);
    if (!days || days.size < MIN_DAYS) continue;

    const sortedDays = Array.from(days.keys()).sort();
    const lastN = sortedDays.slice(-MIN_DAYS);
    if (lastN.length < MIN_DAYS) continue;

    const values = lastN.map((k) => days.get(k) ?? 0);
    // 1. todos >= MIN_ADS (constância)
    if (values.some((v) => v < MIN_ADS)) continue;

    // 2. crescimento dia5/dia1 >= MIN_GROWTH_PCT (obrigatório)
    const first = values[0];
    const last = values[values.length - 1];
    if (first <= 0) continue;
    const pct = ((last - first) / first) * 100;
    if (pct < MIN_GROWTH_PCT) continue;
    const pctRounded = Math.round(pct * 10) / 10;
    const dateRange = `${lastN[0]} → ${lastN[lastN.length - 1]}`;

    const title = `📈 Oferta emergindo: ${offer.offer_name}`;
    const body =
      `${MIN_DAYS}d constante acima de ${MIN_ADS.toLocaleString("pt-BR")} ads ` +
      `crescendo +${pctRounded}% (${first.toLocaleString("pt-BR")} → ${last.toLocaleString("pt-BR")}). ` +
      `Mercado aquecendo — fica de olho antes de virar gigante.`;

    const payload = {
      offer_id: offer.id,
      offer_name: offer.offer_name,
      product_name: offer.product_name,
      nicho: offer.nicho,
      subnicho: offer.subnicho,
      trafego: offer.trafego,
      growth_pct: pctRounded,
      ads_start: first,
      ads_end: last,
      days: MIN_DAYS,
      date_range: dateRange,
      threshold_ads: MIN_ADS,
      threshold_growth_pct: MIN_GROWTH_PCT,
    };

    const { data: inserted, error: iErr } = await supa
      .from("spy_alerts")
      .insert({
        operation_id: offer.operation_id,
        offer_id: offer.id,
        event_type: "emerging_growth",
        title,
        body,
        payload,
      })
      .select("id")
      .single();

    if (iErr) {
      console.error(`[emerging-growth] insert fail ${offer.offer_name}:`, iErr.message);
      continue;
    }

    await supa
      .from("spy_offers")
      .update({
        last_emerging_growth_alert_at: new Date().toISOString(),
        last_emerging_growth_pct: pctRounded,
      })
      .eq("id", offer.id);

    await dispatchPushcut(inserted.id);
    fired++;
    console.log(`[emerging-growth] 📈 ${offer.offer_name} +${pctRounded}% (${first}→${last})`);
  }

  console.log(`[emerging-growth] done: scanned=${candidates.length} fired=${fired}`);
  return { ok: true, scanned: candidates.length, fired };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const result = await detect();
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[emerging-growth] fatal:", e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
