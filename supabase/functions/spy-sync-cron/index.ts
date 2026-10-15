// Spy v2 — Daily cron: iterate ALL offers w/ ad_library_url and trigger spy-sync-offer.
// Roda em background (EdgeRuntime.waitUntil) com concorrência limitada pra não estourar Apify.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CONCURRENCY = 3;

// @ts-ignore Deno Deploy runtime
const EdgeRuntime = (globalThis as any).EdgeRuntime;

async function runSync() {
  const supa = createClient(SUPABASE_URL, SERVICE_ROLE);
  // 20h cutoff: pega qualquer oferta com ad_library_url que ainda não sincronizou hoje
  const cutoff = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();

  const { data: offers, error } = await supa
    .from("spy_offers")
    .select("id, offer_name, last_synced_at")
    .not("ad_library_url", "is", null)
    .or(`last_synced_at.is.null,last_synced_at.lt.${cutoff}`)
    .order("last_synced_at", { ascending: true, nullsFirst: true })
    .limit(200);

  if (error) {
    console.error("[spy-sync-cron] fetch offers error:", error.message);
    return;
  }

  const queue = offers ?? [];
  console.log(`[spy-sync-cron] dispatching ${queue.length} offers (concurrency=${CONCURRENCY})`);

  let idx = 0;
  async function worker(workerId: number) {
    while (idx < queue.length) {
      const my = idx++;
      const o = queue[my];
      const t0 = Date.now();
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/spy-sync-offer`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_ROLE}`,
          },
          body: JSON.stringify({ offer_id: o.id }),
        });
        console.log(`[spy-sync-cron] w${workerId} ${my + 1}/${queue.length} ${o.offer_name} → ${r.status} (${Date.now() - t0}ms)`);
      } catch (e: any) {
        console.error(`[spy-sync-cron] w${workerId} ${o.offer_name} FAIL:`, e?.message);
      }
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, (_, i) => worker(i + 1));
  await Promise.all(workers);
  console.log(`[spy-sync-cron] done: processed ${queue.length} offers`);

  // Após sync completo: detecção de Constant Growth + Dead Offers (1x ao final, cooldowns próprios)
  for (const fn of ["spy-detect-constant-growth", "spy-detect-emerging-growth", "spy-detect-dead-offers"]) {
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
      });
      const txt = await r.text();
      console.log(`[spy-sync-cron] ${fn} → ${r.status} ${txt}`);
    } catch (e: any) {
      console.error(`[spy-sync-cron] ${fn} FAIL:`, e?.message);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const work = runSync();
  if (EdgeRuntime?.waitUntil) {
    EdgeRuntime.waitUntil(work);
  } else {
    // fallback dev local
    work.catch((e) => console.error("[spy-sync-cron] bg error:", e));
  }

  return new Response(JSON.stringify({ ok: true, dispatched: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
