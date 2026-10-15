import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Pause, Play, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import type { PacingCampaign } from "./mockData";
import { PauseModeSelector, loadDefaultPauseMode, type PauseModeValue } from "./PauseModeSelector";

interface Props {
  open: boolean;
  onClose: () => void;
  campaigns: PacingCampaign[];
}

type Action = "ACTIVE" | "PAUSED";

export function BulkToggleDialog({ open, onClose, campaigns }: Props) {
  const qc = useQueryClient();
  const [action, setAction] = useState<Action>("PAUSED");
  const [pauseMode, setPauseMode] = useState<PauseModeValue>(() => loadDefaultPauseMode());
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; failed: number }>({
    done: 0,
    total: 0,
    failed: 0,
  });

  useEffect(() => {
    if (open) {
      setProgress({ done: 0, total: 0, failed: 0 });
      setPauseMode(loadDefaultPauseMode());
    }
  }, [open]);

  const targets = campaigns.filter((c) =>
    action === "PAUSED" ? c.status !== "paused" : c.status === "paused"
  );
  const skipped = campaigns.length - targets.length;

  const run = async () => {
    if (targets.length === 0) {
      toast.error(
        action === "PAUSED"
          ? "Todas as selecionadas já estão pausadas."
          : "Todas as selecionadas já estão ativas."
      );
      return;
    }
    setRunning(true);
    setProgress({ done: 0, total: targets.length, failed: 0 });
    let done = 0;
    let failed = 0;
    let firstError = "";
    for (const c of targets) {
      // Skip órfãs: id sintético "orphan:..." não existe no Meta e quebra o Graph
      // ("Unknown path components"). Contam como falha pra o usuário ver.
      if (c.id.startsWith("orphan:") || !/^\d+$/.test(c.id)) {
        failed++;
        done++;
        setProgress({ done, total: targets.length, failed });
        continue;
      }
      try {
        const isPause = action === "PAUSED";
        const wakeUp = isPause && pauseMode.mode === "wake_up"
          ? ` (até ${String(pauseMode.hourBrt).padStart(2, "0")}:${String(pauseMode.minuteBrt).padStart(2, "0")} BRT)`
          : "";
        const { data, error } = await supabase.functions.invoke("pacing-toggle-campaign", {
          body: {
            campaign_id: c.id,
            account_id: c.accountId,
            campaign_name: c.name,
            new_status: action,
            pause_mode: isPause ? pauseMode.mode : undefined,
            wake_up_hour_brt: isPause && pauseMode.mode === "wake_up" ? pauseMode.hourBrt : undefined,
            wake_up_minute_brt: isPause && pauseMode.mode === "wake_up" ? pauseMode.minuteBrt : undefined,
            reason: `Manual ${action} em lote via UI${wakeUp} — ${c.name}`,
            operation_id: (c as any).operation_id || undefined,
          },
        });
        if (error || data?.error || data?.success === false) {
          failed++;
          const msg = String(error?.message || data?.error || "falha desconhecida");
          if (!firstError) firstError = `${c.name}: ${msg}`;
        } else {
          qc.setQueriesData<any[]>({ queryKey: ["live-pacing-campaigns"] }, (old) =>
            (old ?? []).map((row) =>
              row.id === c.id ? { ...row, status: action === "PAUSED" ? "paused" : "ok" } : row
            )
          );
        }
      } catch {
        failed++;
      }
      done++;
      setProgress({ done, total: targets.length, failed });
    }
    setRunning(false);
    qc.invalidateQueries({ queryKey: ["live-pacing-campaigns"] });
    qc.invalidateQueries({ queryKey: ["pacing-action-log"] });
    if (failed === 0) {
      toast.success(
        action === "PAUSED"
          ? `${done} campanha(s) pausada(s)`
          : `${done} campanha(s) religada(s)`
      );
      onClose();
    } else {
      toast.warning(
        `Concluído: ${done - failed}/${done} ok · ${failed} falha(s)`,
        firstError ? { description: firstError } : undefined,
      );
    }
  };

  const isPause = action === "PAUSED";
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !running && onClose()}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-lg p-0 overflow-hidden border-border/60 bg-gradient-to-b from-card to-background">
        {/* Header com faixa de cor conforme ação */}
        <div
          className={cn(
            "px-6 pt-5 pb-4 border-b border-border/60 transition-colors",
            isPause
              ? "bg-gradient-to-r from-destructive/10 via-destructive/5 to-transparent"
              : "bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent"
          )}
        >
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-base flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex size-7 items-center justify-center rounded-md",
                  isPause
                    ? "bg-red/15 text-red"
                    : "bg-emerald-500/15 text-success"
                )}
              >
                {isPause ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
              </span>
              Ativar / Pausar em lote
            </DialogTitle>
            <DialogDescription className="text-[11px] tabular-nums">
              <b className="text-foreground">{campaigns.length}</b> selecionada(s) ·{" "}
              <b className="text-foreground">{targets.length}</b> alvo(s) ·{" "}
              <b className="text-foreground">{skipped}</b> já no estado desejado
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Segmented control custom — sempre visível, com destaque bom em ambos os estados */}
          <div className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-muted/40 border border-border/60">
            <button
              type="button"
              onClick={() => setAction("PAUSED")}
              disabled={running}
              className={cn(
                "flex items-center justify-center gap-1.5 h-9 rounded-md text-xs font-medium transition-all",
                isPause
                  ? "bg-red text-red-foreground shadow-sm shadow-destructive/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/60"
              )}
            >
              <Pause className="size-3.5" /> Pausar
            </button>
            <button
              type="button"
              onClick={() => setAction("ACTIVE")}
              disabled={running}
              className={cn(
                "flex items-center justify-center gap-1.5 h-9 rounded-md text-xs font-medium transition-all",
                !isPause
                  ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/60"
              )}
            >
              <Play className="size-3.5" /> Religar
            </button>
          </div>

          {/* Modalidade de pausa — só quando ação = PAUSED */}
          {isPause && (
            <PauseModeSelector value={pauseMode} onChange={setPauseMode} disabled={running} />
          )}

          <div className="rounded-lg border border-border/60 bg-muted/20 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/60 bg-muted/30">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Campanhas que serão {isPause ? "pausadas" : "religadas"}
              </span>
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {targets.length}
              </span>
            </div>
            <div className="max-h-56 overflow-y-auto overflow-x-hidden">
              <ul className="divide-y divide-border/30">
                {targets.slice(0, 50).map((c) => {
                  const brackets = Array.from(c.name?.matchAll(/\[([^\]]+)\]/g) ?? []).map((m) => m[1]);
                  const tail = c.name.replace(/^(\s*\[[^\]]+\])+\s*-?\s*/, "").trim();
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
                      </div>
                      <span className="shrink-0 text-[10px] text-muted-foreground/70 tabular-nums pt-0.5">
                        {c.account}
                      </span>
                    </li>
                  );
                })}
                {targets.length === 0 && (
                  <li className="px-3 py-4 text-center text-[11px] text-muted-foreground">
                    Nenhuma campanha precisa mudar de estado.
                  </li>
                )}
                {targets.length > 50 && (
                  <li className="px-3 py-1.5 text-[10px] text-muted-foreground/70 text-center">
                    … +{targets.length - 50} mais
                  </li>
                )}
              </ul>
            </div>

          </div>

          {/* Info contextual */}
          <div
            className={cn(
              "text-[11px] leading-relaxed rounded-md border px-3 py-2",
              isPause
                ? "border-red/20 bg-red/5 text-red-foreground/80"
                : "border-emerald-500/20 bg-emerald-500/5 text-emerald-100/80"
            )}
          >
            {isPause
              ? pauseMode.mode === "wake_up"
                ? `Pausa até ${String(pauseMode.hourBrt).padStart(2, "0")}:${String(pauseMode.minuteBrt).padStart(2, "0")} BRT: cooldown auto-expira; 📌 ATIVAR | TOP religa se a campanha teve spend > 0 ontem.`
                : "Pausa manual sticky: bloqueia qualquer regra automática até você religar manualmente."
              : "Religa manualmente e limpa cooldowns; regras voltam a poder pausar normalmente."}
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
                  className={cn(
                    "h-full transition-all duration-300",
                    isPause ? "bg-red" : "bg-emerald-500"
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border/60 bg-muted/20 gap-2 sm:gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={running}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={run}
            disabled={running || targets.length === 0}
            className={cn(
              "gap-1.5 min-w-[140px]",
              isPause
                ? "bg-red hover:bg-red/90 text-red-foreground shadow-sm shadow-destructive/30"
                : "bg-emerald-500 hover:bg-emerald-500/90 text-white shadow-sm shadow-emerald-500/30"
            )}
          >
            {running ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : isPause ? (
              <Pause className="size-3.5" />
            ) : (
              <CheckCircle2 className="size-3.5" />
            )}
            {isPause ? "Pausar" : "Religar"} {targets.length}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
