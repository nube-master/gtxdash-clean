import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, DollarSign, TrendingUp, TrendingDown, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import type { PacingCampaign } from "./mockData";

interface Props {
  open: boolean;
  onClose: () => void;
  campaigns: PacingCampaign[];
}

type Mode = "abs" | "pct";
type PctDir = "up" | "down";

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

export function BulkBudgetDialog({ open, onClose, campaigns }: Props) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>("abs");
  const [absInput, setAbsInput] = useState("");
  const [pctInput, setPctInput] = useState("");
  const [pctDir, setPctDir] = useState<PctDir>("up");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; failed: number }>({
    done: 0,
    total: 0,
    failed: 0,
  });

  useEffect(() => {
    if (open) {
      setAbsInput("");
      setPctInput("");
      setMode("abs");
      setPctDir("up");
      setProgress({ done: 0, total: 0, failed: 0 });
    }
  }, [open]);

  const withBudget = campaigns.filter((c) => (c.dailyBudget ?? 0) > 0);
  const abo = campaigns.length - withBudget.length;

  const computeNew = (current: number | null | undefined): number | null => {
    if (mode === "abs") {
      const v = parseFloat(absInput.replace(",", "."));
      return isFinite(v) && v > 0 ? Number(v.toFixed(2)) : null;
    }
    const p = parseFloat(pctInput.replace(",", "."));
    if (!isFinite(p) || p <= 0 || !current || current <= 0) return null;
    const factor = pctDir === "up" ? 1 + p / 100 : 1 - p / 100;
    const v = current * factor;
    return v > 0 ? Number(v.toFixed(2)) : null;
  };

  const run = async () => {
    if (withBudget.length === 0) {
      toast.error("Nenhuma campanha CBO selecionada (todas são ABO).");
      return;
    }
    if (mode === "abs" && !parseFloat(absInput.replace(",", "."))) {
      toast.error("Informe um valor maior que zero");
      return;
    }
    if (mode === "pct" && !parseFloat(pctInput.replace(",", "."))) {
      toast.error("Informe um percentual maior que zero");
      return;
    }

    setRunning(true);
    setProgress({ done: 0, total: withBudget.length, failed: 0 });
    let failed = 0;
    let done = 0;

    for (const c of withBudget) {
      const next = computeNew(c.dailyBudget);
      if (!next) {
        failed++;
        done++;
        setProgress({ done, total: withBudget.length, failed });
        continue;
      }
      try {
        const { data, error } = await supabase.functions.invoke("pacing-update-campaign", {
          body: {
            campaign_id: c.id,
            account_id: c.accountId,
            campaign_name: c.name,
            daily_budget_brl: next,
            operation_id: (c as any).operation_id || undefined,
          },
        });
        if (error || data?.error) failed++;
        else {
          qc.setQueriesData<any[]>({ queryKey: ["live-pacing-campaigns"] }, (old) =>
            (old ?? []).map((row) => (row.id === c.id ? { ...row, dailyBudget: next } : row))
          );
        }
      } catch {
        failed++;
      }
      done++;
      setProgress({ done, total: withBudget.length, failed });
    }

    setRunning(false);
    qc.invalidateQueries({ queryKey: ["live-pacing-campaigns"] });
    if (failed === 0) {
      toast.success(`Orçamento atualizado em ${done} campanha(s)`);
      onClose();
    } else {
      toast.warning(`Concluído: ${done - failed}/${done} ok · ${failed} falha(s)`);
    }
  };

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !running && onClose()}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-lg p-0 overflow-hidden border-border/60 bg-gradient-to-b from-card to-background">
        {/* Header em faixa azul (mesma linguagem do BulkToggleDialog) */}
        <div className="px-6 pt-5 pb-4 border-b border-border/60 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-base flex items-center gap-2">
              <span className="inline-flex size-7 items-center justify-center rounded-md bg-primary/15 text-primary">
                <DollarSign className="size-3.5" />
              </span>
              Alterar orçamento (CBO) em lote
            </DialogTitle>
            <DialogDescription className="text-[11px] tabular-nums">
              <b className="text-foreground">{withBudget.length}</b> CBO ·{" "}
              <b className="text-foreground">{abo}</b> ABO (ignoradas) ·{" "}
              <b className="text-foreground">{campaigns.length}</b> selecionada(s)
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Segmented Modo */}
          <div className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-muted/40 border border-border/60">
            <button
              type="button"
              onClick={() => setMode("abs")}
              disabled={running}
              className={cn(
                "flex items-center justify-center gap-1.5 h-9 rounded-md text-xs font-medium transition-all",
                mode === "abs"
                  ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/60"
              )}
            >
              Valor fixo
            </button>
            <button
              type="button"
              onClick={() => setMode("pct")}
              disabled={running}
              className={cn(
                "flex items-center justify-center gap-1.5 h-9 rounded-md text-xs font-medium transition-all",
                mode === "pct"
                  ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/60"
              )}
            >
              Percentual
            </button>
          </div>

          {/* Input */}
          {mode === "abs" ? (
            <div className="space-y-1.5">
              <Label className="text-xs">Novo orçamento diário (R$) — mesmo valor para todas</Label>
              <Input
                type="number"
                min={0}
                step={50}
                placeholder="ex: 250"
                value={absInput}
                onChange={(e) => setAbsInput(e.target.value)}
                className="tabular-nums"
                autoFocus
                disabled={running}
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-xs">Variação (%)</Label>
              <div className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-muted/40 border border-border/60 mb-2">
                <button
                  type="button"
                  onClick={() => setPctDir("up")}
                  disabled={running}
                  className={cn(
                    "flex items-center justify-center gap-1.5 h-9 rounded-md text-xs font-medium transition-all",
                    pctDir === "up"
                      ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/30"
                      : "text-muted-foreground hover:text-foreground hover:bg-background/60"
                  )}
                >
                  <TrendingUp className="size-3.5" /> Aumentar
                </button>
                <button
                  type="button"
                  onClick={() => setPctDir("down")}
                  disabled={running}
                  className={cn(
                    "flex items-center justify-center gap-1.5 h-9 rounded-md text-xs font-medium transition-all",
                    pctDir === "down"
                      ? "bg-red text-red-foreground shadow-sm shadow-destructive/30"
                      : "text-muted-foreground hover:text-foreground hover:bg-background/60"
                  )}
                >
                  <TrendingDown className="size-3.5" /> Reduzir
                </button>
              </div>
              <Input
                type="number"
                min={0}
                step={5}
                placeholder="ex: 20"
                value={pctInput}
                onChange={(e) => setPctInput(e.target.value)}
                className="tabular-nums"
                autoFocus
                disabled={running}
              />
            </div>
          )}

          {/* Lista de alvos com pré-visualização */}
          <div className="rounded-lg border border-border/60 bg-muted/20 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/60 bg-muted/30">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Campanhas que terão orçamento alterado
              </span>
              <span className="text-[10px] tabular-nums text-muted-foreground">{withBudget.length}</span>
            </div>
            <div className="max-h-56 overflow-y-auto overflow-x-hidden">
              <ul className="divide-y divide-border/30">
                {withBudget.slice(0, 50).map((c) => {
                  const brackets = Array.from(c.name?.matchAll(/\[([^\]]+)\]/g) ?? []).map((m) => m[1]);
                  const tail = c.name.replace(/^(\s*\[[^\]]+\])+\s*-?\s*/, "").trim();
                  const next = computeNew(c.dailyBudget);
                  return (
                    <li key={c.id} className="flex min-w-0 w-full items-start gap-2 px-3 py-2 hover:bg-muted/30">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap gap-1">
                          {brackets.slice(0, 6).map((b, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-mono font-medium bg-primary/10 text-primary/90 border border-primary/20"
                            >
                              {b}
                            </span>
                          ))}
                          {brackets.length > 6 && (
                            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] text-muted-foreground">
                              +{brackets.length - 6}
                            </span>
                          )}
                        </div>
                        {tail && (
                          <div className="text-[10px] text-muted-foreground/80 truncate">{tail}</div>
                        )}
                        <div className="text-[10px] tabular-nums text-muted-foreground">
                          {fmtBRL(c.dailyBudget ?? 0)} →{" "}
                          <b className="text-foreground">{next != null ? fmtBRL(next) : "—"}</b>
                        </div>
                      </div>
                      <span className="shrink-0 text-[10px] text-muted-foreground/70 tabular-nums pt-0.5">
                        {c.account}
                      </span>
                    </li>
                  );
                })}
                {withBudget.length === 0 && (
                  <li className="px-3 py-4 text-center text-[11px] text-muted-foreground">
                    Nenhuma CBO selecionada.
                  </li>
                )}
                {withBudget.length > 50 && (
                  <li className="px-3 py-1.5 text-[10px] text-muted-foreground/70 text-center">
                    … +{withBudget.length - 50} mais
                  </li>
                )}
              </ul>
            </div>
          </div>

          {/* Info contextual */}
          <div className="text-[11px] leading-relaxed rounded-md border border-primary/20 bg-primary/5 text-foreground/80 px-3 py-2">
            Só campanhas CBO recebem alteração. ABO (com orçamento em adset) são ignoradas.
          </div>

          {/* Progresso */}
          {running && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] tabular-nums">
                <span className="text-muted-foreground">
                  Processando <b className="text-foreground">{progress.done}</b>/{progress.total}
                  {progress.failed > 0 && (
                    <span className="ml-1 text-red">· {progress.failed} falha(s)</span>
                  )}
                </span>
                <span className="text-muted-foreground">{pct}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border/60 bg-muted/20 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={running}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={run}
            disabled={running || withBudget.length === 0}
            className="gap-1.5 min-w-[140px] bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm shadow-primary/30"
          >
            {running ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="size-3.5" />
            )}
            Aplicar a {withBudget.length}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
