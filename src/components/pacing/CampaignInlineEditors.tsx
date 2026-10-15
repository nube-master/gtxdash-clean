import { useState, useRef, useEffect } from "react";
import { Pencil, Check, X, Loader2, Plus, Minus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useUpdateCampaign } from "@/hooks/useUpdateCampaign";
import { cn } from "@/lib/utils";

const FB_BASE = "https://www.facebook.com/adsmanager/manage/campaigns?act=";

function openFacebook(accountId: string, campaignId: string) {
  const act = accountId.replace(/^act_/, "");
  const url = `${FB_BASE}${act}&selected_campaign_ids=${campaignId}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

/* ------------------------------------------------------------------ */
/* Editor inline de NOME — pencil ao lado, vira input quando ativo    */
/* ------------------------------------------------------------------ */
export function NameEditCell({
  campaignId, accountId, currentName,
}: { campaignId: string; accountId: string; currentName: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentName);
  const inputRef = useRef<HTMLInputElement>(null);
  const { mutate, isPending } = useUpdateCampaign();

  useEffect(() => { if (editing) { setValue(currentName); setTimeout(() => inputRef.current?.focus(), 0); } }, [editing, currentName]);

  const save = () => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === currentName) { setEditing(false); return; }
    mutate(
      { campaign_id: campaignId, account_id: accountId, name: trimmed },
      { onSuccess: () => setEditing(false) },
    );
  };

  if (editing) {
    return (
      <div className="flex items-start gap-1" onClick={(e) => e.stopPropagation()}>
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); save(); }
            if (e.key === "Escape") { e.preventDefault(); setEditing(false); }
          }}
          className="h-7 text-xs"
          disabled={isPending}
        />
        <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={save} disabled={isPending}>
          {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5 text-primary" />}
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => setEditing(false)} disabled={isPending}>
          <X className="size-3.5 text-muted-foreground" />
        </Button>
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-1" onClick={(e) => e.stopPropagation()}>
      <div className="font-medium text-foreground leading-tight whitespace-normal break-words flex-1">
        {currentName}
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="p-1 rounded hover:bg-muted/40 text-muted-foreground hover:text-foreground"
              aria-label="Editar nome"
            >
              <Pencil className="size-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top"><p className="text-[11px]">Renomear (também atualiza no Meta)</p></TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => openFacebook(accountId, campaignId)}
              className="p-1 rounded hover:bg-muted/40 text-muted-foreground hover:text-foreground"
              aria-label="Abrir no Facebook"
            >
              <svg viewBox="0 0 24 24" className="size-3 fill-current"><path d="M22 12a10 10 0 1 0-11.6 9.87v-6.99H7.9V12h2.5V9.8c0-2.48 1.48-3.85 3.74-3.85 1.08 0 2.21.2 2.21.2v2.43h-1.25c-1.23 0-1.6.76-1.6 1.55V12h2.74l-.44 2.88h-2.3v6.99A10 10 0 0 0 22 12z"/></svg>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top"><p className="text-[11px]">Abrir no Gerenciador de Anúncios</p></TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Editor inline de ORÇAMENTO — popover com modo Valor ou %           */
/* ------------------------------------------------------------------ */
export function BudgetEditCell({
  campaignId, accountId, currentBudget, formatMoney,
}: {
  campaignId: string;
  accountId: string;
  currentBudget: number | null | undefined;
  formatMoney: (v: number, d?: number) => string;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"abs" | "pct">("abs");
  const [absInput, setAbsInput] = useState<string>("");
  const [pctInput, setPctInput] = useState<string>("");
  const [pctDir, setPctDir] = useState<"up" | "down">("up");
  const { mutate, isPending } = useUpdateCampaign();

  useEffect(() => {
    if (open) {
      setAbsInput(currentBudget ? currentBudget.toFixed(2) : "");
      setPctInput("");
      setMode("abs");
      setPctDir("up");
    }
  }, [open, currentBudget]);

  const computeNew = (): number | null => {
    if (mode === "abs") {
      const v = parseFloat(absInput.replace(",", "."));
      return isFinite(v) && v > 0 ? Number(v.toFixed(2)) : null;
    }
    const p = parseFloat(pctInput.replace(",", "."));
    if (!isFinite(p) || p <= 0 || !currentBudget || currentBudget <= 0) return null;
    const factor = pctDir === "up" ? 1 + p / 100 : 1 - p / 100;
    const v = currentBudget * factor;
    return v > 0 ? Number(v.toFixed(2)) : null;
  };

  const newBudget = computeNew();
  const delta = newBudget != null && currentBudget ? newBudget - currentBudget : null;

  const save = () => {
    if (newBudget == null) return;
    mutate(
      { campaign_id: campaignId, account_id: accountId, daily_budget_brl: newBudget },
      { onSuccess: () => setOpen(false) },
    );
  };

  const hasBudget = !!(currentBudget && currentBudget > 0);

  return (
    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      <span className={cn(!hasBudget && "text-muted-foreground/60")}>
        {hasBudget ? formatMoney(currentBudget!) : "—"}
      </span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="p-1 rounded hover:bg-muted/40 text-muted-foreground hover:text-foreground opacity-60 hover:opacity-100"
            aria-label="Editar orçamento"
            disabled={!hasBudget}
            title={hasBudget ? "Editar orçamento (CBO)" : "Sem orçamento de CBO — campanha ABO"}
          >
            <Pencil className="size-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-3" onClick={(e) => e.stopPropagation()}>
          <div className="space-y-3">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Orçamento atual</div>
              <div className="text-sm font-semibold">{formatMoney(currentBudget ?? 0)}</div>
            </div>

            <ToggleGroup
              type="single" size="sm" value={mode}
              onValueChange={(v) => v && setMode(v as "abs" | "pct")}
              className="grid grid-cols-2 gap-1"
            >
              <ToggleGroupItem value="abs" className="text-xs">Valor</ToggleGroupItem>
              <ToggleGroupItem value="pct" className="text-xs">%</ToggleGroupItem>
            </ToggleGroup>

            {mode === "abs" ? (
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Novo orçamento diário (BRL)</label>
                <Input
                  type="number" step="0.01" min="0"
                  value={absInput}
                  onChange={(e) => setAbsInput(e.target.value)}
                  className="h-8 text-sm"
                  placeholder="0,00"
                  autoFocus
                />
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Variação</label>
                <div className="flex items-center gap-1">
                  <ToggleGroup
                    type="single" size="sm" value={pctDir}
                    onValueChange={(v) => v && setPctDir(v as "up" | "down")}
                  >
                    <ToggleGroupItem value="up" className="h-8 px-2"><Plus className="size-3.5" /></ToggleGroupItem>
                    <ToggleGroupItem value="down" className="h-8 px-2"><Minus className="size-3.5" /></ToggleGroupItem>
                  </ToggleGroup>
                  <Input
                    type="number" step="1" min="0"
                    value={pctInput}
                    onChange={(e) => setPctInput(e.target.value)}
                    className="h-8 text-sm"
                    placeholder="%"
                    autoFocus
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
                <div className="flex gap-1 pt-1">
                  {[10, 20, 30, 50].map((q) => (
                    <Button key={q} type="button" size="sm" variant="outline" className="h-6 px-2 text-[11px] flex-1"
                      onClick={() => setPctInput(String(q))}>
                      {q}%
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {newBudget != null && (
              <div className="rounded-md bg-muted/40 p-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Novo</span>
                  <span className="font-semibold">{formatMoney(newBudget)}</span>
                </div>
                {delta != null && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Δ</span>
                    <span className={cn("font-medium", delta > 0 ? "text-success" : delta < 0 ? "text-red" : "")}>
                      {delta > 0 ? "+" : ""}{formatMoney(delta)}
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>
                Cancelar
              </Button>
              <Button size="sm" onClick={save} disabled={isPending || newBudget == null}>
                {isPending ? <Loader2 className="size-3.5 mr-1 animate-spin" /> : null}
                Aplicar no Meta
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
