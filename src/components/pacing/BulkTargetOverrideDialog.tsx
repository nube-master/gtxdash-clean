import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Trash2, Target, CheckCircle2 } from "lucide-react";
import type { PacingCampaign } from "./mockData";

interface Props {
  open: boolean;
  onClose: () => void;
  campaigns: PacingCampaign[];
}

export function BulkTargetOverrideDialog({ open, onClose, campaigns }: Props) {
  const qc = useQueryClient();
  const [value, setValue] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setValue("");
      setNotes("");
    }
  }, [open]);

  const save = async () => {
    const num = Number(value);
    if (!num || num <= 0) {
      toast.error("Informe um valor maior que zero");
      return;
    }
    setSaving(true);
    const rows = campaigns.map((c) => ({
      campaign_id: c.id,
      account_id: c.accountId ?? null,
      daily_target_brl: num,
      notes: notes || null,
    }));
    const { error } = await supabase
      .from("campaign_pacing_overrides")
      .upsert(rows, { onConflict: "campaign_id" });
    setSaving(false);
    if (error) {
      toast.error(`Falha ao salvar: ${error.message}`);
      return;
    }
    toast.success(`Teto diário aplicado em ${rows.length} campanha(s)`);
    qc.invalidateQueries({ queryKey: ["live-pacing-campaigns"] });
    onClose();
  };

  const removeAll = async () => {
    setSaving(true);
    const ids = campaigns.map((c) => c.id);
    const { error } = await supabase
      .from("campaign_pacing_overrides")
      .delete()
      .in("campaign_id", ids);
    setSaving(false);
    if (error) {
      toast.error(`Falha ao remover: ${error.message}`);
      return;
    }
    toast.success(`Overrides removidos (${ids.length})`);
    qc.invalidateQueries({ queryKey: ["live-pacing-campaigns"] });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-lg p-0 overflow-hidden border-border/60 bg-gradient-to-b from-card to-background">
        {/* Header em faixa âmbar */}
        <div className="px-6 pt-5 pb-4 border-b border-border/60 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-base flex items-center gap-2">
              <span className="inline-flex size-7 items-center justify-center rounded-md bg-amber-500/15 text-amber-500">
                <Target className="size-3.5" />
              </span>
              Teto diário em lote
            </DialogTitle>
            <DialogDescription className="text-[11px] tabular-nums">
              Aplicar o mesmo teto diário a{" "}
              <b className="text-foreground">{campaigns.length}</b> campanha(s) selecionada(s).
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Input principal */}
          <div className="space-y-1.5">
            <Label className="text-xs">Teto diário alvo (R$) — aplicado a todas</Label>
            <Input
              type="number"
              min={0}
              step={50}
              placeholder="ex: 2500"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="tabular-nums"
              autoFocus
              disabled={saving}
            />
          </div>

          {/* Notas */}
          <div className="space-y-1.5">
            <Label className="text-xs">Notas (opcional)</Label>
            <Textarea
              rows={2}
              placeholder="ex: ABO baiano · escala 23/06"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="text-xs"
              disabled={saving}
            />
          </div>

          {/* Lista de alvos */}
          <div className="rounded-lg border border-border/60 bg-muted/20 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/60 bg-muted/30">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Campanhas que receberão o teto
              </span>
              <span className="text-[10px] tabular-nums text-muted-foreground">{campaigns.length}</span>
            </div>
            <div className="max-h-56 overflow-y-auto overflow-x-hidden">
              <ul className="divide-y divide-border/30">
                {campaigns.slice(0, 50).map((c) => {
                  const brackets = Array.from(c.name?.matchAll(/\[([^\]]+)\]/g) ?? []).map((m) => m[1]);
                  const tail = c.name.replace(/^(\s*\[[^\]]+\])+\s*-?\s*/, "").trim();
                  return (
                    <li key={c.id} className="flex min-w-0 w-full items-start gap-2 px-3 py-2 hover:bg-muted/30">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap gap-1">
                          {brackets.slice(0, 6).map((b, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-mono font-medium bg-amber-500/10 text-amber-500 border border-amber-500/20"
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
                {campaigns.length === 0 && (
                  <li className="px-3 py-4 text-center text-[11px] text-muted-foreground">
                    Nenhuma campanha selecionada.
                  </li>
                )}
                {campaigns.length > 50 && (
                  <li className="px-3 py-1.5 text-[10px] text-muted-foreground/70 text-center">
                    … +{campaigns.length - 50} mais
                  </li>
                )}
              </ul>
            </div>
          </div>

          {/* Info contextual */}
          <div className="text-[11px] leading-relaxed rounded-md border border-amber-500/20 bg-amber-500/5 text-foreground/80 px-3 py-2">
            Sobrescreve qualquer regra ou CBO existente nas campanhas selecionadas.
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border/60 bg-muted/20 flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={removeAll}
            disabled={saving}
            className="mr-auto text-red hover:text-red"
          >
            <Trash2 className="size-3.5 mr-1" /> Remover overrides
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={save}
            disabled={saving || campaigns.length === 0}
            className="gap-1.5 min-w-[140px] bg-amber-500 hover:bg-amber-500/90 text-white shadow-sm shadow-amber-500/30"
          >
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="size-3.5" />
            )}
            Aplicar a {campaigns.length}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
