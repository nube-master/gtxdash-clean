/**
 * Worker assíncrono de import COD.
 * Processa cod_import_jobs em batches de 500 linhas, com auto-encadeamento,
 * retomada de jobs travados (>5min sem heartbeat) e log de erros por linha.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { mirrorSaleToWebPush } from "../_shared/push-mirror.ts";
import { ImportCaches, processRow, str, type Row, type RowOutcome } from "../_shared/cod-import-row.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BATCH_SIZE = 500;
const MAX_RUNTIME_MS = 45_000;
const STALE_MS = 5 * 60 * 1000;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function chainSelf(jobId: string) {
  // fire-and-forget: próximo hop do mesmo job
  fetch(`${SUPABASE_URL}/functions/v1/cod-import-worker`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify({ job_id: jobId }),
  }).catch((e) => console.error("chain_failed", e?.message));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  let payload: { job_id?: string } = {};
  try {
    payload = await req.json();
  } catch { /* sem body: modo varredura */ }

  // ── seleciona o job ────────────────────────────────────────────────
  let jobId = payload.job_id ?? null;
  if (!jobId) {
    const staleBefore = new Date(Date.now() - STALE_MS).toISOString();
    const { data } = await supabase
      .from("cod_import_jobs")
      .select("id, status, heartbeat_at")
      .in("status", ["pending", "running"])
      .or(`heartbeat_at.is.null,heartbeat_at.lt.${staleBefore}`)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    jobId = data?.id ?? null;
    if (!jobId) return json({ success: true, idle: true });
  }

  const { data: job, error: jobErr } = await supabase
    .from("cod_import_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (jobErr || !job) return json({ error: "job_not_found" }, 404);
  if (["completed", "failed", "cancelled"].includes(job.status)) {
    return json({ success: true, status: job.status });
  }

  const rows: Row[] = Array.isArray(job.rows_payload) ? job.rows_payload : [];
  const retroactive = job.is_retroactive !== false;
  const caches = new ImportCaches();
  const seenInFile = new Set<string>();

  await supabase
    .from("cod_import_jobs")
    .update({
      status: "running",
      started_at: job.started_at ?? new Date().toISOString(),
      heartbeat_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  let batchIndex: number = job.last_batch_index ?? 0;
  let processed: number = job.processed_rows ?? 0;
  let success: number = job.success_count ?? 0;
  let errors: number = job.error_count ?? 0;
  let skipped: number = job.skipped_count ?? 0;

  const startedAt = Date.now();

  try {
    while (batchIndex * BATCH_SIZE < rows.length) {
      // cancelamento cooperativo
      const { data: fresh } = await supabase
        .from("cod_import_jobs")
        .select("status")
        .eq("id", jobId)
        .maybeSingle();
      if (fresh?.status === "cancelled") {
        return json({ success: true, status: "cancelled", processed });
      }

      const slice = rows.slice(batchIndex * BATCH_SIZE, (batchIndex + 1) * BATCH_SIZE);
      const baseLine = batchIndex * BATCH_SIZE + 2; // +2 = header do CSV

      // duplicados já existentes no banco (uma query por batch)
      const ids = slice.map((r) => str(r.order_id)).filter(Boolean) as string[];
      const existing = new Set<string>();
      for (let i = 0; i < ids.length; i += 500) {
        const { data } = await supabase
          .from("cod_orders")
          .select("external_order_id")
          .in("external_order_id", ids.slice(i, i + 500));
        (data ?? []).forEach((d: any) => existing.add(d.external_order_id));
      }

      const outcomes: RowOutcome[] = [];
      const toInsert: Record<string, unknown>[] = [];
      const pushQueue: Record<string, unknown>[] = [];

      for (let i = 0; i < slice.length; i++) {
        const outcome = await processRow(supabase, slice[i], baseLine + i, {
          retroactive,
          existing,
          seenInFile,
          caches,
        });
        outcomes.push(outcome);
        if (outcome.insert) {
          seenInFile.add(outcome.external_order_id!);
          toInsert.push({ ...outcome.insert, import_job_id: jobId });
          if (outcome.push) pushQueue.push(outcome.push);
        }
      }

      const jobErrors: Record<string, unknown>[] = outcomes
        .filter((o) => o.result === "error")
        .map((o) => ({
          job_id: jobId,
          row_number: o.row_number,
          order_id: o.external_order_id,
          field: o.field ?? null,
          message: o.message ?? null,
          raw_row: slice[o.row_number - baseLine] ?? null,
        }));

      // ── bulk insert (chunks de 200) com fallback linha-a-linha ─────
      let inserted = 0;
      for (let i = 0; i < toInsert.length; i += 200) {
        const chunk = toInsert.slice(i, i + 200);
        const { error } = await supabase.from("cod_orders").insert(chunk);
        if (!error) {
          inserted += chunk.length;
          continue;
        }
        // o chunk falhou (trigger antileak, constraint...): isola a linha ruim
        for (const row of chunk) {
          const { error: rowErr } = await supabase.from("cod_orders").insert(row);
          if (rowErr) {
            const oid = row.external_order_id as string;
            const o = outcomes.find((x) => x.external_order_id === oid);
            jobErrors.push({
              job_id: jobId,
              row_number: o?.row_number ?? null,
              order_id: oid,
              field: "insert",
              message: rowErr.message,
              raw_row: (row.raw_payload as any)?.original ?? null,
            });
          } else {
            inserted++;
          }
        }
      }

      if (jobErrors.length > 0) {
        for (let i = 0; i < jobErrors.length; i += 500) {
          await supabase.from("cod_import_job_errors").insert(jobErrors.slice(i, i + 500));
        }
      }

      if (!retroactive) {
        for (const p of pushQueue) {
          await mirrorSaleToWebPush({
            operation_id: p.operation_id as string,
            order_id: p.order_id as string,
            valor: (p.valor as number) ?? null,
            currency: "BRL",
            produto: (p.produto as string) ?? null,
            afiliado: (p.afiliado as string) ?? null,
            canal: "cod",
            url: "/dashboard/cod",
            utm_campaign: null,
            sale_created_at: new Date().toISOString(),
          });
        }
      }

      batchIndex += 1;
      processed += slice.length;
      success += inserted;
      errors += jobErrors.length;
      skipped += outcomes.filter((o) => o.result === "skip").length;

      await supabase
        .from("cod_import_jobs")
        .update({
          last_batch_index: batchIndex,
          processed_rows: processed,
          success_count: success,
          error_count: errors,
          skipped_count: skipped,
          heartbeat_at: new Date().toISOString(),
        })
        .eq("id", jobId);

      // budget de tempo: encadeia o próximo hop
      if (Date.now() - startedAt > MAX_RUNTIME_MS && batchIndex * BATCH_SIZE < rows.length) {
        chainSelf(jobId);
        return json({ success: true, status: "running", processed, total: rows.length });
      }
    }

    await supabase
      .from("cod_import_jobs")
      .update({ status: "completed", finished_at: new Date().toISOString(), heartbeat_at: new Date().toISOString() })
      .eq("id", jobId);

    return json({ success: true, status: "completed", processed, success_count: success, error_count: errors });
  } catch (e: any) {
    console.error("worker_failed", e?.message);
    await supabase
      .from("cod_import_jobs")
      .update({
        status: "failed",
        error_message: String(e?.message ?? e).slice(0, 500),
        finished_at: new Date().toISOString(),
      })
      .eq("id", jobId);
    return json({ error: "worker_failed", detail: String(e?.message ?? e) }, 500);
  }
});
