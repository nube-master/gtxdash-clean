// Spy — Detecta ofertas que sumiram da Ad Library (zero ads por 2 dias seguidos)
// Critério (PO 23/05): tinha >= 100 ads em algum snapshot dos últimos 3-7 dias E
// nos 2 últimos snapshots distintos por dia BRT está com 0 ads.
// Cooldown 14d em spy_offers.last_dead_alert_at.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MIN_PRIOR_ADS = 100;
const COOLDOWN_DAYS = 14;
const BRT_OFFSET_MS = -3 * 60 * 60 * 1000;

function brtDayKey(iso: string) {
  const d = new Date(new Date(iso).getTime() + BRT_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

async function dispatchPushcut(alertId: string) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/spy-pushcut-notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
      body: JSON.stringify({ alert_id: alertId }),
    });
  } catch (e) {
    console.error("[dead-offers] pushcut dispatch failed:", (e as Error).message);
  }
}

async function detect() {
  const supa = createClient(SUPABASE_URL, SERVICE_ROLE);

  // candidatos: ofertas com active_ads_count = 0 AGORA
  const { data: offers, error: oErr } = await supa
    .from("spy_offers")
    .select("id, operation_id, offer_name, product_name, nicho, active_ads_count, last_dead_alert_at")
    .eq("active_ads_count", 0);

  if (oErr) throw oErr;
  if (!offers?.length) return { ok: true, scanned: 0, fired: 0 };

  const sinceIso = new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString();
  const ids = offers.map((o) => o.id);

  const { data: history } = await supa
    .from("spy_history")
    .select("offer_id, snapshot_at, active_ads_count")
    .in("offer_id", ids)
    .gte("snapshot_at", sinceIso)
    .order("snapshot_at", { ascending: true });

  // agrupa por offer_id → Map(dayKey → último count do dia)
  const byOffer = new Map<string, Map<string, number>>();
  for (const h of history ?? []) {
    const day = brtDayKey(h.snapshot_at);
    const inner = byOffer.get(h.offer_id) ?? new Map<string, number>();
    inner.set(day, h.active_ads_count ?? 0);
    byOffer.set(h.offer_id, inner);
  }

  const now = Date.now();
  const cooldownMs = COOLDOWN_DAYS * 24 * 3600 * 1000;
  let fired = 0;

  for (const offer of offers) {
    if (offer.last_dead_alert_at && now - new Date(offer.last_dead_alert_at).getTime() < cooldownMs) continue;
    const days = byOffer.get(offer.id);
    if (!days || days.size < 3) continue;

    const sortedDays = Array.from(days.keys()).sort();
    const last2 = sortedDays.slice(-2);
    if (last2.length < 2) continue;
    const last2Counts = last2.map((k) => days.get(k) ?? 0);
    if (last2Counts.some((v) => v !== 0)) continue; // 2 dias zerados consecutivos

    // tinha pelo menos MIN_PRIOR_ADS em algum dia anterior aos últimos 2
    const prior = sortedDays.slice(0, -2);
    const peak = Math.max(0, ...prior.map((k) => days.get(k) ?? 0));
    if (peak < MIN_PRIOR_ADS) continue;

    const title = `💀 Oferta sumiu da biblioteca: ${offer.offer_name}`;
    const body =
      `Zero ads ativos em ${last2[0]} e ${last2[1]}. ` +
      `Pico anterior: ${peak.toLocaleString("pt-BR")} ads. ` +
      `Pode ter saturado, sido pausada ou banida — vale investigar.`;

    const payload = {
      offer_id: offer.id,
      offer_name: offer.offer_name,
      product_name: offer.product_name,
      nicho: offer.nicho,
      peak_ads: peak,
      zero_days: last2,
    };

    const { data: inserted, error: iErr } = await supa
      .from("spy_alerts")
      .insert({
        operation_id: offer.operation_id,
        offer_id: offer.id,
        event_type: "dead_offer",
        title,
        body,
        payload,
      })
      .select("id")
      .single();

    if (iErr) {
      console.error(`[dead-offers] insert fail ${offer.offer_name}:`, iErr.message);
      continue;
    }
    await supa.from("spy_offers").update({ last_dead_alert_at: new Date().toISOString() }).eq("id", offer.id);
    await dispatchPushcut(inserted.id);
    fired++;
    console.log(`[dead-offers] 💀 ${offer.offer_name} (peak ${peak})`);
  }

  return { ok: true, scanned: offers.length, fired };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const result = await detect();
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[dead-offers] fatal:", e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
