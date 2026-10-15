import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Download,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Undo2,
  Loader2,
  Ban,
  RefreshCw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOperation } from "@/contexts/OperationContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const TEMPLATE_COLUMNS = [
  "order_id",
  "platform",
  "project_slug",
  "operation_id",
  "product_name",
  "product_slug",
  "country_code",
  "customer_state",
  "quantity",
  "order_total_brl",
  "commission_value_brl",
  "affiliate_username",
  "status",
  "created_at",
  "paid_at",
  "delivered_at",
  "refused_at",
  "currency",
  "order_total",
  "commission_value",
];

const TEMPLATE_EXAMPLE = [
  "COD-1001",
  "sphere",
  "WL-TCHECA",
  "fahto-media",
  "Visão Tcheca 3 frascos",
  "visao-tcheca-3",
  "CZ",
  "SP",
  "1",
  "890.00",
  "410.00",
  "guilhermepirespadilha",
  "delivered",
  "2026-08-01T10:30:00-03:00",
  "2026-08-02T09:15:00-03:00",
  "2026-08-04T14:00:00-03:00",
  "",
  "BRL",
  "",
  "",
];

type RowResult = {
  row_number: number;
  external_order_id: string | null;
  result: "ok" | "skip" | "orphan" | "error";
  message?: string;
};

type ValidateResponse = {
  success: boolean;
  dry_run?: boolean;
  summary: Record<string, number>;
  results: RowResult[];
};

