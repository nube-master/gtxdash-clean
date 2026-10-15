import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  ShoppingCart,
  SkipForward,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useOperation } from "@/contexts/OperationContext";

type LogRow = {
  id: string;
  status: string;
  message: string | null;
  records_processed: number | null;
  created_at: string;
};

function statusMeta(status: string) {
  switch (status) {
    case "success":
      return { icon: CheckCircle2, cls: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/20", label: "Sucesso" };
    case "error":
    case "failed":
      return { icon: XCircle, cls: "text-red-500", bg: "bg-red-500/10 border-red-500/20", label: "Erro" };
    case "skipped":
      return { icon: SkipForward, cls: "text-muted-foreground", bg: "bg-muted/30 border-border/50", label: "Ignorado" };
    default:
      return { icon: Activity, cls: "text-blue-500", bg: "bg-blue-500/10 border-blue-500/20", label: status };
  }
}

export function HotmartStatusPanel() {
  const { operation } = useOperation();

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["hotmart-status", operation?.id],
    enabled: !!operation?.id,
    refetchInterval: 30_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: logs = [] } = await supabase
        .from("integration_logs")
        .select("id, status, message, records_processed, created_at")
        .eq("integration", "hotmart")
        .eq("operation_id", operation!.id)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(200);
      return (logs || []) as LogRow[];
    },
  });

  const stats = useMemo(() => {
    const logs = data || [];
    const s = { success: 0, skipped: 0, error: 0, salesProcessed: 0, lastEventAt: null as string | null, lastSuccessAt: null as string | null, lastErrorAt: null as string | null };
    for (const l of logs) {
      if (l.status === "success") { s.success++; s.salesProcessed += l.records_processed || 0; s.lastSuccessAt ||= l.created_at; }
      else if (l.status === "skipped") s.skipped++;
      else { s.error++; s.lastErrorAt ||= l.created_at; }
      s.lastEventAt ||= l.created_at;
    }
    return s;
  }, [data]);

  const errors = (data || []).filter((l) => l.status !== "success" && l.status !== "skipped").slice(0, 5);
  const recent = (data || []).slice(0, 8);

  const healthy = stats.error === 0 && !!stats.lastEventAt;

  return (
    <div className="rounded-lg border border-border/50 bg-muted/10 p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5" /> Status de sincronização (últimos 7 dias)
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Monitora webhook, enriquecimento e vendas processadas em tempo real.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge
            variant="outline"
            className={
              healthy
                ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-[10px] gap-1"
                : stats.error > 0
                ? "bg-red-500/10 text-red-500 border-red-500/30 text-[10px] gap-1"
                : "bg-muted/30 text-muted-foreground border-border/50 text-[10px] gap-1"
            }
          >
            <span className={`h-1.5 w-1.5 rounded-full ${healthy ? "bg-emerald-500 animate-pulse" : stats.error > 0 ? "bg-red-500" : "bg-muted-foreground"}`} />
            {healthy ? "Saudável" : stats.error > 0 ? "Com erros" : "Sem eventos"}
          </Badge>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="h-7 px-2 gap-1 text-[11px]">
            {isFetching ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Atualizar
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <KpiCard icon={ShoppingCart} label="Vendas processadas" value={stats.salesProcessed} tone="emerald" />
        <KpiCard icon={CheckCircle2} label="Sucessos" value={stats.success} tone="emerald" />
        <KpiCard icon={SkipForward} label="Ignorados" value={stats.skipped} tone="muted" hint="Eventos que não são compra aprovada" />
        <KpiCard icon={AlertTriangle} label="Erros" value={stats.error} tone={stats.error > 0 ? "red" : "muted"} />
      </div>

      {/* Timestamps */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px]">
        <TimeCard label="Último evento" ts={stats.lastEventAt} />
        <TimeCard label="Última venda ok" ts={stats.lastSuccessAt} />
        <TimeCard label="Último erro" ts={stats.lastErrorAt} tone={stats.lastErrorAt ? "red" : "muted"} />
      </div>

      {/* Erros recentes */}
      {errors.length > 0 && (
        <div className="rounded border border-red-500/30 bg-red-500/5 p-3 space-y-1.5">
          <p className="text-xs font-semibold text-red-500 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" /> Erros recentes ({errors.length})
          </p>
          <div className="space-y-1">
            {errors.map((e) => (
              <div key={e.id} className="text-[11px] text-foreground/80 flex items-start gap-2">
                <span className="text-muted-foreground shrink-0 font-mono">
                  {formatDistanceToNow(new Date(e.created_at), { addSuffix: true, locale: ptBR })}
                </span>
                <span className="truncate">{e.message || "(sem mensagem)"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timeline recente */}
      <div>
        <p className="text-[11px] font-medium text-muted-foreground mb-1.5">Atividade recente</p>
        <div className="rounded border border-border/50 divide-y divide-border/50 bg-background/40 max-h-56 overflow-y-auto">
          {isLoading && (
            <div className="p-3 text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Carregando...
            </div>
          )}
          {!isLoading && recent.length === 0 && (
            <div className="p-3 text-xs text-muted-foreground">Nenhum evento nos últimos 7 dias.</div>
          )}
          {recent.map((l) => {
            const m = statusMeta(l.status);
            const Icon = m.icon;
            return (
              <div key={l.id} className="flex items-start gap-2 p-2 text-[11px]">
                <Icon className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${m.cls}`} />
                <div className="flex-1 min-w-0">
                  <div className="truncate text-foreground/90">{l.message || m.label}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {new Date(l.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                    {l.records_processed ? ` • ${l.records_processed} registro(s)` : ""}
                  </div>
                </div>
                <Badge variant="outline" className={`text-[9px] shrink-0 ${m.bg} ${m.cls} border-0`}>
                  {m.label}
                </Badge>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  tone,
  hint,
}: {
  icon: any;
  label: string;
  value: number;
  tone: "emerald" | "red" | "muted";
  hint?: string;
}) {
  const cls =
    tone === "emerald"
      ? "text-emerald-500"
      : tone === "red"
      ? "text-red-500"
      : "text-muted-foreground";
  return (
    <div className="rounded border border-border/50 bg-background/40 p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Icon className={`h-3 w-3 ${cls}`} />
        <span className="truncate">{label}</span>
      </div>
      <div className={`text-lg font-semibold mt-0.5 ${cls}`}>{value.toLocaleString("pt-BR")}</div>
      {hint && <div className="text-[9px] text-muted-foreground truncate">{hint}</div>}
    </div>
  );
}

function TimeCard({ label, ts, tone }: { label: string; ts: string | null; tone?: "red" | "muted" }) {
  const cls = tone === "red" ? "text-red-500" : "text-foreground";
  return (
    <div className="rounded border border-border/50 bg-background/40 p-2 flex items-center gap-2">
      <Clock className={`h-3 w-3 ${tone === "red" ? "text-red-500" : "text-muted-foreground"}`} />
      <div className="flex-1 min-w-0">
        <div className="text-[10px] text-muted-foreground">{label}</div>
        <div className={`text-[11px] font-medium truncate ${cls}`}>
          {ts ? formatDistanceToNow(new Date(ts), { addSuffix: true, locale: ptBR }) : "—"}
        </div>
      </div>
    </div>
  );
}
