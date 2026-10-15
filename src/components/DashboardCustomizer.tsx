import { useState, useCallback, useMemo } from "react";
import { Settings2, GripVertical, Eye, EyeOff, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";

export interface DashboardWidget {
  id: string;
  label: string;
  enabled: boolean;
}

const DEFAULT_WIDGETS: DashboardWidget[] = [
  { id: "financial", label: "Financeiro (KPIs)", enabled: true },
  { id: "funnel", label: "Funil (KPIs)", enabled: true },
  { id: "sales-intel", label: "Inteligência de Vendas", enabled: true },
  { id: "market-pulse", label: "Market Pulse", enabled: true },
  { id: "hourly-profit", label: "Lucro por Horário", enabled: true },
  { id: "hourly-sales", label: "Vendas por Horário", enabled: true },
  { id: "hourly-accumulated", label: "Acumulado por Hora", enabled: true },
  { id: "hourly-table", label: "Tabela Analítica por Hora", enabled: true },
  { id: "health-status", label: "Status da Operação", enabled: true },
  { id: "health-score", label: "Health Score GTX", enabled: true },
  { id: "causa-raiz", label: "Causa Raiz", enabled: true },
  { id: "projecao", label: "Projeção Final do Dia", enabled: true },
  { id: "risk-radar", label: "Radar de Risco", enabled: true },
  { id: "alerts", label: "Alertas", enabled: true },
];

const STORAGE_KEY = "wr-dashboard-widgets";

function loadWidgets(): DashboardWidget[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as DashboardWidget[];
      // Merge with defaults to pick up new widgets
      const map = new Map(parsed.map((w) => [w.id, w]));
      return DEFAULT_WIDGETS.map((d) => ({
        ...d,
        enabled: map.has(d.id) ? map.get(d.id)!.enabled : d.enabled,
      }));
    }
  } catch {}
  return DEFAULT_WIDGETS;
}

function saveWidgets(widgets: DashboardWidget[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
}

export function useDashboardWidgets() {
  const [widgets, setWidgets] = useState<DashboardWidget[]>(loadWidgets);

  const toggleWidget = useCallback((id: string) => {
    setWidgets((prev) => {
      const next = prev.map((w) => (w.id === id ? { ...w, enabled: !w.enabled } : w));
      saveWidgets(next);
      return next;
    });
  }, []);

  const resetWidgets = useCallback(() => {
    setWidgets(DEFAULT_WIDGETS);
    saveWidgets(DEFAULT_WIDGETS);
  }, []);

  const isVisible = useCallback(
    (id: string) => widgets.find((w) => w.id === id)?.enabled ?? true,
    [widgets]
  );

  return { widgets, toggleWidget, resetWidgets, isVisible };
}

interface DashboardCustomizerProps {
  widgets: DashboardWidget[];
  onToggle: (id: string) => void;
  onReset: () => void;
}

export function DashboardCustomizerButton({ widgets, onToggle, onReset }: DashboardCustomizerProps) {
  const [open, setOpen] = useState(false);
  const hiddenCount = widgets.filter((w) => !w.enabled).length;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="h-8 px-3 rounded-md flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors border border-border relative"
        title="Personalizar Dashboard"
      >
        <Settings2 className="h-3.5 w-3.5" />
        Personalizar
        {hiddenCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
            {hiddenCount}
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Settings2 className="h-4 w-4 text-primary" />
              Personalizar Dashboard
            </DialogTitle>
          </DialogHeader>

          <p className="text-xs text-muted-foreground -mt-1">
            Ative ou desative módulos para montar seu dashboard ideal.
          </p>

          <div className="space-y-1 max-h-[50vh] overflow-y-auto pr-1">
            {widgets.map((w) => (
              <div
                key={w.id}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg border transition-colors ${
                  w.enabled ? "border-border/50 bg-muted/20" : "border-border/20 bg-muted/5 opacity-60"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40" />
                  {w.enabled ? (
                    <Eye className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5 text-muted-foreground/40" />
                  )}
                  <span className="text-sm font-medium">{w.label}</span>
                </div>
                <Switch checked={w.enabled} onCheckedChange={() => onToggle(w.id)} />
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border">
            <button
              onClick={onReset}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Restaurar padrão
            </button>
            <button
              onClick={() => setOpen(false)}
              className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Feito
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
