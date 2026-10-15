import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type { AuditResult, AuditWarning, AuditSeverity } from "@/hooks/useGtxAudit";

const SEVERITY_CONFIG: Record<AuditSeverity, { icon: typeof XCircle; color: string; bg: string; label: string }> = {
  critical: { icon: XCircle, color: "text-red", bg: "bg-red/10 border-red/20", label: "Crítico" },
  warning: { icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-400/10 border-amber-400/20", label: "Aviso" },
  info: { icon: Info, color: "text-blue-400", bg: "bg-blue-400/10 border-blue-400/20", label: "Info" },
};

interface Props {
  audit: AuditResult;
}

export function GtxAuditBadge({ audit }: Props) {
  const [open, setOpen] = useState(false);

  const emoji = audit.status === "red" ? "🔴" : audit.status === "yellow" ? "🟡" : "🟢";
  const badgeBg =
    audit.status === "red"
      ? "bg-red/10 border-red/30 text-red hover:bg-red/20"
      : audit.status === "yellow"
      ? "bg-amber-400/10 border-amber-400/30 text-amber-400 hover:bg-amber-400/20"
      : "bg-emerald-400/10 border-emerald-400/30 text-emerald-400 hover:bg-emerald-400/20";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1 rounded-md border px-2 h-6 text-[9px] font-mono transition-colors cursor-pointer ${badgeBg}`}
      >
        <span>{emoji}</span>
        <span>{audit.statusLabel}</span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-[420px] sm:w-[480px] overflow-y-auto" side="right">
          <SheetHeader className="pb-4 border-b border-border/20">
            <SheetTitle className="text-sm font-mono flex items-center gap-2">
              <span>{emoji}</span>
              Auditoria de Dados GTX
            </SheetTitle>
            <div className="flex gap-2 text-[10px] font-mono">
              {audit.criticalCount > 0 && (
                <span className="text-red">{audit.criticalCount} crítico(s)</span>
              )}
              {audit.warningCount > 0 && (
                <span className="text-amber-400">{audit.warningCount} aviso(s)</span>
              )}
              {audit.infoCount > 0 && (
                <span className="text-blue-400">{audit.infoCount} info</span>
              )}
              {audit.warnings.length === 0 && (
                <span className="text-emerald-400">Todos os dados estão consistentes ✓</span>
              )}
            </div>
          </SheetHeader>

          <div className="space-y-2 pt-4">
            {audit.warnings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle2 className="h-10 w-10 text-emerald-400 mb-3" />
                <p className="text-sm font-mono text-emerald-400">Auditoria aprovada</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  ROAS, lucro e decisões estão corretos
                </p>
              </div>
            ) : (
              <WarningList warnings={audit.warnings} />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function WarningList({ warnings }: { warnings: AuditWarning[] }) {
  const [filterSeverity, setFilterSeverity] = useState<AuditSeverity | "all">("all");

  const filtered = filterSeverity === "all" ? warnings : warnings.filter((w) => w.severity === filterSeverity);

  // Group by tipo_erro
  const grouped = new Map<string, AuditWarning[]>();
  for (const w of filtered) {
    if (!grouped.has(w.tipo_erro)) grouped.set(w.tipo_erro, []);
    grouped.get(w.tipo_erro)!.push(w);
  }

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex gap-1">
        {(["all", "critical", "warning", "info"] as const).map((sev) => (
          <button
            key={sev}
            onClick={() => setFilterSeverity(sev)}
            className={`px-2 h-5 text-[8px] font-mono rounded border transition-colors ${
              filterSeverity === sev
                ? "bg-primary/10 border-primary/30 text-primary"
                : "border-border/20 text-muted-foreground/50 hover:text-muted-foreground"
            }`}
          >
            {sev === "all" ? `Todos (${warnings.length})` : `${SEVERITY_CONFIG[sev].label} (${warnings.filter(w => w.severity === sev).length})`}
          </button>
        ))}
      </div>

      {/* Grouped warnings */}
      {Array.from(grouped.entries()).map(([tipo, items]) => (
        <div key={tipo} className="space-y-1">
          <h4 className="text-[9px] uppercase tracking-widest text-muted-foreground/60 font-mono">
            {tipo.replace(/_/g, " ")} ({items.length})
          </h4>
          {items.map((w, i) => {
            const cfg = SEVERITY_CONFIG[w.severity];
            const Icon = cfg.icon;
            return (
              <div key={i} className={`p-2 rounded border ${cfg.bg}`}>
                <div className="flex items-start gap-1.5">
                  <Icon className={`h-3 w-3 mt-0.5 shrink-0 ${cfg.color}`} />
                  <div className="min-w-0">
                    <p className="text-[10px] text-foreground/80 leading-tight">{w.descricao}</p>
                    <p className="text-[8px] text-muted-foreground/50 font-mono mt-0.5 truncate">{w.campaign_id}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
