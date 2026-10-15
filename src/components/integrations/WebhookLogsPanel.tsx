import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Code2, Inbox, RotateCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOperation } from "@/contexts/OperationContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type WebhookStatus = "success" | "error" | "orphan" | "duplicate";
type WebhookLog = {
  id: string;
  source: string;
  status: WebhookStatus;
  error_message: string | null;
  payload: unknown;
  response: unknown;
  payload_hash: string;
  external_order_id: string | null;
  product_name: string | null;
  value_cents: number | null;
  currency: string | null;
  received_at: string;
};

const PAGE_SIZE = 20;
const SP_TIMEZONE = "America/Sao_Paulo";

function brtBoundary(date: string, end = false) {
  return `${date}T${end ? "23:59:59.999" : "00:00:00.000"}-03:00`;
}

function todayBrt() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: SP_TIMEZONE }).format(new Date());
}

function sevenDaysAgoBrt() {
  const date = new Date();
  date.setDate(date.getDate() - 6);
  return new Intl.DateTimeFormat("en-CA", { timeZone: SP_TIMEZONE }).format(date);
}

function statusClass(status: WebhookStatus) {
  if (status === "success") return "border-[hsl(var(--warroom-positive))]/30 bg-[hsl(var(--warroom-positive))]/10 text-[hsl(var(--warroom-positive))]";
  if (status === "error") return "border-destructive/30 bg-destructive/10 text-destructive";
  if (status === "orphan") return "border-[hsl(var(--warroom-warning))]/30 bg-[hsl(var(--warroom-warning))]/10 text-[hsl(var(--warroom-warning))]";
  return "border-border bg-muted text-muted-foreground";
}

