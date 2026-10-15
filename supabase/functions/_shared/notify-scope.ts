import { mirrorToWebPush } from "./push-mirror.ts";
// Shared helpers for notify-* functions to enforce per-operation scoping.
// Every notify-* must loop over operations and use these helpers so that
// templates, recipients, logs and outbound messages never mix data across ops.

export interface OperationRow {
  id: string;
  name: string;
  slug?: string | null;
}

export interface Recipient {
  id: string;
  name: string;
  webhook_url: string | null;
  operation_id: string | null;
}

export interface Template {
  id: string;
  operation_id: string | null;
  type: string;
  title_template: string;
  body_template: string;
  is_active: boolean;
}

export function brDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

export function brHour(): number {
  return Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false,
  }).format(new Date()));
}

export function fmtBRL(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function replaceVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

/** SP day (UTC-3) → UTC bounds. */
export function spDayBounds(spDate: string): { startUtc: string; endUtc: string } {
  const startUtc = `${spDate}T03:00:00Z`;
  const nextDay = new Date(`${spDate}T12:00:00Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const endUtc = `${nextDay.toISOString().slice(0, 10)}T03:00:00Z`;
  return { startUtc, endUtc };
}

/** All active operations. If body.operation_id is set, only that one. */
export async function listActiveOperations(sb: any, onlyOp?: string | null): Promise<OperationRow[]> {
  let q = sb.from("operations").select("id, name, slug").eq("status", "active");
  if (onlyOp) q = q.eq("id", onlyOp);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as OperationRow[];
}

/** Fetch template scoped to a single operation. Returns null when nothing active. */
export async function fetchOpTemplate(
  sb: any,
  opId: string,
  type: string,
): Promise<Template | null> {
  const { data } = await sb.from("notification_templates")
    .select("id, operation_id, type, title_template, body_template, is_active")
    .eq("type", type)
    .eq("is_active", true)
    .eq("operation_id", opId)
    .limit(1)
    .maybeSingle();
  return (data as Template) || null;
}

/** Recipients for a template — prefs first, fallback to all active recipients of the op. */
export async function fetchOpRecipients(
  sb: any,
  opId: string,
  templateId: string,
): Promise<Recipient[]> {
  const { data: prefs } = await sb.from("recipient_notification_prefs")
    .select("recipient_id")
    .eq("template_id", templateId)
    .eq("enabled", true);
  const ids = (prefs || []).map((p: any) => p.recipient_id);

  if (ids.length > 0) {
    const { data } = await sb.from("notification_recipients")
      .select("id, name, webhook_url, operation_id")
      .in("id", ids)
      .eq("is_active", true)
      .eq("operation_id", opId);
    return (data || []) as Recipient[];
  }
  const { data } = await sb.from("notification_recipients")
    .select("id, name, webhook_url, operation_id")
    .eq("is_active", true)
    .eq("operation_id", opId);
  return (data || []) as Recipient[];
}

/** Post to Pushcut recipients and return per-recipient status. */
export async function sendToRecipients(
  recipients: Recipient[],
  title: string,
  body: string,
  mirror?: { operation_id?: string | null; notification_type: string; url?: string; payload?: Record<string, unknown> },
): Promise<Array<{ recipient: string; status: "sent" | "error"; error?: string }>> {
  const out: Array<{ recipient: string; status: "sent" | "error"; error?: string }> = [];
  for (const r of recipients) {
    if (!r.webhook_url) continue;
    try {
      const res = await fetch(r.webhook_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, text: body }),
      });
      out.push({ recipient: r.name, status: res.ok ? "sent" : "error" });
    } catch (e: any) {
      out.push({ recipient: r.name, status: "error", error: e?.message ?? String(e) });
    }
  }
  // Canal PARALELO: Web Push (não bloqueia nem altera o Pushcut acima)
  if (mirror) {
    await mirrorToWebPush({
      operation_id: mirror.operation_id ?? null,
      notification_type: mirror.notification_type,
      title,
      body,
      url: mirror.url,
      payload: mirror.payload,
    });
  }
  return out;
}


/** Convenience: log automated report scoped to op. */
export async function logAutomatedReport(
  sb: any,
  opId: string,
  reportType: string,
  reportText: string,
  metrics: Record<string, unknown>,
  results: Array<{ status: string }>,
) {
  await sb.from("automated_reports_log").insert({
    operation_id: opId,
    report_type: reportType,
    period_hours: 24,
    report_text: reportText,
    metrics,
    pushcut_status: results.some((r) => r.status === "sent") ? "sent" : "skipped",
  });
}

/** Read body.operation_id if present, without failing on non-JSON bodies. */
export async function readOnlyOp(req: Request): Promise<string | null> {
  try {
    const body = await req.clone().json().catch(() => null);
    return (body?.operation_id as string) || null;
  } catch {
    return null;
  }
}
