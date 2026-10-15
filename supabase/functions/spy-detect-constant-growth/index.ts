// Spy — Detecta ofertas em "Constant Growth"
// Critério (confirmado pelo PO):
//  - active_ads_count >= 20.000 em 7 dias BRT consecutivos distintos
//  - crescimento dia7 / dia1 >= +30%
//  - cooldown de 7d em spy_offers.last_constant_growth_alert_at
// Inserção em spy_alerts + disparo direto do spy-pushcut-notify (não passa pelo trigger de spy_offers).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MIN_ADS = 20_000;
const MIN_DAYS = 7;
// Crescimento NÃO é obrigatório (PO 23/05): basta ficar 7d consecutivos >= MIN_ADS.
// Se houver crescimento >= GROWTH_HIGHLIGHT_PCT, destacamos na mensagem.
const GROWTH_HIGHLIGHT_PCT = 30;
const COOLDOWN_DAYS = 7;
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
  last_constant_growth_alert_at: string | null;
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
    console.error(`[constant-growth] pushcut dispatch failed for ${alertId}:`, (e as Error).message);
  }
}

async function detect() {
  const supa = createClient(SUPABASE_URL, SERVICE_ROLE);

  // 1. candidatos: ofertas hoje com ads >= MIN_ADS
  const { data: offers, error: oErr } = await supa
    .from("spy_offers")
    .select("id, operation_id, offer_name, product_name, nicho, subnicho, trafego, active_ads_count, last_constant_growth_alert_at")
    .gte("active_ads_count", MIN_ADS);

  if (oErr) {
    console.error("[constant-growth] offers fetch error:", oErr.message);
    return { ok: false, error: oErr.message };
  }

  const candidates = (offers ?? []) as OfferRow[];
  console.log(`[constant-growth] ${candidates.length} ofertas candidatas (>=${MIN_ADS} ads)`);

  if (!candidates.length) return { ok: true, scanned: 0, fired: 0 };

  // 2. busca histórico dos últimos 8 dias pra todas de uma vez
  const sinceIso = new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString();
  const ids = candidates.map((c) => c.id);
  const { data: history, error: hErr } = await supa
    .from("spy_history")
    .select("offer_id, snapshot_at, active_ads_count")
    .in("offer_id", ids)
    .gte("snapshot_at", sinceIso)
    .order("snapshot_at", { ascending: true });

  if (hErr) {
    console.error("[constant-growth] history fetch error:", hErr.message);
    return { ok: false, error: hErr.message };
  }

  // agrupa: offer_id → Map(dayKey → último active count do dia)
  const byOffer = new Map<string, Map<string, number>>();
  for (const h of (history ?? []) as HistoryRow[]) {
    const dayKey = brtDayKey(h.snapshot_at);
    const inner = byOffer.get(h.offer_id) ?? new Map<string, number>();
    inner.set(dayKey, h.active_ads_count ?? 0); // último do dia (history vem ASC)
    byOffer.set(h.offer_id, inner);
  }

  const now = Date.now();
  const cooldownMs = COOLDOWN_DAYS * 24 * 3600 * 1000;
  let fired = 0;

  for (const offer of candidates) {
    // cooldown
    if (offer.last_constant_growth_alert_at) {
      const last = new Date(offer.last_constant_growth_alert_at).getTime();
      if (now - last < cooldownMs) continue;
    }

    const days = byOffer.get(offer.id);
    if (!days || days.size < MIN_DAYS) continue;

    // pega os MIN_DAYS dias mais recentes (ordenados ASC)
    const sortedDays = Array.from(days.keys()).sort();
    const lastN = sortedDays.slice(-MIN_DAYS);
    if (lastN.length < MIN_DAYS) continue;

    // todos com active >= MIN_ADS
    const values = lastN.map((k) => days.get(k) ?? 0);
    if (values.some((v) => v < MIN_ADS)) continue;

    // crescimento dia7 vs dia1 (informativo, não bloqueia)
    const first = values[0];
    const last = values[values.length - 1];
    const pct = first > 0 ? ((last - first) / first) * 100 : 0;
    const pctRounded = Math.round(pct * 10) / 10;
    const dateRange = `${lastN[0]} → ${lastN[lastN.length - 1]}`;

    const growthTag =
      pctRounded >= GROWTH_HIGHLIGHT_PCT
        ? ` e crescendo +${pctRounded}%`
        : pctRounded > 0
          ? ` (+${pctRounded}%)`
          : pctRounded < 0
            ? ` (${pctRounded}%)`
            : " (estável)";

    const title = `🚀 Oferta pronta pra replicar: ${offer.offer_name}`;
    const body =
      `${MIN_DAYS}d constante acima de ${MIN_ADS.toLocaleString("pt-BR")} ads ` +
      `(${first.toLocaleString("pt-BR")} → ${last.toLocaleString("pt-BR")}${growthTag}). ` +
      `Concorrente escalando forte — bora testar.`;

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
    };

    const { data: inserted, error: iErr } = await supa
      .from("spy_alerts")
      .insert({
        operation_id: offer.operation_id,
        offer_id: offer.id,
        event_type: "constant_growth",
        title,
        body,
        payload,
      })
      .select("id")
      .single();

    if (iErr) {
      console.error(`[constant-growth] insert alert fail ${offer.offer_name}:`, iErr.message);
      continue;
    }

    await supa
      .from("spy_offers")
      .update({
        last_constant_growth_alert_at: new Date().toISOString(),
        last_constant_growth_pct: pctRounded,
      })
      .eq("id", offer.id);

    await dispatchPushcut(inserted.id);
    fired++;
    console.log(`[constant-growth] 🚀 ${offer.offer_name} +${pctRounded}% (${first}→${last})`);
  }

  console.log(`[constant-growth] done: scanned=${candidates.length} fired=${fired}`);
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
    console.error("[constant-growth] fatal:", e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
