// spy-health-check — Watchdog: alerta se spy_history ficar >= 2 dias sem snapshot por operação
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STALE_HOURS = 36; // mais de 1.5 dia sem snapshot = problema

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supa = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Para cada operação com ofertas spy ativas, pega último snapshot
  const { data: offers } = await supa
    .from("spy_offers")
    .select("operation_id")
    .not("ad_library_url", "is", null);

  const ops = Array.from(new Set((offers ?? []).map((o: any) => o.operation_id).filter(Boolean)));
  const created: any[] = [];

  for (const operation_id of ops) {
    const { data: last } = await supa
      .from("spy_history")
      .select("snapshot_at")
      .eq("operation_id", operation_id)
      .order("snapshot_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastMs = last?.snapshot_at ? new Date(last.snapshot_at).getTime() : 0;
    const hoursSince = lastMs ? (Date.now() - lastMs) / 3600000 : 9999;

    if (hoursSince < STALE_HOURS) continue;

    // Cooldown 24h — não spammar
    const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count } = await supa
      .from("spy_alerts")
      .select("id", { count: "exact", head: true })
      .eq("operation_id", operation_id)
      .eq("event_type", "sync_stalled")
      .gte("created_at", cutoff);
    if ((count ?? 0) > 0) continue;

    const hoursTxt = hoursSince > 9000 ? "nunca" : `${Math.floor(hoursSince)}h`;
    const { data: alert, error } = await supa
      .from("spy_alerts")
      .insert({
        operation_id,
        event_type: "sync_stalled",
        title: "⚠️ Spy travou — sem novos snapshots",
        body: `Última atualização da biblioteca: ${hoursTxt} atrás. Provável falha no Apify ou no cron. Verifique APIFY_API_TOKEN e logs de spy-sync-offer.`,
        payload: { hours_since: Math.floor(hoursSince), last_snapshot: last?.snapshot_at ?? null },
      })
      .select("id")
      .single();
    if (error) {
      console.error("[spy-health-check] insert alert failed", error.message);
      continue;
    }
    created.push({ operation_id, hours_since: hoursSince, alert_id: alert.id });

    // Dispara Pushcut
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/spy-pushcut-notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
        body: JSON.stringify({ alert_id: alert.id }),
      });
    } catch (e: any) {
      console.error("[spy-health-check] pushcut dispatch failed", e?.message);
    }
  }

  return new Response(JSON.stringify({ ok: true, ops_checked: ops.length, alerts_created: created.length, created }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