type Job = {
  id: string;
  filename: string | null;
  total_rows: number;
  processed_rows: number;
  success_count: number;
  error_count: number;
  skipped_count: number;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  error_message: string | null;
  heartbeat_at: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

const RESULT_META: Record<string, { label: string; className: string }> = {
  ok: { label: "OK", className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" },
  orphan: { label: "Órfão", className: "bg-amber-500/10 text-amber-500 border-amber-500/30" },
  skip: { label: "Duplicado", className: "bg-muted text-muted-foreground border-border" },
  error: { label: "Erro", className: "bg-destructive/10 text-destructive border-destructive/30" },
};

const STATUS_META: Record<string, { label: string; className: string }> = {
  pending: { label: "na fila", className: "bg-muted text-muted-foreground border-border" },
  running: { label: "processando", className: "bg-sky-500/10 text-sky-500 border-sky-500/30" },
  completed: { label: "concluído", className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" },
  failed: { label: "falhou", className: "bg-destructive/10 text-destructive border-destructive/30" },
  cancelled: { label: "cancelado", className: "bg-amber-500/10 text-amber-500 border-amber-500/30" },
};

function downloadCsv(name: string, rows: string[][]) {
  const csv = rows.map((r) => r.map((c) => (/[",;\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CODImport() {
  const { operationId } = useOperation();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const [filename, setFilename] = useState<string>("");
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [retroactive, setRetroactive] = useState(true);
  const [running, setRunning] = useState<"validate" | "import" | null>(null);
  const [response, setResponse] = useState<ValidateResponse | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [detailJobId, setDetailJobId] = useState<string | null>(null);

  // Aliases aceitos em operation_id (ex.: FAHTO → fahto-media)
  const aliases = useQuery({
    queryKey: ["operation-aliases"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("operation_aliases")
        .select("alias_input, operations:operation_id(slug)")
        .order("alias_input");
      if (error) throw error;
      return (data ?? []) as { alias_input: string; operations: { slug: string } | null }[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const aliasNote = useMemo(() => {
    const list = aliases.data ?? [];
    if (list.length === 0) return "";
    const bySlug = new Map<string, string[]>();
    list.forEach((a) => {
      const slug = a.operations?.slug ?? "?";
      bySlug.set(slug, [...(bySlug.get(slug) ?? []), a.alias_input]);
    });
    return [...bySlug.entries()].map(([slug, al]) => `${slug} (${al.join(" | ")})`).join(" ; ");
  }, [aliases.data]);

  const history = useQuery({
    queryKey: ["cod-import-jobs", operationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cod_import_jobs")
        .select(
          "id, filename, total_rows, processed_rows, success_count, error_count, skipped_count, status, error_message, heartbeat_at, created_at, started_at, finished_at",
        )
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as Job[];
    },
    refetchInterval: 5000,
  });

  // Job em andamento (polling 2s)
  const job = useQuery({
    queryKey: ["cod-import-job", jobId],
    enabled: !!jobId,
    refetchInterval: (q) => {
      const s = (q.state.data as Job | undefined)?.status;
      return s === "pending" || s === "running" ? 2000 : false;
    },
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cod_import_jobs")
        .select(
          "id, filename, total_rows, processed_rows, success_count, error_count, skipped_count, status, error_message, heartbeat_at, created_at, started_at, finished_at",
        )
        .eq("id", jobId!)
        .maybeSingle();
      if (error) throw error;
      return data as Job;
    },
  });

  const jobErrors = useQuery({
    queryKey: ["cod-import-job-errors", detailJobId],
    enabled: !!detailJobId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cod_import_job_errors")
        .select("row_number, order_id, field, message")
        .eq("job_id", detailJobId!)
        .order("row_number", { ascending: true })
        .limit(2000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const activeJob = job.data;

  // Auto-retomada: job parado há > 5 min volta a rodar
  useEffect(() => {
    if (!activeJob || (activeJob.status !== "running" && activeJob.status !== "pending")) return;
    const beat = activeJob.heartbeat_at ? new Date(activeJob.heartbeat_at).getTime() : 0;
    if (Date.now() - beat < 5 * 60 * 1000) return;
    supabase.functions
      .invoke("cod-import-orders", {
        body: { action: "resume", operation_id: operationId, job_id: activeJob.id },
      })
      .then(() => toast.info("Job travado — retomando do último lote"));
  }, [activeJob?.status, activeJob?.heartbeat_at, activeJob?.id, operationId]);

  useEffect(() => {
    if (activeJob?.status === "completed") {
      queryClient.invalidateQueries({ queryKey: ["cod-import-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["cod-daily"] });
    }
  }, [activeJob?.status, queryClient]);

  const preview = useMemo(() => rows.slice(0, 10), [rows]);

  const parseFile = async (file: File) => {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", raw: false });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const parsed = XLSX.utils
      .sheet_to_json<Record<string, string>>(sheet, { defval: "", raw: false })
      // ignora linhas de nota/comentário do template (começam com #)
      .filter((r) => !String(r.order_id ?? "").trim().startsWith("#"));
    setFilename(file.name);
    setRows(parsed);
    setResponse(null);
    setJobId(null);
    if (parsed.length === 0) toast.error("Arquivo sem linhas de dados");
  };

  const missingRequired = useMemo(
    () =>
      rows.filter((r) => !String(r.project_slug ?? "").trim() || !String(r.country_code ?? "").trim()).length,
    [rows],
  );

  const call = async (action: "validate" | "import") => {
    if (rows.length === 0) return;
    if (action === "import" && missingRequired > 0) {
      toast.error(`${missingRequired} linha(s) sem project_slug/country_code — preencha antes de importar`);
      return;
    }
    setRunning(action);

    try {
      const { data, error } = await supabase.functions.invoke("cod-import-orders", {
        body: { action, operation_id: operationId, filename, retroactive, rows },
      });
      if (error) throw error;

      if (action === "import") {
        const res = data as { job_id: string; total_rows: number };
        setJobId(res.job_id);
        setResponse(null);
        toast.success(`Import enfileirado: ${res.total_rows} linhas em processamento`);
        queryClient.invalidateQueries({ queryKey: ["cod-import-jobs"] });
      } else {
        const res = data as ValidateResponse;
        setResponse(res);
        toast.success(`Validação: ${res.summary.ok} ok · ${res.summary.errors} erros`);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao processar o arquivo");
    } finally {
      setRunning(null);
    }
  };

  const cancelJob = async (id: string) => {
    try {
      const { error } = await supabase.functions.invoke("cod-import-orders", {
        body: { action: "cancel", operation_id: operationId, job_id: id },
      });
      if (error) throw error;
      toast.success("Job cancelado — o worker para no próximo lote");
      queryClient.invalidateQueries({ queryKey: ["cod-import-job", id] });
      queryClient.invalidateQueries({ queryKey: ["cod-import-jobs"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao cancelar");
    }
  };

  const undoJob = async (id: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("cod-import-orders", {
        body: { action: "undo", operation_id: operationId, job_id: id },
      });
      if (error) throw error;
      toast.success(`Lote desfeito: ${(data as any)?.deleted ?? 0} pedidos removidos`);
      queryClient.invalidateQueries({ queryKey: ["cod-import-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["cod-daily"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao desfazer o lote");
    }
  };

  const resumeJob = async (id: string) => {
    await supabase.functions.invoke("cod-import-orders", {
      body: { action: "resume", operation_id: operationId, job_id: id },
    });
    toast.info("Retomando job…");
  };

  const errorRows = (response?.results ?? []).filter((r) => r.result !== "ok");

  const eta = useMemo(() => {
    if (!activeJob || activeJob.status !== "running" || !activeJob.started_at || activeJob.processed_rows === 0) {
      return null;
    }
    const elapsed = Date.now() - new Date(activeJob.started_at).getTime();
    const perRow = elapsed / activeJob.processed_rows;
    const remaining = Math.max(activeJob.total_rows - activeJob.processed_rows, 0) * perRow;
    const min = Math.floor(remaining / 60000);
    const sec = Math.round((remaining % 60000) / 1000);
    return min > 0 ? `~${min}min ${sec}s restantes` : `~${sec}s restantes`;
  }, [activeJob]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Importar pedidos COD</h1>
          <p className="text-sm text-muted-foreground">
            Carga retroativa de pedidos que não passaram pelo webhook.
          </p>
          {aliasNote && (
            <p className="mt-1 text-xs text-muted-foreground">
              operation_id aceito: {aliasNote}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            downloadCsv("template_cod.csv", [
              TEMPLATE_COLUMNS,
              TEMPLATE_EXAMPLE,
              [
                `# operation_id aceita slug, UUID ou apelido: ${aliasNote || "fahto-media (FAHTO | fahto)"}`,
                ...TEMPLATE_COLUMNS.slice(1).map(() => ""),
              ],
              [
                `# status: canônicos pending | approved | delivered | cancelled | refunded · aliases: paid→approved; confirmed→approved; processing→pending; awaiting_payment→pending; billet_generated→pending; chargeback→refunded; disputed→refunded; shipped→delivered; refused→cancelled; expired→cancelled`,
                ...TEMPLATE_COLUMNS.slice(1).map(() => ""),
              ],
            ])
          }
        >
          <Download className="mr-2 h-4 w-4" /> Baixar template CSV
        </Button>
      </header>

      <Tabs defaultValue="import">
        <TabsList>
          <TabsTrigger value="import">Importar</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="import" className="space-y-4">
          <Card
            className="flex cursor-pointer flex-col items-center justify-center gap-2 border-dashed p-8 text-center"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) parseFile(f);
            }}
          >
            <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">
              {filename ? `${filename} · ${rows.length} linhas` : "Arraste o CSV/XLSX aqui ou clique para selecionar"}
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) parseFile(f);
              }}
            />
          </Card>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={retroactive} onCheckedChange={(v) => setRetroactive(Boolean(v))} />
            Importação retroativa (não dispara notificações de venda)
          </label>

          {preview.length > 0 && (
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    {Object.keys(preview[0]).slice(0, 9).map((c) => (
                      <th key={c} className="px-3 py-2 text-left font-medium">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r, i) => (
                    <tr key={i} className="border-t border-border">
                      {Object.keys(preview[0]).slice(0, 9).map((c) => (
                        <td key={c} className="px-3 py-2">{String(r[c] ?? "")}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {rows.length > 0 && missingRequired > 0 && (
            <p className="text-xs text-destructive">
              {missingRequired} linha(s) sem <code>project_slug</code> ou <code>country_code</code> — obrigatórios nesta versão.
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" disabled={rows.length === 0 || running !== null} onClick={() => call("validate")}>
              {running === "validate" ? "Validando…" : "Validar sem importar"}
            </Button>
            <Button disabled={rows.length === 0 || running !== null || missingRequired > 0} onClick={() => call("import")}>
              <Upload className="mr-2 h-4 w-4" />
              {running === "import" ? "Enfileirando…" : `Importar ${rows.length || ""}`}
            </Button>
          </div>

          {activeJob && (
            <Card className="space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {(activeJob.status === "running" || activeJob.status === "pending") && (
                    <Loader2 className="h-4 w-4 animate-spin text-sky-500" />
                  )}
                  {activeJob.filename ?? "import.csv"}
                  <Badge variant="outline" className={cn(STATUS_META[activeJob.status]?.className)}>
                    {STATUS_META[activeJob.status]?.label}
                  </Badge>
                </div>
                <div className="flex gap-2">
                  {(activeJob.status === "running" || activeJob.status === "pending") && (
                    <Button size="sm" variant="outline" onClick={() => cancelJob(activeJob.id)}>
                      <Ban className="mr-2 h-4 w-4" /> Cancelar
                    </Button>
                  )}
                  {activeJob.status === "failed" && (
                    <Button size="sm" variant="outline" onClick={() => resumeJob(activeJob.id)}>
                      <RefreshCw className="mr-2 h-4 w-4" /> Retomar
                    </Button>
                  )}
                </div>
              </div>

              <Progress value={(activeJob.processed_rows / Math.max(activeJob.total_rows, 1)) * 100} />

              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span>
                  {activeJob.processed_rows} / {activeJob.total_rows} linhas
                </span>
                <span className="text-emerald-500">{activeJob.success_count} importadas</span>
                <span>{activeJob.skipped_count} duplicadas</span>
                <span className="text-destructive">{activeJob.error_count} erros</span>
                {eta && <span>{eta}</span>}
              </div>

              {activeJob.error_message && (
                <p className="text-xs text-destructive">{activeJob.error_message}</p>
              )}

              {activeJob.status === "completed" && (
                <div className="flex flex-wrap gap-2">
                  {activeJob.error_count > 0 && (
                    <Button size="sm" variant="outline" onClick={() => setDetailJobId(activeJob.id)}>
                      Ver detalhes dos erros
                    </Button>
                  )}
                  <Button size="sm" variant="destructive" onClick={() => undoJob(activeJob.id)}>
                    <Undo2 className="mr-2 h-4 w-4" /> Desfazer lote
                  </Button>
                </div>
              )}
            </Card>
          )}

          {response && (
            <Card className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="flex items-center gap-1 text-emerald-500">
                  <CheckCircle2 className="h-4 w-4" /> {response.summary.ok} ok
                </span>
                <span className="flex items-center gap-1 text-muted-foreground">{response.summary.skipped} duplicados</span>
                <span className="flex items-center gap-1 text-amber-500">
                  <AlertTriangle className="h-4 w-4" /> {response.summary.orphan} órfãos
                </span>
                <span className="flex items-center gap-1 text-destructive">
                  <XCircle className="h-4 w-4" /> {response.summary.errors} erros
                </span>
                <Badge variant="outline">dry-run</Badge>
              </div>

              {errorRows.length > 0 && (
                <div className="max-h-64 space-y-1 overflow-y-auto text-xs">
                  {errorRows.map((r) => (
                    <div key={`${r.row_number}-${r.external_order_id}`} className="flex items-center gap-2">
                      <Badge variant="outline" className={cn("shrink-0", RESULT_META[r.result]?.className)}>
                        {RESULT_META[r.result]?.label}
                      </Badge>
                      <span className="text-muted-foreground">Linha {r.row_number}</span>
                      <span>{r.external_order_id ?? "—"}</span>
                      <span className="truncate">{r.message}</span>
                    </div>
                  ))}
                </div>
              )}

              {errorRows.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    downloadCsv("erros_import_cod.csv", [
                      ["linha", "order_id", "resultado", "mensagem"],
                      ...errorRows.map((r) => [String(r.row_number), r.external_order_id ?? "", r.result, r.message ?? ""]),
                    ])
                  }
                >
                  <Download className="mr-2 h-4 w-4" /> Baixar erros
                </Button>
              )}
            </Card>
          )}

          {detailJobId && (
            <Card className="space-y-2 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Erros do lote</p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      downloadCsv("erros_import_cod.csv", [
                        ["linha", "order_id", "campo", "mensagem"],
                        ...(jobErrors.data ?? []).map((e: any) => [
                          String(e.row_number ?? ""),
                          e.order_id ?? "",
                          e.field ?? "",
                          e.message ?? "",
                        ]),
                      ])
                    }
                  >
                    <Download className="mr-2 h-4 w-4" /> Baixar erros
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDetailJobId(null)}>
                    Fechar
                  </Button>
                </div>
              </div>
              {jobErrors.isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : (
                <div className="max-h-72 space-y-1 overflow-y-auto text-xs">
                  {(jobErrors.data ?? []).map((e: any, i: number) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-muted-foreground">Linha {e.row_number ?? "—"}</span>
                      <span>{e.order_id ?? "—"}</span>
                      <Badge variant="outline" className="shrink-0">{e.field ?? "—"}</Badge>
                      <span className="truncate">{e.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </TabsContent>

        <TabsContent value="history">
          <Card className="overflow-x-auto p-0">
            {history.isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Data</th>
                    <th className="px-3 py-2 text-left font-medium">Arquivo</th>
                    <th className="px-3 py-2 text-right font-medium">Linhas</th>
                    <th className="px-3 py-2 text-right font-medium">Importadas</th>
                    <th className="px-3 py-2 text-right font-medium">Erros</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {(history.data ?? []).map((j) => (
                    <tr key={j.id} className="border-t border-border">
                      <td className="px-3 py-2">{new Date(j.created_at).toLocaleString("pt-BR")}</td>
                      <td className="px-3 py-2">{j.filename}</td>
                      <td className="px-3 py-2 text-right">
                        {j.processed_rows}/{j.total_rows}
                      </td>
                      <td className="px-3 py-2 text-right">{j.success_count}</td>
                      <td className="px-3 py-2 text-right">{j.error_count}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={cn(STATUS_META[j.status]?.className)}>
                          {STATUS_META[j.status]?.label}
                        </Badge>
                      </td>
                      <td className="space-x-1 px-3 py-2 text-right">
                        {j.error_count > 0 && (
                          <Button size="sm" variant="ghost" onClick={() => setDetailJobId(j.id)}>
                            Ver erros
                          </Button>
                        )}
                        {(j.status === "running" || j.status === "pending" || j.status === "failed") && (
                          <Button size="sm" variant="ghost" onClick={() => resumeJob(j.id)}>
                            Retomar
                          </Button>
                        )}
                        {j.success_count > 0 && (
                          <Button size="sm" variant="ghost" onClick={() => undoJob(j.id)}>
                            Desfazer
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {(history.data ?? []).length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                        Nenhuma importação registrada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
