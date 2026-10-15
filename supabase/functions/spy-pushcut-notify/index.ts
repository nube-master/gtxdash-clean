import { mirrorToWebPush } from "../_shared/push-mirror.ts";
// spy-pushcut-notify — Dispara webhooks Pushcut quando um alerta Spy é criado
// Chamado pelo trigger trg_spy_offers_alert via pg_net
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { alert_id } = await req.json();
    if (!alert_id) {
      return new Response(JSON.stringify({ error: "alert_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. busca alerta
    const { data: alert, error: aErr } = await supabase
      .from("spy_alerts")
      .select("id, operation_id, offer_id, event_type, title, body, payload, pushcut_sent")
      .eq("id", alert_id)
      .maybeSingle();

    if (aErr || !alert) throw new Error(`alert not found: ${aErr?.message ?? "null"}`);
    if (alert.pushcut_sent) {
      return new Response(JSON.stringify({ skipped: "already_sent" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. busca recipients Pushcut ativos da operação (isolamento estrito)
    const { data: recipients, error: rErr } = await supabase
      .from("notification_recipients")
      .select("id, name, webhook_url, operation_id, project_filter")
      .eq("is_active", true)
      .eq("operation_id", alert.operation_id);

    if (rErr) throw new Error(`recipients query failed: ${rErr.message}`);

    const targets = (recipients ?? []).filter((r) => {
      if (!r.webhook_url) return false;
      // se project_filter tem TODOS ou está vazio, aceita
      const pf = (r.project_filter as string[] | null) ?? ["TODOS"];
      return pf.includes("TODOS") || pf.includes("SPY");
    });

    // 3. dispara cada webhook (Pushcut API espera JSON com title/text)
    const results: Array<{ id: string; ok: boolean; status?: number; error?: string }> = [];
    for (const t of targets) {
      try {
        const resp = await fetch(t.webhook_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: alert.title,
            text: alert.body,
            input: JSON.stringify(alert.payload),
            // Pushcut Notification action shortcut
          }),
        });
        results.push({ id: t.id, ok: resp.ok, status: resp.status });
      } catch (e) {
        results.push({ id: t.id, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }

    const anyOk = results.some((r) => r.ok);

    // Canal PARALELO: Web Push
    await mirrorToWebPush({
      operation_id: alert.operation_id,
      notification_type: `spy_${alert.event_type ?? "alert"}`,
      title: alert.title,
      body: alert.body,
      url: "/spy",
    });
    const firstErr = results.find((r) => !r.ok)?.error;

    await supabase
      .from("spy_alerts")
      .update({
        pushcut_sent: anyOk,
        pushcut_sent_at: anyOk ? new Date().toISOString() : null,
        pushcut_error: anyOk ? null : (firstErr ?? `no recipients (found ${targets.length})`),
      })
      .eq("id", alert_id);

    return new Response(
      JSON.stringify({ ok: true, dispatched: targets.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("spy-pushcut-notify error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
