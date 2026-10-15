/**
 * Import manual de pedidos COD retroativos.
 * Ações:
 *   validate  → dry-run (valida sem gravar; limitado a 5000 linhas de preview)
 *   import    → enfileira um cod_import_jobs e retorna job_id (processamento em background)
 *   cancel    → marca o job como cancelled (worker para antes do próximo batch)
 *   undo      → rollback por batch legado (cod_manual_imports) ou por job_id
 * Segurança: exige super admin global ou admin/owner/manager da operação.
 */

import { requirePrivilegedAccess } from "../_shared/requirePrivilegedAccess.ts";
import { ImportCaches, processRow, str, type Row, type RowOutcome } from "../_shared/cod-import-row.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VALIDATE_LIMIT = 5000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function kickWorker(jobId: string) {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return fetch(`${url}/functions/v1/cod-import-worker`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ job_id: jobId }),
  }).catch((e) => console.error("kick_worker_failed", e?.message));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let payload: {
    action?: string;
    operation_id?: string;
    filename?: string;
    retroactive?: boolean;
    rows?: Row[];
    batch_id?: string;
    job_id?: string;
  };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const action = payload.action ?? "validate";
  const guard = await requirePrivilegedAccess(req, payload.operation_id ?? null);
  if (!guard.ok) return guard.response;
  const { supabase, userId } = guard;

  // ── CANCEL ──────────────────────────────────────────────────────────
  if (action === "cancel") {
    if (!payload.job_id) return json({ error: "missing_job_id" }, 400);
    const { error } = await supabase
      .from("cod_import_jobs")
      .update({ status: "cancelled", finished_at: new Date().toISOString() })
      .eq("id", payload.job_id)
      .in("status", ["pending", "running"]);
    if (error) return json({ error: "cancel_failed", detail: error.message }, 400);
    return json({ success: true });
  }

  // ── RESUME (retoma jobs travados) ───────────────────────────────────
  if (action === "resume") {
    if (!payload.job_id) return json({ error: "missing_job_id" }, 400);
    await kickWorker(payload.job_id);
    return json({ success: true, resumed: payload.job_id });
  }

  // ── UNDO ────────────────────────────────────────────────────────────
  if (action === "undo") {
    if (payload.job_id) {
      const { data: job } = await supabase
        .from("cod_import_jobs")
        .select("id, status")
        .eq("id", payload.job_id)
        .maybeSingle();
      if (!job) return json({ error: "job_not_found" }, 404);
      const { count, error } = await supabase
        .from("cod_orders")
        .delete({ count: "exact" })
        .eq("import_job_id", payload.job_id);
      if (error) return json({ error: "undo_failed", detail: error.message }, 400);
      await supabase
        .from("cod_import_jobs")
        .update({ status: "cancelled", error_message: "desfeito pelo usuário", finished_at: new Date().toISOString() })
        .eq("id", payload.job_id);
      return json({ success: true, deleted: count ?? 0 });
    }

    const batchId = payload.batch_id;
    if (!batchId) return json({ error: "missing_batch_id" }, 400);

    const { data: batch } = await supabase
      .from("cod_manual_imports")
      .select("id, undone_at")
      .eq("id", batchId)
      .maybeSingle();
    if (!batch) return json({ error: "batch_not_found" }, 404);
    if (batch.undone_at) return json({ error: "batch_already_undone" }, 400);

    const { count, error } = await supabase
      .from("cod_orders")
      .delete({ count: "exact" })
      .eq("import_batch_id", batchId);
    if (error) return json({ error: "undo_failed", detail: error.message }, 400);

    await supabase
      .from("cod_manual_imports")
      .update({ undone_at: new Date().toISOString(), status: "undone" })
      .eq("id", batchId);

    return json({ success: true, deleted: count ?? 0 });
  }

  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  if (rows.length === 0) return json({ error: "no_rows" }, 400);
  const retroactive = payload.retroactive !== false;

  // ── IMPORT: apenas enfileira (nunca processa síncrono) ──────────────
  if (action === "import") {
    const { data: job, error } = await supabase
      .from("cod_import_jobs")
      .insert({
        operation_id: payload.operation_id ?? null,
        filename: payload.filename ?? "import.csv",
        total_rows: rows.length,
        is_retroactive: retroactive,
        rows_payload: rows,
        user_id: userId,
        status: "pending",
      })
      .select("id")
      .maybeSingle();

    if (error || !job) return json({ error: "job_create_failed", detail: error?.message }, 400);

    await kickWorker(job.id);
    return json({ success: true, job_id: job.id, total_rows: rows.length, status: "pending" });
  }

  // ── VALIDATE (dry-run) ──────────────────────────────────────────────
  const sample = rows.slice(0, VALIDATE_LIMIT);
  const ids = sample.map((r) => str(r.order_id)).filter(Boolean) as string[];
  const existing = new Set<string>();
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await supabase
      .from("cod_orders")
      .select("external_order_id")
      .in("external_order_id", ids.slice(i, i + 500));
    (data ?? []).forEach((d: any) => existing.add(d.external_order_id));
  }

  const caches = new ImportCaches();
  const seenInFile = new Set<string>();
  const results: RowOutcome[] = [];

  for (let i = 0; i < sample.length; i++) {
    const outcome = await processRow(supabase, sample[i], i + 2, {
      retroactive,
      existing,
      seenInFile,
      caches,
    });
    if (outcome.insert) seenInFile.add(outcome.external_order_id!);
    results.push({ ...outcome, insert: undefined, push: undefined });
  }

  const summary = {
    total: rows.length,
    validated: sample.length,
    ok: results.filter((r) => r.result === "ok").length,
    orphan: results.filter((r) => r.result === "orphan").length,
    skipped: results.filter((r) => r.result === "skip").length,
    errors: results.filter((r) => r.result === "error").length,
  };

  return json({ success: true, dry_run: true, summary, results: results.filter((r) => r.result !== "ok") });
});
