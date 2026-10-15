import { useEffect, useState } from "react";
import { Pencil, Loader2, ShieldCheck } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface Props {
  campaignId: string;
  accountId?: string;
  currentRuleCap?: number | null;      // teto da regra global (pra referência)
  currentOverride?: number | null;     // teto/hora override atual
  rulesExempt?: boolean;
  exemptUntil?: string | null;
}

function addHoursIso(h: number): string {
  return new Date(Date.now() + h * 3600_000).toISOString();
}

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function HourlyCapEditPopover({
  campaignId, accountId, currentRuleCap, currentOverride, rulesExempt, exemptUntil,
}: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [cap, setCap] = useState<string>("");
  const [exempt, setExempt] = useState<boolean>(false);
  const [until, setUntil] = useState<string>(""); // ISO ou ""
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCap(currentOverride ? String(currentOverride) : "");
    setExempt(Boolean(rulesExempt));
    setUntil(exemptUntil ?? "");
  }, [open, currentOverride, rulesExempt, exemptUntil]);

  const save = async (opts?: { clear?: boolean }) => {
    setSaving(true);
    const payload = opts?.clear
      ? { rules_exempt: false, hourly_cap_brl_override: null, exempt_until: null }
      : {
          rules_exempt: exempt,
          hourly_cap_brl_override: cap.trim() === "" ? null : Number(cap),
          exempt_until: until || null,
        };

    if (!opts?.clear && payload.hourly_cap_brl_override != null && (!isFinite(payload.hourly_cap_brl_override) || payload.hourly_cap_brl_override <= 0)) {
      toast.error("Teto/hora inválido");
      setSaving(false);
      return;
    }

    // upsert preservando daily_target_brl/notes se já existir
    const { data: existing } = await supabase
      .from("campaign_pacing_overrides")
      .select("id, daily_target_brl, notes")
      .eq("campaign_id", campaignId)
      .maybeSingle();

    const { error } = await supabase
      .from("campaign_pacing_overrides")
      .upsert(
        {
          campaign_id: campaignId,
          account_id: accountId ?? null,
          daily_target_brl: existing?.daily_target_brl ?? null,
          notes: existing?.notes ?? null,
          ...payload,
        },
        { onConflict: "campaign_id" },
      );

    setSaving(false);
    if (error) {
      toast.error(`Falha ao salvar: ${error.message}`);
      return;
    }
    toast.success(
      opts?.clear
        ? "Controle manual desativado — campanha volta às regras"
        : exempt
        ? "Controle manual ativo — regras pausadas pra essa campanha"
        : "Teto/hora salvo",
    );
    qc.invalidateQueries({ queryKey: ["live-pacing-campaigns"] });
    setOpen(false);
  };

  const isActive = Boolean(rulesExempt || currentOverride);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              className={`p-0.5 rounded hover:bg-muted/40 transition-opacity ${
                isActive ? "text-amber-500 opacity-100" : "text-muted-foreground/50 opacity-0 group-hover/hourly:opacity-100"
              }`}
              aria-label="Ajustar teto/hora"
            >
              {isActive ? <ShieldCheck className="size-3" /> : <Pencil className="size-3" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" className="max-w-[240px]">
            <p className="text-[11px]">
              {isActive
                ? "Controle manual ativo — clique pra ajustar/desativar"
                : "Ajustar teto/hora desta campanha (controle manual)"}
            </p>
          </TooltipContent>
        </Tooltip>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 p-3 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <div className="text-xs font-semibold flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 text-amber-500" />
            Controle manual de teto/hora
          </div>
          {currentRuleCap != null && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Teto atual da regra global: <b>R$ {currentRuleCap.toLocaleString("pt-BR")}</b>
            </p>
          )}
        </div>

        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs leading-tight">
              Isentar das regras automáticas
              <p className="text-[10px] text-muted-foreground font-normal mt-0.5">
                Pacing-controller não pausa essa campanha.
              </p>
            </Label>
            <Switch checked={exempt} onCheckedChange={setExempt} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Teto/hora customizado (R$)</Label>
          <Input
            type="number"
            min={0}
            step={50}
            placeholder="ex: 600 — em branco = sem teto/hora"
            value={cap}
            onChange={(e) => setCap(e.target.value)}
            className="tabular-nums h-8 text-sm"
          />
          <p className="text-[10px] text-muted-foreground">
            Substitui só pra essa campanha. Em branco + isenta = gasta livre.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Voltar pras regras em — opcional</Label>
          <div className="flex gap-1 flex-wrap">
            {[1, 3, 6, 12, 24].map((h) => (
              <Button
                key={h}
                type="button"
                size="sm"
                variant={until && new Date(until).getTime() > Date.now() ? "outline" : "outline"}
                className="h-7 text-[11px] px-2 flex-1"
                onClick={() => setUntil(addHoursIso(h))}
              >
                +{h}h
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-[11px] px-2"
              onClick={() => setUntil("")}
            >
              Permanente
            </Button>
          </div>
          {until && (
            <p className="text-[10px] text-amber-600">
              Volta às regras em <b>{formatRelative(until)}</b>
            </p>
          )}
        </div>

        <div className="flex gap-2 justify-between pt-1">
          {isActive ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-[11px] text-destructive hover:text-destructive"
              onClick={() => save({ clear: true })}
              disabled={saving}
            >
              Desativar controle manual
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button size="sm" className="h-8" onClick={() => save()} disabled={saving}>
              {saving ? <Loader2 className="size-3.5 animate-spin mr-1" /> : null}
              Salvar
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