export function WebhookLogsPanel() {
  const { operationId } = useOperation();
  const [source, setSource] = useState("all");
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState(sevenDaysAgoBrt);
  const [to, setTo] = useState(todayBrt);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<WebhookLog | null>(null);

  useEffect(() => setPage(0), [operationId, source, status, from, to]);

  const query = useQuery({
    queryKey: ["webhook-logs", operationId, source, status, from, to, page],
    queryFn: async () => {
      if (!operationId) return { rows: [] as WebhookLog[], count: 0 };
      let request = supabase
        .from("webhook_logs")
        .select("id, source, status, error_message, payload, response, payload_hash, external_order_id, product_name, value_cents, currency, received_at", { count: "exact" })
        .eq("operation_id", operationId)
        .gte("received_at", brtBoundary(from))
        .lte("received_at", brtBoundary(to, true))
        .order("received_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (source !== "all") request = request.eq("source", source);
      if (status !== "all") request = request.eq("status", status);
      const { data, count, error } = await request;
      if (error) throw error;
      return { rows: (data ?? []) as WebhookLog[], count: count ?? 0 };
    },
    enabled: Boolean(operationId),
  });

  const summary = useQuery({
    queryKey: ["webhook-logs-summary", operationId],
    queryFn: async () => {
      if (!operationId) return { success: 0, error: 0, orphan: 0 };
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const statuses: WebhookStatus[] = ["success", "error", "orphan"];
      const counts = await Promise.all(statuses.map(async (item) => {
        const { count } = await supabase
          .from("webhook_logs")
          .select("id", { count: "exact", head: true })
          .eq("operation_id", operationId)
          .eq("status", item)
          .gte("received_at", since);
        return [item, count ?? 0] as const;
      }));
      return Object.fromEntries(counts) as Record<"success" | "error" | "orphan", number>;
    },
    enabled: Boolean(operationId),
  });

  const totalPages = Math.max(1, Math.ceil((query.data?.count ?? 0) / PAGE_SIZE));
  const sources = useMemo(() => ["hw", "fahto", "sphere"], []);

  return (
    <>
      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base"><Inbox className="h-4 w-4" />Webhook Logs</CardTitle>
              <CardDescription className="mt-1 text-xs">Requisições recebidas pela operação, exibidas no horário de São Paulo.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline" className={statusClass("success")}>{summary.data?.success ?? 0} sucessos</Badge>
              <Badge variant="outline" className={statusClass("error")}>{summary.data?.error ?? 0} erros</Badge>
              <Badge variant="outline" className={statusClass("orphan")}>{summary.data?.orphan ?? 0} órfãos · 24h</Badge>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger><SelectValue placeholder="Origem" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Todas as origens</SelectItem>{sources.map((item) => <SelectItem key={item} value={item}>{item.toUpperCase()}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="success">Sucesso</SelectItem>
                <SelectItem value="error">Erro</SelectItem>
                <SelectItem value="orphan">Órfão</SelectItem>
                <SelectItem value="duplicate">Duplicado</SelectItem>
              </SelectContent>
            </Select>
            <Input aria-label="Data inicial" type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} />
            <Input aria-label="Data final" type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} />
            <Button variant="outline" className="gap-2" onClick={() => query.refetch()} disabled={query.isFetching}><RotateCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />Atualizar</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-md border border-border">
            <Table>
              <TableHeader><TableRow><TableHead>Recebido</TableHead><TableHead>Origem</TableHead><TableHead>Status</TableHead><TableHead>Pedido</TableHead><TableHead>Produto</TableHead><TableHead className="text-right">Detalhes</TableHead></TableRow></TableHeader>
              <TableBody>
                {query.isLoading && <TableRow><TableCell colSpan={6} className="h-28 text-center text-muted-foreground">Carregando registros…</TableCell></TableRow>}
                {!query.isLoading && !query.data?.rows.length && <TableRow><TableCell colSpan={6} className="h-28 text-center text-muted-foreground">Nenhuma requisição neste período.</TableCell></TableRow>}
                {query.data?.rows.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-xs font-mono">{new Date(log.received_at).toLocaleString("pt-BR", { timeZone: SP_TIMEZONE })}</TableCell>
                    <TableCell className="text-xs font-semibold uppercase">{log.source}</TableCell>
                    <TableCell><Badge variant="outline" className={statusClass(log.status)}>{log.status}</Badge></TableCell>
                    <TableCell className="max-w-40 truncate text-xs font-mono">{log.external_order_id ?? "—"}</TableCell>
                    <TableCell className="max-w-48 truncate text-xs">{log.product_name ?? "—"}</TableCell>
                    <TableCell className="text-right"><Button size="icon" variant="ghost" aria-label="Ver JSON" title="Ver JSON" onClick={() => setSelected(log)}><Code2 className="h-4 w-4" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <span>{query.data?.count ?? 0} registros · últimos 200 disponíveis</span>
            <div className="flex items-center gap-2">
              <Button size="icon" variant="outline" aria-label="Página anterior" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}><ChevronLeft className="h-4 w-4" /></Button>
              <span>Página {page + 1} de {totalPages}</span>
              <Button size="icon" variant="outline" aria-label="Próxima página" disabled={page + 1 >= totalPages || page >= 9} onClick={() => setPage((value) => value + 1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
          <DialogHeader><DialogTitle>Detalhes do webhook</DialogTitle><DialogDescription>{selected ? new Date(selected.received_at).toLocaleString("pt-BR", { timeZone: SP_TIMEZONE }) : ""}</DialogDescription></DialogHeader>
          {selected && <div className="space-y-4 text-xs">
            {selected.error_message && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive">{selected.error_message}</div>}
            <div><p className="mb-2 font-semibold">Payload completo</p><pre className="max-h-72 overflow-auto rounded-md border border-border bg-muted/40 p-4 font-mono text-[11px] whitespace-pre-wrap break-all">{JSON.stringify(selected.payload, null, 2)}</pre></div>
            <div><p className="mb-2 font-semibold">Resposta e campos inferidos</p><pre className="max-h-56 overflow-auto rounded-md border border-border bg-muted/40 p-4 font-mono text-[11px] whitespace-pre-wrap break-all">{JSON.stringify(selected.response, null, 2)}</pre></div>
            <p className="font-mono text-[10px] text-muted-foreground break-all">SHA-256: {selected.payload_hash}</p>
          </div>}
        </DialogContent>
      </Dialog>
    </>
  );
}
