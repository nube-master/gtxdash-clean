import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { format, parseISO, startOfWeek, endOfWeek, subWeeks } from "date-fns";
import { ptBR } from "date-fns/locale";
import { FileText, History, AlertTriangle, CheckCircle2, CreditCard, Wallet, Trash2, Loader2 } from "lucide-react";

type LogRow = {
  id: string;
  integration: string;
  status: string;
  records_processed: number | null;
  message: string | null;
  created_at: string;
};

interface ParsedSummary {
  provider?: string;
  file_name?: string;
  total_rows?: number;
  parsed_charges?: number;
  inserted?: number;
  duplicated?: number;
  failed?: number;
  payoneer_tx_total?: number;
  payoneer_tx_inserted?: number;
  topups_auto_created?: number;
  skipped?: { reason: string; count: number }[];
  // janela de datas das charges (não vem do parser hoje, mas reservamos)
  min_charge_date?: string;
  max_charge_date?: string;
}

function safeParse(msg: string | null): ParsedSummary {
  if (!msg) return {};
  try { return JSON.parse(msg) as ParsedSummary; } catch { return {}; }
}

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

export function UploadHistoryPanel() {
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; provider: string; file: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Logs de upload (últimos 90)
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["recon-upload-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("integration_logs")
        .select("id, integration, status, records_processed, message, created_at")
        .in("integration", ["card_extract_lot", "card_extract_payoneer"])
        .order("created_at", { ascending: false })
        .limit(90);
      if (error) throw error;
      return (data || []) as LogRow[];
    },
    refetchInterval: 60_000,
  });

  async function handleDelete(logId: string) {
    setDeletingId(logId);
    try {
      const { data, error } = await supabase.functions.invoke("delete-card-extract-upload", {
        body: { log_id: logId },
      });
      if (error) throw error;
      const d = (data as any)?.deleted;
      toast.success(
        `Upload removido. ${d?.charges ?? 0} cobranças, ${d?.payoneer_transactions ?? 0} transações e ${d?.treasury_topups ?? 0} topups apagados.`,
      );
      queryClient.invalidateQueries({ queryKey: ["recon-upload-logs"] });
      queryClient.invalidateQueries({ queryKey: ["recon-week-coverage"] });
    } catch (e: any) {
      toast.error(`Falha ao remover upload: ${e?.message || e}`);
    } finally {
      setDeletingId(null);
      setConfirmDelete(null);
    }
  }

  // Para o alerta de segunda: precisa saber a janela coberta pelo upload.
  // Aproximação: usa charge_date min/max em daily_card_charges criados via uploads recentes.
  const { data: weekCoverage } = useQuery({
    queryKey: ["recon-week-coverage"],
    queryFn: async () => {
      const lastWeekStart = format(startOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 }), "yyyy-MM-dd");
      const lastWeekEnd = format(endOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 }), "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("daily_card_charges")
        .select("card_provider, charge_date")
        .gte("charge_date", lastWeekStart)
        .lte("charge_date", lastWeekEnd)
        .limit(2000);
      if (error) throw error;
      const providers = new Set<string>();
      for (const r of (data || [])) providers.add(String((r as any).card_provider));
      return { lastWeekStart, lastWeekEnd, providers: Array.from(providers) };
    },
    refetchInterval: 5 * 60_000,
  });

  const isMonday = new Date().getDay() === 1;
  const needsAlert = isMonday && weekCoverage && weekCoverage.providers.length === 0;

  const enriched = useMemo(() => logs.map((l) => ({
    ...l,
    provider: l.integration.replace("card_extract_", "") as "lot" | "payoneer",
    summary: safeParse(l.message),
  })), [logs]);

  const stats = useMemo(() => {
    const total = enriched.length;
    const lotCount = enriched.filter((l) => l.provider === "lot").length;
    const payCount = enriched.filter((l) => l.provider === "payoneer").length;
    const totalInserted = enriched.reduce((s, l) => s + (l.records_processed || 0), 0);
    return { total, lotCount, payCount, totalInserted };
  }, [enriched]);

  return (
    <div className="space-y-4">
      {/* Banner segunda-feira */}
      {needsAlert && (
        <Alert variant="destructive" className="border-amber-500/50 bg-amber-500/10 text-amber-100">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Falta subir o extrato da semana passada</AlertTitle>
          <AlertDescription className="text-xs mt-1">
            Hoje é segunda-feira e ainda não há cobranças importadas para o período{" "}
            <strong>
              {format(parseISO(weekCoverage!.lastWeekStart), "dd/MM", { locale: ptBR })} →{" "}
              {format(parseISO(weekCoverage!.lastWeekEnd), "dd/MM/yyyy", { locale: ptBR })}
            </strong>
            . Vai na aba <strong>Upload CSV</strong> e sobe o Payoneer ou o Lot da semana.
          </AlertDescription>
        </Alert>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={History} label="Uploads (90d)" value={String(stats.total)} />
        <StatCard icon={CreditCard} label="Lot" value={String(stats.lotCount)} accent="text-emerald-400" />
        <StatCard icon={Wallet} label="Payoneer" value={String(stats.payCount)} accent="text-blue-400" />
        <StatCard icon={CheckCircle2} label="Cobranças inseridas" value={String(stats.totalInserted)} accent="text-primary" />
      </div>

      {/* Tabela */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-primary" />
            Histórico de uploads
            <Badge variant="outline" className="ml-auto text-[10px]">Últimos 90</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : enriched.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nenhum upload registrado ainda.</p>
              <p className="text-xs mt-1">Use a aba "Upload CSV" pra subir Payoneer ou Lot.</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[560px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Data / Hora</TableHead>
                    <TableHead className="text-xs">Provider</TableHead>
                    <TableHead className="text-xs">Arquivo</TableHead>
                    <TableHead className="text-right text-xs">Linhas CSV</TableHead>
                    <TableHead className="text-right text-xs">Meta detectado</TableHead>
                    <TableHead className="text-right text-xs">Inseridas</TableHead>
                    <TableHead className="text-right text-xs">Duplicadas</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Skipped</TableHead>
                    <TableHead className="text-xs text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {enriched.map((l) => {
                    const s = l.summary;
                    const isOk = l.status === "success";
                    return (
                      <TableRow key={l.id}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {format(parseISO(l.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] ${l.provider === "lot" ? "border-emerald-500/40 text-emerald-300" : "border-blue-500/40 text-blue-300"}`}>
                            {l.provider === "lot" ? "Lot" : "Payoneer"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs max-w-[220px] truncate font-mono text-muted-foreground" title={s.file_name}>
                          {s.file_name || "—"}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{s.total_rows ?? "—"}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{s.parsed_charges ?? "—"}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums font-medium text-primary">{s.inserted ?? l.records_processed ?? 0}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums text-muted-foreground">{s.duplicated ?? 0}</TableCell>
                        <TableCell>
                          <Badge className={`text-[10px] ${isOk ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" : "bg-destructive/15 text-destructive border-destructive/30"}`}>
                            {isOk ? "✓ Sucesso" : "⚠ " + l.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-[10px] text-muted-foreground">
                          {(s.skipped || []).filter((x) => x.count > 0).map((x) => `${x.reason}=${x.count}`).join(" · ") || "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                            disabled={deletingId === l.id}
                            onClick={() => setConfirmDelete({ id: l.id, provider: l.provider, file: s.file_name || "(sem nome)" })}
                            title="Excluir este upload e desfazer todas as inserções"
                          >
                            {deletingId === l.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Card className="border-blue-500/30 bg-blue-500/5">
        <CardContent className="p-4 text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-blue-400">📅 Fluxo recomendado</p>
          <p>Toda <strong>segunda-feira</strong> sobe o extrato (Payoneer ou Lot) cobrindo segunda → domingo da semana anterior.</p>
          <p>O sistema é idempotente — se subir o mesmo arquivo 2x, as duplicadas são detectadas e ignoradas.</p>
        </CardContent>
      </Card>

      <AlertDialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir este upload?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                Vai apagar todas as cobranças, transações e topups que entraram no banco a partir do
                arquivo <strong className="text-foreground">{confirmDelete?.file}</strong>{" "}
                ({confirmDelete?.provider === "lot" ? "Lot" : "Payoneer"}).
              </span>
              <span className="block text-destructive">
                Essa ação não pode ser desfeita. Pra recolocar os dados, vai ter que subir o CSV de novo.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmDelete && handleDelete(confirmDelete.id)}
            >
              Sim, excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string; accent?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] text-muted-foreground">{label}</span>
          <Icon className={`w-3.5 h-3.5 ${accent || "text-muted-foreground"}`} />
        </div>
        <div className={`text-xl font-bold tabular-nums ${accent || ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
