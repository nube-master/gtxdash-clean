import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Trash2, ShieldCheck } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  campaignId: string;
  campaignName: string;
  accountId?: string;
  currentTarget?: number | null;
  currentSource?: "override" | "cbo" | "rule" | null;
}

interface ExistingRow {
  id: string;
  daily_target_brl: number | null;
  notes: string | null;
  rules_exempt: boolean | null;
  hourly_cap_brl_override: number | null;
  exempt_until: string | null;
}

function formatDateTimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function addHoursIso(h: number): string {
  return formatDateTimeLocal(new Date(Date.now() + h * 3600_000).toISOString());
}

export function CampaignTargetOverrideDialog({
  open, onClose, campaignId, campaignName, accountId, currentTarget, currentSource,
}: Props) {
  const qc = useQueryClient();
  const [value, setValue] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [existing, setExisting] = useState<ExistingRow | null>(null);
  const [loading, setLoading] = useState(false);

  // Exceção de regras
  const [rulesExempt, setRulesExempt] = useState(false);
  const [hourlyCap, setHourlyCap] = useState<string>("");
  const [exemptUntil, setExemptUntil] = useState<string>(""); // datetime-local; "" = sem expiração

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase
      .from("campaign_pacing_overrides")
      .select("id, daily_target_brl, notes, rules_exempt, hourly_cap_brl_override, exempt_until")
      .eq("campaign_id", campaignId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const row = data as ExistingRow;
          setExisting(row);
          setValue(row.daily_target_brl != null ? String(row.daily_target_brl) : "");
          setNotes(row.notes ?? "");
          setRulesExempt(Boolean(row.rules_exempt));
          setHourlyCap(row.hourly_cap_brl_override != null ? String(row.hourly_cap_brl_override) : "");
          setExemptUntil(formatDateTimeLocal(row.exempt_until));
        } else {
          setExisting(null);
          setValue(currentSource === "cbo" && currentTarget ? String(currentTarget) : "");
          setNotes("");
          setRulesExempt(false);
          setHourlyCap("");
          setExemptUntil("");
        }
        setLoading(false);
      });
  }, [open, campaignId, currentTarget, currentSource]);

  const save = async () => {
    const targetNum = value.trim() === "" ? null : Number(value);
    if (value.trim() !== "" && (!targetNum || targetNum <= 0)) {
      toast.error("Teto diário inválido");
      return;
    }
    const hourlyNum = hourlyCap.trim() === "" ? null : Number(hourlyCap);
    if (hourlyCap.trim() !== "" && (!hourlyNum || hourlyNum <= 0)) {
      toast.error("Teto/hora customizado inválido");
      return;
    }
    if (targetNum == null && !rulesExempt && hourlyNum == null) {
      toast.error("Defina ao menos: teto diário OU exceção OU teto/hora");
      return;
    }
    const exemptUntilIso = exemptUntil.trim() === "" ? null : new Date(exemptUntil).toISOString();

    setSaving(true);
    const { error } = await supabase
      .from("campaign_pacing_overrides")
      .upsert(
        {
          campaign_id: campaignId,
          account_id: accountId ?? null,
          daily_target_brl: targetNum,
          notes: notes || null,
          rules_exempt: rulesExempt,
          hourly_cap_brl_override: hourlyNum,
          exempt_until: exemptUntilIso,
        },
        { onConflict: "campaign_id" },
      );
    setSaving(false);
    if (error) {
      toast.error(`Falha ao salvar: ${error.message}`);
      return;
    }
    toast.success(rulesExempt ? "Exceção ativada — campanha fora das regras" : "Configuração salva");
    qc.invalidateQueries({ queryKey: ["live-pacing-campaigns"] });
    onClose();
  };

  const remove = async () => {
    if (!existing) return;
    setSaving(true);
    const { error } = await supabase
      .from("campaign_pacing_overrides")
      .delete()
      .eq("id", existing.id);
    setSaving(false);
    if (error) {
      toast.error(`Falha ao remover: ${error.message}`);
      return;
    }
    toast.success("Override removido — volta a seguir regras automáticas");
    qc.invalidateQueries({ queryKey: ["live-pacing-campaigns"] });
    onClose();
  };

  const disableExemption = () => {
    setRulesExempt(false);
    setHourlyCap("");
    setExemptUntil("");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Teto & Exceção da Campanha</DialogTitle>
          <DialogDescription className="text-xs leading-relaxed break-all">
            {campaignName}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {currentSource && (
              <div className="rounded border border-border/60 bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
                Atual: <b className="text-foreground">R$ {(currentTarget ?? 0).toLocaleString("pt-BR")}</b>
                {" · origem: "}
                <span className="uppercase tracking-wider">
                  {currentSource === "override" ? "override manual" : currentSource === "cbo" ? "CBO do Meta" : "padrão da regra"}
                </span>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-xs">Teto diário alvo (R$) — opcional</Label>
              <Input
                type="number"
                min={0}
                step={50}
                placeholder="ex: 2500"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="tabular-nums"
              />
              <p className="text-[11px] text-muted-foreground">
                Sobrescreve CBO/regra para Linear Pacing, Daily Cap e dashboard.
              </p>
            </div>

            {/* ─── Exceção de regras ─── */}
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold">
                    <ShieldCheck className="size-3.5 text-amber-500" />
                    Isentar das regras automáticas
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                    Pacing-controller ignora essa campanha. Útil pra deixar uma "queridinha" gastar além do teto/hora sem mexer na regra global.
                  </p>
                </div>
                <Switch checked={rulesExempt} onCheckedChange={setRulesExempt} />
              </div>

              {rulesExempt && (
                <div className="space-y-3 pt-1 border-t border-amber-500/20">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Teto/hora customizado (R$) — opcional</Label>
                    <Input
                      type="number"
                      min={0}
                      step={50}
                      placeholder="ex: 600 (substitui só pra essa campanha)"
                      value={hourlyCap}
                      onChange={(e) => setHourlyCap(e.target.value)}
                      className="tabular-nums"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Em branco = sem teto/hora (gasta livre). Preenchido = só essa campanha usa esse limite, regra global continua nas outras.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Expira em — opcional</Label>
                    <Input
                      type="datetime-local"
                      value={exemptUntil}
                      onChange={(e) => setExemptUntil(e.target.value)}
                      className="tabular-nums"
                    />
                    <div className="flex gap-1.5 flex-wrap">
                      {[1, 6, 12, 24].map((h) => (
                        <Button
                          key={h}
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-6 text-[10px] px-2"
                          onClick={() => setExemptUntil(addHoursIso(h))}
                        >
                          +{h}h
                        </Button>
                      ))}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-6 text-[10px] px-2"
                        onClick={() => setExemptUntil("")}
                      >
                        Sem expiração
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Quando expira, campanha volta automaticamente a seguir as regras.
                    </p>
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-[11px] text-muted-foreground"
                    onClick={disableExemption}
                  >
                    Desativar exceção
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Notas (opcional)</Label>
              <Textarea
                rows={2}
                placeholder="ex: deixar gastar — campanha vencedora do dia"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="text-xs"
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {existing && (
            <Button
              variant="ghost"
              size="sm"
              onClick={remove}
              disabled={saving}
              className="mr-auto text-destructive hover:text-destructive"
            >
              <Trash2 className="size-3.5 mr-1" /> Remover tudo
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button size="sm" onClick={save} disabled={saving || loading}>
            {saving ? <Loader2 className="size-3.5 animate-spin mr-1" /> : null}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
