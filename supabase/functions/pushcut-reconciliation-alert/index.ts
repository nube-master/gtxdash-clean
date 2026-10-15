import { mirrorToWebPush } from "../_shared/push-mirror.ts";
// =====================================================
// pushcut-reconciliation-alert
// Sprint 1 Reconciliação Financeira - D5
//
// Dispara notificação Pushcut quando há alertas críticos
// ou high de reconciliação. Pode ser chamada de duas formas:
//
// 1) Direto pelo auto-match-charges (com lista de alertas):
//    POST { alerts: [...], trigger_source: "auto-match" }
//
// 2) Standalone (varre alertas open recentes e dispara digest):
//    POST { mode: "digest", since_hours: 1 }
//
// Auth: header x-internal-trigger ou role admin
// =====================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-trigger",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PUSHCUT_URL = Deno.env.get("PUSHCUT_WEBHOOK_URL")!;
const INTERNAL_TOKEN = "auto-match-internal-7c38facb-d3-2026";

interface AlertSummary {
  alert_type: string;
  severity: string;
  ad_account_id: string | null;
  alert_date: string;
  gap_amount_brl?: number | null;
  expected_amount_brl?: number | null;
  actual_amount_brl?: number | null;
  title?: string | null;
  description?: string | null;
}

function alertAmount(a: AlertSummary): number {
  return Math.abs(
    Number(a.gap_amount_brl ?? a.expected_amount_brl ?? a.actual_amount_brl ?? 0),
  );
}

function fmtBRL(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(n);
}

function buildPushcutPayload(alerts: AlertSummary[], triggerSource: string) {
  const critical = alerts.filter((a) => a.severity === "critical");
  const high = alerts.filter((a) => a.severity === "high");

  const totalGap = alerts.reduce((s, a) => s + alertAmount(a), 0);

  // Title
  let title = "🚨 Reconciliação Financeira";
  if (critical.length > 0) {
    title = `🔴 ${critical.length} alerta${critical.length > 1 ? "s" : ""} CRÍTICO${critical.length > 1 ? "S" : ""} de reconciliação`;
  } else if (high.length > 0) {
    title = `🟠 ${high.length} alerta${high.length > 1 ? "s" : ""} ALTO de reconciliação`;
  }

  // Body
  const lines: string[] = [];
  lines.push(`Total: ${alerts.length} novo${alerts.length > 1 ? "s" : ""} alerta${alerts.length > 1 ? "s" : ""} • Gap: ${fmtBRL(totalGap)}`);
  lines.push("");

  // Top 5 alertas mais graves
  const sorted = [...alerts].sort((a, b) => {
    const sevOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    const sa = sevOrder[a.severity] ?? 4;
    const sb = sevOrder[b.severity] ?? 4;
    if (sa !== sb) return sa - sb;
    return alertAmount(b) - alertAmount(a);
  });

  const top = sorted.slice(0, 5);
  for (const a of top) {
    const emoji = a.severity === "critical" ? "🔴" : a.severity === "high" ? "🟠" : a.severity === "medium" ? "🟡" : "🟢";
    const typeLabel: Record<string, string> = {
      orphan_charge: "Cobrança órfã",
      missing_charge: "Cobrança faltante",
      gap_above_threshold: "Gap acima do limite",
      matched: "Match",
    };
    const label = typeLabel[a.alert_type] ?? a.alert_type;
    const acc = a.ad_account_id ? ` ${a.ad_account_id.slice(-4)}` : "";
    lines.push(`${emoji} ${label}${acc} ${a.alert_date} • ${fmtBRL(alertAmount(a))}`);
  }

  if (alerts.length > 5) {
    lines.push("");
    lines.push(`+${alerts.length - 5} alertas adicionais`);
  }

  lines.push("");
  lines.push(`Trigger: ${triggerSource}`);

  return {
    title,
    text: lines.join("\n"),
    isTimeSensitive: critical.length > 0,
    sound: critical.length > 0 ? "vibra-bumper" : "system",
    actions: [
      {
        name: "Abrir Reconciliação",
        url: "https://gtxmidiadash.lovable.app/financial/reconciliation",
      },
    ],
  };
}

async function sendPushcut(payload: any): Promise<{ ok: boolean; status: number; body?: string }> {
  if (!PUSHCUT_URL) {
    console.warn("[pushcut-recon] PUSHCUT_WEBHOOK_URL not configured");
    return { ok: false, status: 0, body: "no webhook url" };
  }
  try {
    const r = await fetch(PUSHCUT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await r.text().catch(() => "");
    return { ok: r.ok, status: r.status, body: body.slice(0, 200) };
  } catch (e: any) {
    return { ok: false, status: 0, body: String(e?.message ?? e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth: internal token OR admin JWT
    const internalHeader = req.headers.get("x-internal-trigger");
    const isInternal = internalHeader === INTERNAL_TOKEN;

    if (!isInternal) {
      const authHeader = req.headers.get("authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const sbAuth = createClient(SUPABASE_URL, SERVICE_KEY);
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await sbAuth.auth.getUser(token);
      if (!user) {
        return new Response(JSON.stringify({ error: "invalid token" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: roleRow } = await sbAuth
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (!roleRow) {
        return new Response(JSON.stringify({ error: "admin role required" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({}));
    const mode = body.mode ?? "alerts";
    const triggerSource = body.trigger_source ?? "manual";

    let alerts: AlertSummary[] = [];

    if (mode === "alerts" && Array.isArray(body.alerts)) {
      alerts = body.alerts as AlertSummary[];
    } else if (mode === "digest") {
      // Varre alertas críticos/high abertos das últimas N horas
      const sinceHours = Math.max(1, Math.min(24, Number(body.since_hours ?? 1)));
      const sinceISO = new Date(Date.now() - sinceHours * 3600 * 1000).toISOString();
      const { data, error } = await supabase
        .from("reconciliation_alerts")
        .select("alert_type,severity,ad_account_id,alert_date,gap_amount_brl,expected_amount_brl,actual_amount_brl,title,description")
        .in("severity", ["critical", "high"])
        .eq("status", "open")
        .gte("created_at", sinceISO)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      alerts = (data ?? []) as AlertSummary[];
    }

    // Filter to only critical/high (defensive)
    alerts = alerts.filter((a) => a.severity === "critical" || a.severity === "high");

    if (alerts.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: false, reason: "no critical/high alerts" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const payload = buildPushcutPayload(alerts, triggerSource);
    const result = await sendPushcut(payload);

    // Canal PARALELO: Web Push
    await mirrorToWebPush({
      operation_id: (alerts[0] as any)?.operation_id ?? null,
      notification_type: "reconciliation_alert",
      title: payload.title,
      body: payload.text,
      url: "/financial/reconciliation",
    });

    await supabase.from("integration_logs").insert({
      integration: "pushcut-reconciliation-alert",
      status: result.ok ? "success" : "error",
      records_processed: alerts.length,
      message: `trigger=${triggerSource} alerts=${alerts.length} pushcut_status=${result.status} ${result.ok ? "" : "body=" + result.body}`.slice(0, 500),
    });

    return new Response(
      JSON.stringify({
        success: result.ok,
        sent: result.ok,
        alerts_count: alerts.length,
        pushcut_status: result.status,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    const msg = e instanceof Error ? e.message : String(e?.message ?? e);
    console.error("[pushcut-recon] FAILED", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
