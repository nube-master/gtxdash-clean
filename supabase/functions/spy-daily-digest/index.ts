// Spy Daily Digest — Resumo 22h BRT do dia (novas/mortas/escala/top crescimento)
// Cria 1 alerta event_type=daily_digest por operação que tem spy_offers e dispara Pushcut
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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
    console.error("[daily-digest] pushcut dispatch failed:", (e as Error).message);
  }
}

async function buildDigest() {
  const supa = createClient(SUPABASE_URL, SERVICE_ROLE);
  const now = new Date();
  const since24h = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
  const since48h = new Date(now.getTime() - 48 * 3600 * 1000).toISOString();
  const since8d = new Date(now.getTime() - 8 * 24 * 3600 * 1000).toISOString();

  // pega ofertas com snapshots recentes
  const { data: offers, error: oErr } = await supa
    .from("spy_offers")
    .select("id, operation_id, offer_name, nicho, active_ads_count, created_at, last_constant_growth_alert_at, last_constant_growth_pct, last_dead_alert_at");
  if (oErr) throw oErr;

  if (!offers?.length) return { ok: true, dispatched: 0, reason: "no offers" };

  const ids = offers.map((o) => o.id);

  // histórico últimos 8 dias pra calcular % delta de 24h
  const { data: history } = await supa
    .from("spy_history")
    .select("offer_id, snapshot_at, active_ads_count")
    .in("offer_id", ids)
    .gte("snapshot_at", since8d)
    .order("snapshot_at", { ascending: true });

  const histByOffer = new Map<string, Array<{ at: string; count: number }>>();
  for (const h of history ?? []) {
    const arr = histByOffer.get(h.offer_id) ?? [];
    arr.push({ at: h.snapshot_at, count: h.active_ads_count ?? 0 });
    histByOffer.set(h.offer_id, arr);
  }

  // agrupa por operação
  const byOp = new Map<string, typeof offers>();
  for (const o of offers) {
    const arr = byOp.get(o.operation_id) ?? [];
    arr.push(o);
    byOp.set(o.operation_id, arr);
  }

  let dispatched = 0;
  for (const [operation_id, opOffers] of byOp.entries()) {
    // novas (created_at < 24h)
    const novas = opOffers.filter((o) => new Date(o.created_at).getTime() > now.getTime() - 24 * 3600 * 1000);

    // mortas (alerta dead nas últimas 24h) OR active=0 agora mas >0 ontem
    const mortas: Array<{ name: string; was: number }> = [];
    // em escala (alerta constant_growth nas últimas 24h)
    const emEscala: Array<{ name: string; pct: number | null; ads: number }> = [];
    // top crescimento 24h por delta absoluto
    type Growth = { name: string; from: number; to: number; pct: number; delta: number };
    const growths: Growth[] = [];

    for (const o of opOffers) {
      const hist = histByOffer.get(o.id) ?? [];
      if (hist.length >= 2) {
        const last = hist[hist.length - 1];
        // ponto ~24h atrás (mais próximo)
        const target = now.getTime() - 24 * 3600 * 1000;
        let prev = hist[0];
        for (const h of hist) {
          if (Math.abs(new Date(h.at).getTime() - target) < Math.abs(new Date(prev.at).getTime() - target)) prev = h;
        }
        const from = prev.count;
        const to = last.count;
        if (from > 0 && to >= 0) {
          const delta = to - from;
          const pct = (delta / Math.max(from, 1)) * 100;
          if (delta !== 0) growths.push({ name: o.offer_name, from, to, pct, delta });
          // morta: era >= 100 ontem, agora 0
          if (from >= 100 && to === 0) mortas.push({ name: o.offer_name, was: from });
        }
      }

      if (o.last_constant_growth_alert_at && new Date(o.last_constant_growth_alert_at).getTime() > now.getTime() - 24 * 3600 * 1000) {
        emEscala.push({ name: o.offer_name, pct: o.last_constant_growth_pct, ads: o.active_ads_count });
      }
    }

    growths.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    const topGrowth = growths.filter((g) => g.delta > 0).slice(0, 3);
    const topDrops = growths.filter((g) => g.delta < 0).slice(0, 2);

    // se não tem NADA, pula a operação
    if (!novas.length && !mortas.length && !emEscala.length && !topGrowth.length && !topDrops.length) {
      console.log(`[daily-digest] op ${operation_id} sem novidades — skip`);
      continue;
    }

    const dateLabel = brtDayKey(now.toISOString());
    const title = `📊 Spy Daily Digest · ${dateLabel}`;

    const lines: string[] = [];
    if (emEscala.length) {
      lines.push(`🚀 Em escala (${emEscala.length}):`);
      for (const e of emEscala.slice(0, 3)) {
        const pctStr = e.pct != null ? ` +${Math.round(e.pct)}%` : "";
        lines.push(`  • ${e.name} — ${e.ads.toLocaleString("pt-BR")} ads${pctStr}`);
      }
    }
    if (novas.length) {
      lines.push(`🆕 Novas no Spy (${novas.length}):`);
      for (const n of novas.slice(0, 5)) lines.push(`  • ${n.offer_name}`);
    }
    if (topGrowth.length) {
      lines.push(`📈 Maior crescimento 24h:`);
      for (const g of topGrowth) {
        lines.push(`  • ${g.name} — ${g.from.toLocaleString("pt-BR")} → ${g.to.toLocaleString("pt-BR")} (+${Math.round(g.pct)}%)`);
      }
    }
    if (topDrops.length) {
      lines.push(`📉 Queda 24h:`);
      for (const d of topDrops) {
        lines.push(`  • ${d.name} — ${d.from.toLocaleString("pt-BR")} → ${d.to.toLocaleString("pt-BR")} (${Math.round(d.pct)}%)`);
      }
    }
    if (mortas.length) {
      lines.push(`💀 Sumiram da Library (${mortas.length}):`);
      for (const m of mortas.slice(0, 3)) lines.push(`  • ${m.name} (era ${m.was.toLocaleString("pt-BR")})`);
    }

    const body = lines.join("\n");

    const { data: inserted, error: iErr } = await supa
      .from("spy_alerts")
      .insert({
        operation_id,
        offer_id: null,
        event_type: "daily_digest",
        title,
        body,
        payload: {
          date: dateLabel,
          counts: {
            novas: novas.length,
            mortas: mortas.length,
            em_escala: emEscala.length,
            crescendo: topGrowth.length,
            caindo: topDrops.length,
          },
        },
      })
      .select("id")
      .single();

    if (iErr) {
      console.error(`[daily-digest] insert fail op=${operation_id}:`, iErr.message);
      continue;
    }
    await dispatchPushcut(inserted.id);
    dispatched++;
    console.log(`[daily-digest] op=${operation_id} dispatched`);
  }

  return { ok: true, dispatched, ops_scanned: byOp.size };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const result = await buildDigest();
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[daily-digest] fatal:", e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
