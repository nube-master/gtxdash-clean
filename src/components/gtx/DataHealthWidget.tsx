import { useState } from "react";
import { useDataHealth, type HealthLog } from "@/hooks/useDataHealth";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Activity, AlertTriangle, CheckCircle2, Shield, XCircle, Clock, Database, Cpu, Zap } from "lucide-react";

const STATUS_CONFIG = {
  ok: { emoji: "🟢", label: "Sistema Saudável", color: "text-success", bg: "bg-emerald-400/10 border-emerald-400/30", icon: CheckCircle2 },
  warning: { emoji: "🟡", label: "Atenção", color: "text-amber-400", bg: "bg-amber-400/10 border-amber-400/30", icon: AlertTriangle },
  error: { emoji: "🔴", label: "Erro Crítico", color: "text-red", bg: "bg-red/10 border-red/30", icon: XCircle },
};

const TYPE_ICONS: Record<string, typeof Activity> = {
  sync: Database,
  calculation: Cpu,
  decision: Shield,
  api_write: Zap,
  api_read: Activity,
  integrity: Shield,
};

function timeAgo(dateStr: string): string {
  const mins = Math.round((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}m atrás`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h atrás`;
  return `${Math.floor(hours / 24)}d atrás`;
}

export function DataHealthWidget() {
  const { snapshot, logs, overallStatus, isFresh, isLoading } = useDataHealth();
  const [open, setOpen] = useState(false);

  if (isLoading) return null;

  const cfg = STATUS_CONFIG[overallStatus];

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 h-7 text-[10px] font-mono transition-colors cursor-pointer ${cfg.bg} hover:opacity-90`}
      >
        <span>{cfg.emoji}</span>
        <span className={cfg.color}>{cfg.label}</span>
        {!isFresh && <span className="text-muted-foreground/50">(desatualizado)</span>}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-[440px] sm:w-[500px] overflow-y-auto" side="right">
          <SheetHeader className="pb-4 border-b border-border/20">
            <SheetTitle className="text-sm font-mono flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              GTX Data Health
            </SheetTitle>
            <p className="text-[10px] text-muted-foreground font-mono">
              Auditoria de integridade do sistema
              {snapshot && <span className="ml-2">• Último check: {timeAgo(snapshot.created_at)}</span>}
            </p>
          </SheetHeader>

          {/* Snapshot Summary */}
          {snapshot && (
            <div className="pt-4 space-y-3">
              <div className={`flex items-center gap-2 rounded-lg border p-3 ${cfg.bg}`}>
                <cfg.icon className={`h-5 w-5 ${cfg.color}`} />
                <div>
                  <p className={`text-xs font-semibold ${cfg.color}`}>{cfg.emoji} {cfg.label}</p>
                  <p className="text-[10px] text-muted-foreground">
                    Snapshot de {new Date(snapshot.created_at).toLocaleDateString("pt-BR")} às{" "}
                    {new Date(snapshot.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 gap-2">
                <MetricCard icon={Database} label="Campanhas Meta" value={snapshot.total_campaigns_meta} />
                <MetricCard icon={Database} label="Campanhas Dash" value={snapshot.total_campaigns_dash} />
                <MetricCard
                  icon={AlertTriangle}
                  label="Divergência"
                  value={`${snapshot.divergence_percent.toFixed(1)}%`}
                  alert={snapshot.divergence_percent > 3}
                />
                <MetricCard icon={Zap} label="Erros API 24h" value={snapshot.api_write_errors_24h} alert={snapshot.api_write_errors_24h > 5} />
                <MetricCard icon={Cpu} label="Erros Cálculo" value={snapshot.calculation_errors} alert={snapshot.calculation_errors > 0} />
                <MetricCard icon={Shield} label="Erros Decisão" value={snapshot.decision_errors} alert={snapshot.decision_errors > 0} />
              </div>
            </div>
          )}

          {/* Recent Health Logs */}
          <div className="pt-4">
            <h4 className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-mono mb-2">
              Logs Recentes ({logs.length})
            </h4>
            <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
              {logs.length === 0 ? (
                <p className="text-[10px] text-muted-foreground text-center py-6">
                  Nenhum log de saúde encontrado. Execute o health check.
                </p>
              ) : (
                logs.map((log) => <LogEntry key={log.id} log={log} />)
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function MetricCard({ icon: Icon, label, value, alert }: { icon: typeof Activity; label: string; value: string | number; alert?: boolean }) {
  return (
    <div className={`rounded-lg border p-2.5 ${alert ? "border-red/30 bg-red/5" : "border-border/20 bg-card"}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={`h-3 w-3 ${alert ? "text-red" : "text-muted-foreground/60"}`} />
        <span className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</span>
      </div>
      <span className={`text-sm font-mono font-semibold ${alert ? "text-red" : "text-foreground"}`}>{value}</span>
    </div>
  );
}

function LogEntry({ log }: { log: HealthLog }) {
  const Icon = TYPE_ICONS[log.type] || Activity;
  const statusColor = log.status === "error" ? "text-red" : log.status === "warning" ? "text-amber-400" : "text-success";
  const borderColor = log.status === "error" ? "border-red/20" : log.status === "warning" ? "border-amber-400/20" : "border-border/10";

  return (
    <div className={`flex items-start gap-2 rounded border p-2 ${borderColor}`}>
      <Icon className={`h-3 w-3 mt-0.5 shrink-0 ${statusColor}`} />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-foreground/80 leading-tight">{log.message}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[8px] text-muted-foreground/50 font-mono">{log.source}</span>
          <span className="text-[8px] text-muted-foreground/40">•</span>
          <span className="text-[8px] text-muted-foreground/50">{timeAgo(log.created_at)}</span>
        </div>
      </div>
    </div>
  );
}
