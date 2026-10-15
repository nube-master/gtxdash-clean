import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, TrendingUp, TrendingDown, Flame, Zap, ShieldAlert, CheckCircle2 } from "lucide-react";

type ProjectMetric = {
  code: string;
  revenue: number;
  spend: number;
  sales: number;
  roas: number;
  cac: number;
  ctr: number;
  clicks: number;
  ics: number;
};

type Alert = {
  id: string;
  severity: "critical" | "warning" | "positive" | "info";
  project: string;
  title: string;
  detail: string;
  icon: typeof AlertTriangle;
};

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

function buildAlerts(projects: ProjectMetric[]): Alert[] {
  const alerts: Alert[] = [];
  for (const p of projects) {
    if (p.code === "OUTROS") continue;

    // CRITICAL: gasto sem venda
    if (p.spend >= 100 && p.sales === 0) {
      alerts.push({
        id: `${p.code}-no-sale`,
        severity: "critical",
        project: p.code,
        title: "Gasto sem venda",
        detail: `${fmtBRL(p.spend)} investidos, 0 vendas aprovadas`,
        icon: ShieldAlert,
      });
    }

    // CRITICAL: ROAS muito baixo
    if (p.spend >= 200 && p.roas > 0 && p.roas < 0.6) {
      alerts.push({
        id: `${p.code}-roas-crit`,
        severity: "critical",
        project: p.code,
        title: "ROAS crítico",
        detail: `${p.roas.toFixed(2)}x · gasto ${fmtBRL(p.spend)} · receita ${fmtBRL(p.revenue)}`,
        icon: TrendingDown,
      });
    }

    // WARNING: ROAS abaixo de 1
    if (p.spend >= 200 && p.roas >= 0.6 && p.roas < 1) {
      alerts.push({
        id: `${p.code}-roas-warn`,
        severity: "warning",
        project: p.code,
        title: "ROAS abaixo de 1x",
        detail: `${p.roas.toFixed(2)}x — operação no negativo`,
        icon: AlertTriangle,
      });
    }

    // WARNING: CPA alto
    if (p.sales > 0 && p.cac > 600) {
      alerts.push({
        id: `${p.code}-cpa-high`,
        severity: "warning",
        project: p.code,
        title: "CPA estourando",
        detail: `${fmtBRL(p.cac)}/venda · ${p.sales} venda(s)`,
        icon: AlertTriangle,
      });
    }

    // POSITIVE: oportunidade de escala
    if (p.spend >= 150 && p.roas >= 1.8) {
      alerts.push({
        id: `${p.code}-scale`,
        severity: "positive",
        project: p.code,
        title: "Pronto para escalar",
        detail: `ROAS ${p.roas.toFixed(2)}x · ${p.sales} vendas · CPA ${fmtBRL(p.cac)}`,
        icon: Flame,
      });
    }

    // INFO: ICs sem conversão (funil quebrado)
    if (p.ics >= 10 && p.sales === 0) {
      alerts.push({
        id: `${p.code}-ic-no-sale`,
        severity: "warning",
        project: p.code,
        title: "ICs sem fechamento",
        detail: `${p.ics} checkouts iniciados, 0 vendas — checar pagamento/oferta`,
        icon: Zap,
      });
    }
  }

  // ordena: critical → warning → positive → info
  const rank: Record<Alert["severity"], number> = { critical: 0, warning: 1, positive: 2, info: 3 };
  alerts.sort((a, b) => rank[a.severity] - rank[b.severity]);
  return alerts;
}

const severityStyle: Record<Alert["severity"], { bg: string; border: string; text: string; chip: string; label: string }> = {
  critical: { bg: "bg-rose-500/10", border: "border-rose-500/40", text: "text-rose-300", chip: "bg-rose-500/20 text-rose-300", label: "CRÍTICO" },
  warning: { bg: "bg-amber-500/10", border: "border-amber-500/40", text: "text-amber-300", chip: "bg-amber-500/20 text-amber-300", label: "ATENÇÃO" },
  positive: { bg: "bg-emerald-500/10", border: "border-emerald-500/40", text: "text-emerald-300", chip: "bg-emerald-500/20 text-emerald-300", label: "OPORTUNIDADE" },
  info: { bg: "bg-sky-500/10", border: "border-sky-500/40", text: "text-sky-300", chip: "bg-sky-500/20 text-sky-300", label: "INFO" },
};

type Props = {
  projects: ProjectMetric[];
  onProjectClick?: (code: string) => void;
};

export function SmartAlerts({ projects, onProjectClick }: Props) {
  const [filter, setFilter] = useState<"all" | Alert["severity"]>("all");
  const alerts = useMemo(() => buildAlerts(projects), [projects]);
  const filtered = filter === "all" ? alerts : alerts.filter((a) => a.severity === filter);

  const counts = useMemo(() => {
    const c: Record<Alert["severity"], number> = { critical: 0, warning: 0, positive: 0, info: 0 };
    for (const a of alerts) c[a.severity]++;
    return c;
  }, [alerts]);

  return (
    <Card className="border-border/40 bg-card/40">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Alertas Inteligentes
            </h3>
            <Badge variant="outline" className="text-[10px] h-5">{alerts.length}</Badge>
          </div>
          <div className="flex gap-1 flex-wrap">
            {(["all", "critical", "warning", "positive"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`text-[10px] px-2 py-1 rounded border transition-colors ${
                  filter === f
                    ? "bg-foreground/10 border-foreground/30 text-foreground"
                    : "border-border/40 text-muted-foreground hover:text-foreground"
                }`}
              >
                {f === "all" ? `Todos (${alerts.length})` :
                 f === "critical" ? `Crítico (${counts.critical})` :
                 f === "warning" ? `Atenção (${counts.warning})` :
                 `Oportunidade (${counts.positive})`}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-4 justify-center">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            Nenhum alerta no momento — operação saudável.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {filtered.map((a) => {
              const s = severityStyle[a.severity];
              const Icon = a.icon;
              return (
                <button
                  key={a.id}
                  onClick={() => onProjectClick?.(a.project)}
                  className={`text-left rounded-md border p-2.5 ${s.bg} ${s.border} hover:brightness-110 transition`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <Icon className={`w-3.5 h-3.5 ${s.text}`} />
                      <span className="text-[11px] font-semibold text-foreground">{a.project}</span>
                    </div>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${s.chip}`}>{s.label}</span>
                  </div>
                  <div className={`text-[11px] font-medium ${s.text}`}>{a.title}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{a.detail}</div>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
