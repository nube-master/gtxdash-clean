import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Skull, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import type { PacingCampaign } from "./mockData";
import type { GtxOverlay } from "./CampaignTable";
import { useOfferTags } from "@/hooks/useOfferTags";
import { regionOfCampaign, killReason, renameTopToXxx, type KillRegion } from "@/lib/killSquad";

interface Props {
  open: boolean;
  onClose: () => void;
  campaigns: PacingCampaign[];
  gtxByName?: Map<string, GtxOverlay>;
}

interface Candidate {
  campaign: PacingCampaign;
  region: KillRegion;
  spend3d: number;
  sales3d: number;
  cpa3d: number;
  reason: string;
  newName: string;
}

const MAX_BATCH = 100;
const CONFIRM_WORD = "MATAR";

export function KillSquadDialog({ open, onClose, campaigns, gtxByName }: Props) {
  const qc = useQueryClient();
  const { data: offerTags = [] } = useOfferTags();
  const [running, setRunning] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number; failed: number }>({
    done: 0,
    total: 0,
    failed: 0,
  });

  useEffect(() => {
    if (open) {
      setConfirm("");
      setProgress({ done: 0, total: 0, failed: 0 });
    }
  }, [open]);

  // Filtra só as REALMENTE candidatas (revalida no cliente antes de enviar)
  const candidates: Candidate[] = campaigns
    .map((c) => {
      const region = regionOfCampaign(c.name, offerTags);
      if (!region) return null;
      const g = gtxByName?.get(c.name);
      const spend3d = g?.spend3DTotal ?? 0;
      const sales3d = g?.sales3DCount ?? 0;
      const cpa3d = g?.cpa3D ?? 0;
      const status = c.status;
      const reason = killReason({
        region, spend3d, sales3d, cpa3d,
        campaignName: c.name,
        status,
      });
      if (!reason) return null;
      return {
        campaign: c,
        region, spend3d, sales3d, cpa3d, reason,
        newName: renameTopToXxx(c.name),
      };
    })
    .filter(Boolean) as Candidate[];

  const skipped = campaigns.length - candidates.length;
  const totalSpend = candidates.reduce((s, c) => s + c.spend3d, 0);
  const capped = candidates.slice(0, MAX_BATCH);
  const overCap = candidates.length > MAX_BATCH;
  const canRun = confirm.trim().toUpperCase() === CONFIRM_WORD && capped.length > 0 && !running;

  const run = async () => {
    if (capped.length === 0) {
      toast.error("Nenhuma candidata válida.");
      return;
    }
    setRunning(true);
    setProgress({ done: 0, total: capped.length, failed: 0 });

    try {
      const { data, error } = await supabase.functions.invoke("kill-squad-batch", {
        body: {
          items: capped.map((c) => ({
            campaign_id: c.campaign.id,
            account_id: c.campaign.accountId,
            campaign_name: c.campaign.name,
            region: c.region,
            spend3d: c.spend3d,
            sales3d: c.sales3d,
            cpa3d: c.cpa3d,
            reason: c.reason,
          })),
        },
      });

      if (error) {
        toast.error("Falha no batch", { description: error.message });
        setRunning(false);
        return;
      }
      if (data?.error) {
        toast.error("Batch bloqueado", { description: String(data.error) });
        setRunning(false);
        return;
      }

      const killed = Number(data?.killed ?? 0);
      const failed = Number(data?.failed ?? 0);
      setProgress({ done: capped.length, total: capped.length, failed });

      // Atualiza cache local: campanhas viraram pausadas
      qc.setQueriesData<any[]>({ queryKey: ["live-pacing-campaigns"] }, (old) =>
        (old ?? []).map((row) => {
          const hit = capped.find((c) => c.campaign.id === row.id);
          return hit ? { ...row, status: "paused", name: hit.newName } : row;
        }),
      );
      qc.invalidateQueries({ queryKey: ["live-pacing-campaigns"] });
      qc.invalidateQueries({ queryKey: ["pacing-action-log"] });

      if (failed === 0) {
        toast.success(`🔪 ${killed} campanha(s) mortas e renomeadas [top]→[xxx]`);
        onClose();
      } else {
        toast.warning(`Concluído: ${killed}/${capped.length} ok · ${failed} falha(s) — ver /pacing/historico`);
      }
    } catch (e: any) {
      toast.error("Erro inesperado", { description: e?.message ?? String(e) });
    } finally {
      setRunning(false);
    }
  };

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !running && onClose()}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-xl p-0 overflow-hidden border-destructive/40 bg-gradient-to-b from-card to-background">
        <div className="px-6 pt-5 pb-4 border-b border-border/60 bg-gradient-to-r from-destructive/15 via-destructive/5 to-transparent">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-base flex items-center gap-2">
              <span className="inline-flex size-7 items-center justify-center rounded-md bg-destructive/20 text-destructive">
                <Skull className="size-3.5" />
              </span>
              Kill Squad — matar em lote
            </DialogTitle>
            <DialogDescription className="text-[11px] tabular-nums">
              <b className="text-foreground">{campaigns.length}</b> selecionada(s) ·{" "}
              <b className="text-destructive">{candidates.length}</b> candidata(s) ·{" "}
              <b className="text-muted-foreground">{skipped}</b> não elegível(is) (fora dos critérios/região)
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Lista */}
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-destructive/20 bg-destructive/10">
              <span className="text-[10px] uppercase tracking-wider text-destructive font-semibold">
                Serão RENOMEADAS [top]→[xxx] + PAUSADAS
              </span>
              <span className="text-[10px] tabular-nums text-destructive">
                {capped.length}{overCap ? ` / ${candidates.length} (cap ${MAX_BATCH})` : ""}
              </span>
            </div>
            <div className="max-h-64 overflow-y-auto">
              <ul className="divide-y divide-border/30">
                {capped.map((c) => (
                  <li key={c.campaign.id} className="px-3 py-2 hover:bg-destructive/5">
                    <div className="flex items-start gap-2">
                      <span className="text-xs shrink-0 mt-0.5">
                        {c.region === "eu" ? "🇪🇺" : "🇺🇸"}
                      </span>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="text-[11px] truncate font-mono" title={c.campaign.name}>
                          {c.campaign.name}
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          → <span className="text-destructive font-mono">{c.newName}</span>
                        </div>
                        <div className="text-[10px] text-destructive/80">
                          {c.reason} · spend 3d R$ {c.spend3d.toFixed(0)} · {c.sales3d} venda(s)
                          {c.sales3d > 0 && ` · CPA R$ ${c.cpa3d.toFixed(0)}`}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
                {capped.length === 0 && (
                  <li className="px-3 py-6 text-center text-[11px] text-muted-foreground">
                    Nenhuma candidata elegível na seleção.
                  </li>
                )}
              </ul>
            </div>
            <div className="px-3 py-1.5 border-t border-destructive/20 bg-destructive/10 flex items-center justify-between text-[10px] tabular-nums text-destructive">
              <span>Spend 3d total (perda enterrada)</span>
              <span className="font-bold">R$ {totalSpend.toFixed(0)}</span>
            </div>
          </div>

          {overCap && (
            <div className="text-[11px] rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-600 flex items-start gap-2">
              <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
              <span>
                Você selecionou {candidates.length} — só as primeiras {MAX_BATCH} vão nesse batch.
                Rode de novo pro restante.
              </span>
            </div>
          )}

          {/* Info */}
          <div className="text-[11px] leading-relaxed rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-destructive/90 space-y-1">
            <div><b>Efeito irreversível</b> no Meta (rename + pause).</div>
            <div>Cooldown sticky é aplicado — regras automáticas <b>não vão religar</b> depois.</div>
            <div>Pra reverter: renomeia manual no Meta [xxx]→[top] + religa.</div>
          </div>

          {/* Confirm */}
          {capped.length > 0 && !running && (
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Digite <b className="text-destructive">{CONFIRM_WORD}</b> pra liberar o botão
              </label>
              <Input
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={CONFIRM_WORD}
                className="h-8 text-xs font-mono uppercase"
                autoFocus
              />
            </div>
          )}

          {/* Progresso */}
          {running && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] tabular-nums">
                <span className="text-muted-foreground">
                  Processando <b className="text-foreground">{progress.done}</b>/{progress.total}
                  {progress.failed > 0 && (
                    <span className="ml-1 text-destructive">· {progress.failed} falha(s)</span>
                  )}
                </span>
                <span className="text-muted-foreground">{pct}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-destructive transition-all duration-300"
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
            disabled={!canRun}
            className={cn(
              "gap-1.5 min-w-[160px] bg-destructive hover:bg-destructive/90 text-destructive-foreground shadow-sm shadow-destructive/30",
            )}
          >
            {running ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Skull className="size-3.5" />
            )}
            Matar {capped.length} → [xxx]
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
