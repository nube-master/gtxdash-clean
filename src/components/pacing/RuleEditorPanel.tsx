import { useEffect, useMemo, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X, Beaker, Play, ChevronDown, Info } from "lucide-react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { usePacingScopePreview } from "@/hooks/usePacingScopePreview";
import { usePacingProjectOptions } from "@/hooks/usePacingProjectOptions";
import {
  PROJECT_SLUGS,
  ALL_ACCOUNTS,
  BUDGET_GROUPS,
  defaultRuleV2,
  type PacingRuleV2,
  type ProjectSlug,
  type RulePhase,
  type ExtraCondMetric,
  type ExtraCondUnit,
} from "./mockData";

const TOLERANCE_SNAPS = [1.0, 1.25, 1.5, 2.0, 3.0];
const PHASES: RulePhase[] = ["F1", "F2", "F3"];

const schema = z.object({
  name: z.string().min(2, "Mínimo 2 caracteres").max(80, "Máximo 80 caracteres"),
  enabled: z.boolean(),
  scope: z.object({
    nameContains: z.string().max(80),
    projects: z.array(z.string()),
    account: z.string(),
    phases: z.array(z.string()),
    minBudget: z.preprocess(
      (v) => (v === "" || v == null || Number.isNaN(v as number) ? 0 : Number(v)),
      z.number().min(0).max(100000),
    ),
    appliesTo: z.enum(["active", "paused", "any"]).default("active"),
    minSpendYesterdayBrl: z.number().min(0).max(1000000).optional().default(0),
    activeHourStart: z.preprocess(
      (v) => (v === "" || v == null || Number.isNaN(v) ? undefined : Number(v)),
      z.number().min(0).max(23).optional(),
    ),
    activeHourEnd: z.preprocess(
      (v) => (v === "" || v == null || Number.isNaN(v) ? undefined : Number(v)),
      z.number().min(1).max(24).optional(),
    ),
  }),

  trigger: z.object({
    kind: z.enum(["linear_pacing", "group_cap", "daily_cap", "acceleration_no_sale", "campaign_hourly_cap", "hourly_window", "profit_threshold", "daily_schedule", "metric_threshold"]),
    tolerance: z.number().min(1).max(3),
    andNoSale: z.boolean(),
    noSaleMinutes: z.number().min(5).max(1440),
    groupId: z.string(),
    accelPctOfDaily: z.number().min(1).max(100),
    defaultDailyTargetBrl: z.preprocess(
      (v) => (v === "" || v === null || v === undefined || Number.isNaN(v) ? undefined : Number(v)),
      z.number().min(0).max(1_000_000).optional(),
    ),
    maxSpendPerHourBrl: z.preprocess(
      (v) => (v === "" || v === null || v === undefined || Number.isNaN(v) ? undefined : Number(v)),
      z.number().min(0).max(1_000_000).optional(),
    ),
    maxPctOfDailyPerHour: z.preprocess(
      (v) => (v === "" || v === null || v === undefined || Number.isNaN(v) ? undefined : Number(v)),
      z.number().min(0).max(100).optional(),
    ),
    hourStart: z.preprocess(
      (v) => (v === "" || v == null || Number.isNaN(v) ? undefined : Number(v)),
      z.number().min(0).max(23).optional(),
    ),
    hourEnd: z.preprocess(
      (v) => (v === "" || v == null || Number.isNaN(v) ? undefined : Number(v)),
      z.number().min(0).max(23).optional(),
    ),
    minSpendBeforeTrigger: z.preprocess(
      (v) => (v === "" || v == null || Number.isNaN(v) ? undefined : Number(v)),
      z.number().min(0).max(1_000_000).optional(),
    ),
    spendBetweenMin: z.preprocess(
      (v) => (v === "" || v == null || Number.isNaN(v) ? undefined : Number(v)),
      z.number().min(0).max(1_000_000).optional(),
    ),
    spendBetweenMax: z.preprocess(
      (v) => (v === "" || v == null || Number.isNaN(v) ? undefined : Number(v)),
      z.number().min(0).max(1_000_000).optional(),
    ),
    andNoSaleInLastMinutes: z.preprocess(
      (v) => (v === "" || v == null || Number.isNaN(v) ? undefined : Number(v)),
      z.number().min(0).max(1440).optional(),
    ),
    profitThreshold: z.preprocess(
      (v) => (v === "" || v == null || Number.isNaN(v) ? undefined : Number(v)),
      z.number().min(-1_000_000).max(1_000_000).optional(),
    ),
    profitThresholdUnit: z.enum(["brl", "pct"]).default("brl"),
    window: z.enum(["today", "yesterday", "last_3d", "last_7d", "last_15min", "last_30min", "last_60min", "custom"]).default("today"),
    evalEveryMin: z.preprocess(
      (v) => (v === "" || v == null || Number.isNaN(v) ? 10 : Number(v)),
      z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(5), z.literal(10), z.literal(15), z.literal(30), z.literal(60)]).default(10),
    ),
    extraConditions: z.array(z.object({
      metric: z.enum(["spend", "sales", "roi", "roas", "cpa", "ctr", "cpc", "profit", "ic"]),
      op: z.enum([">", ">=", "<", "<=", "="]),
      value: z.preprocess(
        (v) => (v === "" || v == null || Number.isNaN(Number(v)) ? 0 : Number(v)),
        z.number(),
      ),
      unit: z.enum(["abs", "pct"]).default("abs"),
    })).default([]),
    scheduledHour: z.preprocess(
      (v) => (v === "" || v == null || Number.isNaN(v) ? undefined : Number(v)),
      z.number().min(0).max(23).optional(),
    ),
    scheduledMinute: z.preprocess(
      (v) => (v === "" || v == null || Number.isNaN(v) ? undefined : Number(v)),
      z.number().min(0).max(59).optional(),
    ),
  }),
  action: z.object({
    kind: z.enum(["pause", "reduce_budget", "increase_budget", "alert_only", "activate"]),
    reducePct: z.number().min(1).max(99),
    increasePct: z.preprocess(
      (v) => (v === "" || v == null || Number.isNaN(v) ? 100 : Number(v)),
      z.number().min(1).max(1000).default(100),
    ),
    maxDailyBudgetBrl: z.preprocess(
      (v) => (v === "" || v == null || Number.isNaN(v) ? undefined : Number(v)),
      z.number().min(0).max(1_000_000).optional(),
    ),
    cooldownMin: z.number().min(0).max(1440),
    autoResume: z.boolean(),
    maxFiresPerDay: z.preprocess(
      (v) => (v === "" || v == null || Number.isNaN(v) ? 0 : Number(v)),
      z.number().min(0).max(1000).default(0),
    ),
    maxFiresPerCampaignPerDay: z.preprocess(
      (v) => (v === "" || v == null || Number.isNaN(v) ? 0 : Number(v)),
      z.number().min(0).max(100).default(0),
    ),
    hardStopUntilHourBRT: z.preprocess(
      (v) => (v === "" || v == null || Number.isNaN(v) ? undefined : Number(v)),
      z.number().int().min(0).max(23).optional(),
    ),
  }),
  notification: z.object({
    pushcut: z.boolean(),
    severity: z.enum(["low", "medium", "high"]),
  }),
});

type FormValues = z.infer<typeof schema>;

const DRAFT_KEY = "pacing:rule-editor:draft";

interface Props {
  open: boolean;
  rule: PacingRuleV2 | null; // null = create
  onClose: () => void;
  onSave: (rule: PacingRuleV2) => void;
}

const snapTolerance = (v: number): number => {
  let closest = TOLERANCE_SNAPS[0];
  let best = Infinity;
  for (const s of TOLERANCE_SNAPS) {
    const d = Math.abs(s - v);
    if (d < best) { best = d; closest = s; }
  }
  return closest;
};

const autoSuggestName = (v: FormValues): string => {
  const proj = v.scope.projects[0] ?? "Geral";
  const phase = v.scope.phases[0] ?? "";
  const tol = v.trigger.kind === "linear_pacing" ? `× ${v.trigger.tolerance}` : v.trigger.kind;
  return `Aceleração ${proj}${phase ? ` ${phase}` : ""} ${tol}`.trim();
};

export function RuleEditorPanel({ open, rule, onClose, onSave }: Props) {
  const isEditing = !!rule;

  const defaults: FormValues = useMemo(() => {
    if (rule) {
      const { id, matchedCampaigns, firedToday, firedTotal, lastFiredAt, ...rest } = rule;
      return rest as FormValues;
    }
    // try draft
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) return JSON.parse(raw) as FormValues;
    } catch { /* noop */ }
    const d = defaultRuleV2();
    const { id, matchedCampaigns, firedToday, firedTotal, lastFiredAt, ...rest } = d;
    return rest as FormValues;
  }, [rule, open]);

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults });
  const { control, register, handleSubmit, watch, setValue, reset, formState: { errors } } = form;

  useEffect(() => { reset(defaults); }, [defaults, reset]);

  const values = watch();

  // Autosave draft (create only)
  useEffect(() => {
    if (isEditing || !open) return;
    const t = setInterval(() => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(values)); } catch { /* noop */ }
    }, 5000);
    return () => clearInterval(t);
  }, [values, isEditing, open]);

  // Auto-suggest name while typing
  useEffect(() => {
    if (isEditing) return;
    if (!values.name && (values.scope.projects.length || values.scope.phases.length)) {
      setValue("name", autoSuggestName(values), { shouldDirty: false });
    }
  }, [values.scope.projects, values.scope.phases, values.trigger.tolerance, isEditing, setValue]);

  // Inicializa hora/minuto quando o gatilho vira daily_schedule (evita salvar undefined)
  useEffect(() => {
    if (values.trigger.kind !== "daily_schedule") return;
    if (values.trigger.scheduledHour === undefined || values.trigger.scheduledHour === null) {
      setValue("trigger.scheduledHour", 0, { shouldDirty: true });
    }
    if (values.trigger.scheduledMinute === undefined || values.trigger.scheduledMinute === null) {
      setValue("trigger.scheduledMinute", 0, { shouldDirty: true });
    }
  }, [values.trigger.kind, values.trigger.scheduledHour, values.trigger.scheduledMinute, setValue]);

  const preview = usePacingScopePreview(
    {
      nameContains: values.scope.nameContains,
      projects: values.scope.projects as ProjectSlug[],
      account: values.scope.account,
      phases: values.scope.phases as RulePhase[],
      minBudget: values.scope.minBudget,
      appliesTo: (values.scope.appliesTo ?? "active") as "active" | "paused" | "any",
      minSpendYesterdayBrl: values.scope.minSpendYesterdayBrl ?? 0,
    },
    open,
  );
  const matched = preview.count;

  const [showMatched, setShowMatched] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [sim, setSim] = useState({ fires: 11, saved: 890, falsePos: 2 });

  const runSimulation = () => {
    setSimulating(true);
    setTimeout(() => {
      const fires = Math.max(0, Math.round(matched * (values.trigger.kind === "linear_pacing" ? values.trigger.tolerance : 0.8)));
      setSim({
        fires,
        saved: Math.round(fires * 65 + Math.random() * 200),
        falsePos: Math.max(0, Math.round(fires * 0.15)),
      });
      setSimulating(false);
    }, 700);
  };

  useEffect(() => { if (open) runSimulation(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open, matched, values.trigger.kind]);

  // Projetos dinâmicos (offers.apelido_interno ∪ slugs hardcoded)
  const { projects: availableProjects } = usePacingProjectOptions();
  const [projectSearch, setProjectSearch] = useState("");

  const toggleProject = (slug: string) => {
    const next = values.scope.projects.includes(slug)
      ? values.scope.projects.filter((p) => p !== slug)
      : [...values.scope.projects, slug];
    setValue("scope.projects", next, { shouldDirty: true });
  };

  const togglePhase = (p: RulePhase) => {
    const next = values.scope.phases.includes(p)
      ? values.scope.phases.filter((x) => x !== p)
      : [...values.scope.phases, p];
    setValue("scope.phases", next, { shouldDirty: true });
  };

  const handleSave = (asDraft: boolean) => handleSubmit(
    (data) => {
      const base = rule ?? defaultRuleV2();
      const saved: PacingRuleV2 = {
        ...base,
        ...(data as unknown as Omit<PacingRuleV2, "id" | "matchedCampaigns" | "firedToday" | "firedTotal" | "lastFiredAt">),
        id: rule?.id ?? `rv-${Date.now()}`,
        enabled: asDraft ? false : data.enabled,
        matchedCampaigns: matched,
      };
      onSave(saved);
      if (!isEditing) {
        try { localStorage.removeItem(DRAFT_KEY); } catch { /* noop */ }
      }
      toast.success(isEditing ? "Regra atualizada" : asDraft ? "Rascunho salvo" : "Regra criada");
      onClose();
    },
    (errs) => {
      console.error("[RuleEditor] validation errors", errs);
      const flatten = (obj: unknown, path = ""): string[] => {
        if (!obj || typeof obj !== "object") return [];
        const out: string[] = [];
        for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
          const p = path ? `${path}.${k}` : k;
          if (v && typeof v === "object" && "message" in (v as Record<string, unknown>) && typeof (v as { message?: unknown }).message === "string") {
            out.push(`${p}: ${(v as { message: string }).message}`);
          } else {
            out.push(...flatten(v, p));
          }
        }
        return out;
      };
      const msgs = flatten(errs).slice(0, 3).join(" • ");
      toast.error(msgs || "Verifique os campos obrigatórios");
    }
  )();

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[540px] p-0 flex flex-col gap-0 bg-background border-l border-border"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-border/60 bg-background">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose}>
              <X className="size-4" />
            </Button>
            <h2 className="text-sm font-semibold uppercase tracking-wider truncate">
              {isEditing ? `Editar: ${rule?.name}` : "Criar nova regra"}
            </h2>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-7">
          {/* 1. NOME */}
          <section className="space-y-2">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">1. Nome</Label>
            <Input
              {...register("name")}
              placeholder="ex: Aceleração F3 NDM Escala"
              className="text-base font-medium"
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </section>

          {/* 2. ESCOPO */}
          <section className="space-y-3">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">2. Escopo · quais campanhas a regra observa</Label>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Nome contém</Label>
              <Input {...register("scope.nameContains")} placeholder="ex: 1-250-1" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <Label className="text-xs text-muted-foreground">Projetos</Label>
                <div className="flex items-center gap-1.5">
                  <Input
                    value={projectSearch}
                    onChange={(e) => setProjectSearch(e.target.value)}
                    placeholder="buscar…"
                    className="h-7 w-32 text-[11px]"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-[10px] px-2"
                    onClick={() => {
                      const codPicks = availableProjects.filter((s) => /cod/i.test(s));
                      const merged = Array.from(new Set([...values.scope.projects, ...codPicks]));
                      setValue("scope.projects", merged, { shouldDirty: true });
                    }}
                  >
                    + Todas COD
                  </Button>
                  {values.scope.projects.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[10px] px-2"
                      onClick={() => setValue("scope.projects", [], { shouldDirty: true })}
                    >
                      limpar
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto pr-1">
                {availableProjects
                  .filter((slug) => !projectSearch || slug.toLowerCase().includes(projectSearch.toLowerCase()))
                  .map((slug) => {
                    const active = values.scope.projects.includes(slug);
                    return (
                      <button
                        key={slug}
                        type="button"
                        onClick={() => toggleProject(slug)}
                        className={cn(
                          "px-2.5 py-1 rounded text-[11px] font-semibold tracking-wider uppercase border transition-colors",
                          active
                            ? "border-primary bg-primary/15 text-primary"
                            : "border-border bg-muted/30 text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {slug}
                      </button>
                    );
                  })}
                {availableProjects.length === 0 && (
                  <span className="text-[11px] text-muted-foreground">nenhum projeto encontrado</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Conta</Label>
                <Controller
                  control={control}
                  name="scope.account"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas as contas</SelectItem>
                        {ALL_ACCOUNTS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Orçamento mínimo (R$)</Label>
                <Input
                  type="number"
                  min={0}
                  {...register("scope.minBudget", { valueAsNumber: true })}
                  className="tabular-nums"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Fase</Label>
              <div className="flex gap-1.5">
                {PHASES.map((p) => {
                  const active = values.scope.phases.includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => togglePhase(p)}
                      className={cn(
                        "px-3 py-1 rounded text-xs font-semibold border transition-colors",
                        active
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-border bg-muted/30 text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 1) Aplicar regra a — estado da campanha */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Aplicar regra a</Label>
              <Controller
                control={control}
                name="scope.appliesTo"
                render={({ field }) => (
                  <RadioGroup
                    value={field.value ?? "active"}
                    onValueChange={field.onChange}
                    className="grid grid-cols-3 gap-2"
                  >
                    {[
                      ["active", "Ativas"],
                      ["paused", "Pausadas"],
                      ["any", "Qualquer"],
                    ].map(([val, label]) => (
                      <label
                        key={val}
                        className={cn(
                          "flex items-center gap-2 rounded border px-2.5 py-1.5 text-xs cursor-pointer transition-colors",
                          (field.value ?? "active") === val ? "border-primary bg-primary/10" : "border-border hover:border-border/80"
                        )}
                      >
                        <RadioGroupItem value={val} />
                        {label}
                      </label>
                    ))}
                  </RadioGroup>
                )}
              />
              <p className="text-[11px] text-muted-foreground">
                Use <b>Pausadas</b> p/ regras de religar (ex: lucro &gt; 20% → Ativar).
              </p>
            </div>

            {/* 2) Spend ontem mínimo — restringe a campanhas que rodaram ontem */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Teve spend ontem ≥ (R$){" "}
                <span className="text-[10px] opacity-70">
                  · 0 = ignorar
                </span>
              </Label>
              <Controller
                control={control}
                name="scope.minSpendYesterdayBrl"
                render={({ field }) => (
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={field.value ?? 0}
                    onChange={(e) => field.onChange(Number(e.target.value) || 0)}
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
                    placeholder="ex: 50"
                  />
                )}
              />
              <p className="text-[11px] text-muted-foreground">
                Filtra fora campanhas que <b>não rodaram ontem</b>. Ideal p/ regras de religar
                "TOPs" — evita varrer histórico inteiro de pausadas.
              </p>
            </div>

            {/* 3) Janela horária ativa (BRT) — regra só roda dentro desse intervalo */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Janela horária ativa (BRT){" "}
                <span className="text-[10px] opacity-70">· vazio = 24h</span>
              </Label>
              <div className="flex items-center gap-2">
                <Controller
                  control={control}
                  name="scope.activeHourStart"
                  render={({ field }) => (
                    <input
                      type="number"
                      min={0}
                      max={23}
                      step={1}
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))}
                      className="w-24 rounded border border-border bg-background px-3 py-2 text-sm"
                      placeholder="0"
                    />
                  )}
                />
                <span className="text-xs text-muted-foreground">até</span>
                <Controller
                  control={control}
                  name="scope.activeHourEnd"
                  render={({ field }) => (
                    <input
                      type="number"
                      min={1}
                      max={24}
                      step={1}
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))}
                      className="w-24 rounded border border-border bg-background px-3 py-2 text-sm"
                      placeholder="24"
                    />
                  )}
                />
                <span className="text-xs text-muted-foreground">h</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Ex.: <b>0 → 6</b> = só madrugada. <b>22 → 6</b> = vira a meia-noite. Fora da janela a
                regra é <b>pulada</b> (não avaliada nem dispara).
              </p>
            </div>

            <div className="rounded border border-primary/30 bg-primary/5 px-3 py-2.5">
              <div className="flex items-center justify-between text-xs">
                <span>
                  🎯 Esta regra vai atingir{" "}
                  {preview.loading ? (
                    <span className="text-muted-foreground">contando…</span>
                  ) : preview.error ? (
                    <span className="text-destructive">erro ao consultar</span>
                  ) : (
                    <>
                      <span className="font-bold text-primary tabular-nums">{matched}</span>{" "}
                      campanhas <b>{preview.label}</b> (dados em tempo real)
                    </>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => setShowMatched((v) => !v)}
                  className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  ver lista
                  <ChevronDown className={cn("size-3 transition-transform", showMatched && "rotate-180")} />
                </button>
              </div>
              {showMatched && (
                <div className="mt-2 pt-2 border-t border-primary/20 text-[11px] text-muted-foreground max-h-56 overflow-y-auto space-y-0.5">
                  {preview.error ? (
                    <div>{preview.error}</div>
                  ) : matched === 0 ? (
                    <div>Nenhuma campanha bate com este escopo.</div>
                  ) : preview.sampleNames.length === 0 ? (
                    <div>carregando amostra…</div>
                  ) : (
                    <>
                      {preview.sampleNames.map((name) => (
                        <div key={name} className="font-mono text-[10.5px] leading-tight text-foreground/80 truncate" title={name}>
                          {name}
                        </div>
                      ))}
                      {matched > preview.sampleNames.length && (
                        <div className="pt-1 italic opacity-70">
                          + {matched - preview.sampleNames.length} outras (amostra limitada a {preview.sampleNames.length})
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* 3. TRIGGER */}
          <section className="space-y-3">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">3. Trigger · quando dispara</Label>
            <Controller
              control={control}
              name="trigger.kind"
              render={({ field }) => (
                <RadioGroup value={field.value} onValueChange={field.onChange} className="grid grid-cols-2 gap-2">
                  {[
                    ["linear_pacing", "Linear pacing"],
                    ["group_cap", "Group cap"],
                    ["daily_cap", "Daily cap"],
                    ["acceleration_no_sale", "Aceleração + sem venda"],
                    ["campaign_hourly_cap", "Teto por hora (campanha)"],
                    ["hourly_window", "Janela horária (BRT)"],
                    ["profit_threshold", "Lucro / Prejuízo"],
                    ["daily_schedule", "Agendamento (1×/dia)"],
                    ["metric_threshold", "Métrica (CPC / CPA / ROAS…)"],
                  ].map(([val, label]) => (
                    <label
                      key={val}
                      className={cn(
                        "flex items-center gap-2 rounded border px-3 py-2 text-xs cursor-pointer transition-colors",
                        field.value === val ? "border-primary bg-primary/10" : "border-border hover:border-border/80"
                      )}
                    >
                      <RadioGroupItem value={val} />
                      {label}
                    </label>
                  ))}
                </RadioGroup>
              )}
            />

            {values.trigger.kind === "linear_pacing" && (
              <div className="space-y-3 rounded border border-border/60 bg-muted/20 p-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <Label className="text-xs text-muted-foreground">Tolerância</Label>
                    <span className="text-sm font-bold tabular-nums text-primary">{values.trigger.tolerance.toFixed(2)}×</span>
                  </div>
                  <Controller
                    control={control}
                    name="trigger.tolerance"
                    render={({ field }) => (
                      <Slider
                        min={1}
                        max={3}
                        step={0.05}
                        value={[field.value]}
                        onValueChange={(v) => field.onChange(snapTolerance(v[0]))}
                      />
                    )}
                  />
                  <p className="text-[11px] text-muted-foreground mt-2">
                    Pausa quando gasta {values.trigger.tolerance.toFixed(2)}× do esperado linear
                  </p>
                </div>
                <div className="flex items-center gap-3 pt-2 border-t border-border/40">
                  <Controller
                    control={control}
                    name="trigger.andNoSale"
                    render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
                  />
                  <span className="text-xs">AND sem venda nos últimos</span>
                  <Input
                    type="number"
                    min={5}
                    className="w-16 h-7 text-xs tabular-nums"
                    disabled={!values.trigger.andNoSale}
                    {...register("trigger.noSaleMinutes", { valueAsNumber: true })}
                  />
                  <span className="text-xs">minutos</span>
                </div>
              </div>
            )}

            {values.trigger.kind === "group_cap" && (
              <div className="space-y-2 rounded border border-border/60 bg-muted/20 p-3">
                <Label className="text-xs text-muted-foreground">Budget group</Label>
                <Controller
                  control={control}
                  name="trigger.groupId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue placeholder="selecionar grupo" /></SelectTrigger>
                      <SelectContent>
                        {BUDGET_GROUPS.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                />
                <p className="text-[11px] text-muted-foreground">Pausa todas do grupo se gasto/hora &gt; $370</p>
              </div>
            )}

            {values.trigger.kind === "daily_cap" && (
              <div className="rounded border border-border/60 bg-muted/20 p-3">
                <p className="text-xs">Pausa quando <span className="font-semibold">spend &gt; 100% do daily budget</span></p>
              </div>
            )}

            {values.trigger.kind === "acceleration_no_sale" && (
              <div className="space-y-2 rounded border border-border/60 bg-muted/20 p-3">
                <Label className="text-xs text-muted-foreground">% do daily budget em 5min</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  {...register("trigger.accelPctOfDaily", { valueAsNumber: true })}
                  className="tabular-nums"
                />
                <p className="text-[11px] text-muted-foreground">
                  Pausa se spend nos últimos 5min &gt; {values.trigger.accelPctOfDaily}% do daily budget
                </p>
              </div>
            )}

            {values.trigger.kind === "campaign_hourly_cap" && (
              <div className="space-y-3 rounded border border-rose-500/30 bg-rose-500/5 p-3">
                <div>
                  <Label className="text-xs text-rose-600 dark:text-rose-400 font-semibold">
                    Teto absoluto (R$ / hora)
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    step={50}
                    placeholder="ex: 550"
                    className="mt-1 tabular-nums"
                    {...register("trigger.maxSpendPerHourBrl", { valueAsNumber: true })}
                  />
                </div>
                <div>
                  <Label className="text-xs text-rose-600 dark:text-rose-400 font-semibold">
                    OU teto relativo (% do daily / hora)
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    placeholder="ex: 15"
                    className="mt-1 tabular-nums"
                    {...register("trigger.maxPctOfDailyPerHour", { valueAsNumber: true })}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Vale <b>24h</b>. Dispara se a campanha gastar mais que <b>qualquer</b> um dos limites
                  na última 1h. Use absoluto para tetos rígidos (R$) ou relativo para escalar com o
                  budget (ex: 15% de R$ 2.750 = R$ 412/h). Preencha pelo menos um — campos vazios são
                  ignorados.
                </p>
              </div>
            )}

            {values.trigger.kind === "hourly_window" && (
              <div className="space-y-3 rounded border border-indigo-500/30 bg-indigo-500/5 p-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold">
                      Hora início (BRT)
                    </Label>
                    <Controller
                      control={control}
                      name="trigger.hourStart"
                      render={({ field }) => (
                        <Select
                          value={String(field.value ?? 0)}
                          onValueChange={(v) => field.onChange(Number(v))}
                        >
                          <SelectTrigger className="mt-1 h-9 text-sm tabular-nums"><SelectValue /></SelectTrigger>
                          <SelectContent className="max-h-72">
                            {Array.from({ length: 24 }, (_, h) => (
                              <SelectItem key={h} value={String(h)}>
                                {String(h).padStart(2, "0")}h00 (BRT)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold">
                      Hora fim (BRT)
                    </Label>
                    <Controller
                      control={control}
                      name="trigger.hourEnd"
                      render={({ field }) => (
                        <Select
                          value={String(field.value ?? 0)}
                          onValueChange={(v) => field.onChange(Number(v))}
                        >
                          <SelectTrigger className="mt-1 h-9 text-sm tabular-nums"><SelectValue /></SelectTrigger>
                          <SelectContent className="max-h-72">
                            {Array.from({ length: 24 }, (_, h) => (
                              <SelectItem key={h} value={String(h)}>
                                {String(h).padStart(2, "0")}h00 (BRT)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground -mt-1">
                  🇧🇷 Janela sempre em <b>horário de Brasília (UTC−3)</b>. Contas com fuso de Dubai/EUA/etc são
                  convertidas — se a campanha gastar à meia-noite BRT (mesmo que lá seja outro horário), a regra dispara.
                </p>
                <div>
                  <Label className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold">
                    Gasto máximo na janela (R$)
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    placeholder="ex: 250.00"
                    className="mt-1 tabular-nums"
                    {...register("trigger.minSpendBeforeTrigger", { valueAsNumber: true })}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Dispara se gasto acumulado (em R$) na janela ultrapassar este valor.
                    Contas em USD/EUR são convertidas automaticamente para R$ antes da avaliação.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-indigo-500/20">
                  <div>
                    <Label className="text-xs text-muted-foreground">Faixa mín. (opcional)</Label>
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder="ex: 0.01"
                      className="mt-1 tabular-nums"
                      {...register("trigger.spendBetweenMin", { valueAsNumber: true })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Faixa máx. (opcional)</Label>
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder="ex: 100"
                      className="mt-1 tabular-nums"
                      {...register("trigger.spendBetweenMax", { valueAsNumber: true })}
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Sem venda nos últimos N min (opcional)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={5}
                    placeholder="ex: 180"
                    className="mt-1 tabular-nums"
                    {...register("trigger.andNoSaleInLastMinutes", { valueAsNumber: true })}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Janela <b>{values.trigger.hourStart ?? 0}h–{values.trigger.hourEnd ?? 0}h</b> BRT.
                  Use o gasto máximo para pausa por excesso, ou a faixa min/max para "religar" quando
                  o gasto estiver controlado.
                </p>
              </div>
            )}

            {values.trigger.kind === "profit_threshold" && (
              <div className="space-y-2 rounded border border-emerald-500/30 bg-emerald-500/5 p-3">
                <Label className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                  Limite de lucro / prejuízo
                </Label>
                <div className="grid grid-cols-[1fr_110px] gap-2">
                  <Input
                    type="number"
                    step={1}
                    placeholder={values.trigger.profitThresholdUnit === "pct" ? "ex: 20 (lucro 20%)" : "ex: -180 (prejuízo R$ 180)"}
                    className="tabular-nums"
                    {...register("trigger.profitThreshold", { valueAsNumber: true })}
                  />
                  <Controller
                    control={control}
                    name="trigger.profitThresholdUnit"
                    render={({ field }) => (
                      <Select value={field.value ?? "brl"} onValueChange={field.onChange}>
                        <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="brl">R$ (absoluto)</SelectItem>
                          <SelectItem value="pct">% (sobre spend)</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Use <b>valores negativos</b> p/ pausar quando o prejuízo passar de X
                  {values.trigger.profitThresholdUnit === "pct"
                    ? <> (ex: <code>-30</code> pausa se prejuízo &gt; 30% do spend).</>
                    : <> (ex: <code>-180</code> pausa se prejuízo &gt; R$ 180).</>}{" "}
                  Use <b>valores positivos</b> p/ religar/alertar quando o lucro passar de X
                  {values.trigger.profitThresholdUnit === "pct"
                    ? <> (ex: <code>20</code> alerta com lucro &gt; 20% do spend).</>
                    : <> (ex: <code>500</code> alerta com lucro &gt; R$ 500).</>}
                </p>
              </div>
            )}

            {values.trigger.kind === "daily_schedule" && (
              <div className="space-y-3 rounded border border-sky-500/30 bg-sky-500/5 p-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-sky-600 dark:text-sky-400 font-semibold">
                      Hora (BRT)
                    </Label>
                    <Controller
                      control={control}
                      name="trigger.scheduledHour"
                      render={({ field }) => (
                        <Select
                          value={String(field.value ?? 0)}
                          onValueChange={(v) => field.onChange(Number(v))}
                        >
                          <SelectTrigger className="mt-1 h-9 text-sm tabular-nums"><SelectValue /></SelectTrigger>
                          <SelectContent className="max-h-72">
                            {Array.from({ length: 24 }, (_, h) => (
                              <SelectItem key={h} value={String(h)}>
                                {String(h).padStart(2, "0")}h
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-sky-600 dark:text-sky-400 font-semibold">
                      Minuto
                    </Label>
                    <Controller
                      control={control}
                      name="trigger.scheduledMinute"
                      render={({ field }) => (
                        <Select
                          value={String(field.value ?? 0)}
                          onValueChange={(v) => field.onChange(Number(v))}
                        >
                          <SelectTrigger className="mt-1 h-9 text-sm tabular-nums"><SelectValue /></SelectTrigger>
                          <SelectContent className="max-h-72">
                            {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
                              <SelectItem key={m} value={String(m)}>
                                :{String(m).padStart(2, "0")}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  ⏰ Dispara <b>1× por dia</b> em <b>{String(values.trigger.scheduledHour ?? 0).padStart(2, "0")}:{String(values.trigger.scheduledMinute ?? 0).padStart(2, "0")} BRT</b>{" "}
                  para <b>todas as campanhas</b> do escopo. Combina com{" "}
                  <b>Aplicar regra a → Pausadas</b> + <b>Ação Ativar</b> para religar campanhas no início do dia
                  (ex: virada 00:00), ou com <b>Ativas</b> + <b>Pausar</b> para desligar no fim do dia.
                  Janela de tolerância de 60 min após o horário, caso o daemon esteja atrasado.
                </p>
                <p className="text-[10px] text-amber-600 dark:text-amber-400">
                  💡 Recomendado: defina <b>Máx fires/dia = 1</b> abaixo para garantir disparo único.
                </p>
              </div>
            )}

            {values.trigger.kind === "metric_threshold" && (
              <div className="space-y-2 rounded border border-fuchsia-500/30 bg-fuchsia-500/5 p-3">
                <p className="text-xs text-fuchsia-700 dark:text-fuchsia-300 font-semibold">
                  🎯 Disparo por métrica (CPC, CPA, CTR, ROAS, ROI, Profit)
                </p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Esta regra é controlada <b>apenas pelas Condições extras</b> abaixo.
                  Exemplo: para pausar quando o CPC passar de <b>R$ 16</b>, adicione{" "}
                  <code className="text-[10px]">cpc &gt; 16</code> · unidade <b>R$</b>.
                  Combine com <b>Filtros</b> (projeto, conta, tags) para escopar.
                </p>
                <ul className="text-[10px] text-muted-foreground leading-relaxed list-disc pl-4 space-y-0.5">
                  <li><b>cpc</b> = spend ÷ link clicks (BRL)</li>
                  <li><b>cpa</b> = spend ÷ vendas (BRL) · só dispara com venda &gt; 0</li>
                  <li><b>ctr</b> = link clicks ÷ impressões (%)</li>
                  <li><b>roas</b> = revenue ÷ spend (×)</li>
                  <li><b>roi</b> = (revenue − spend) ÷ spend (× ou %)</li>
                  <li><b>profit</b> = revenue − spend (R$ ou % de margem)</li>
                </ul>
                <p className="text-[10px] text-amber-600 dark:text-amber-400">
                  ⚠️ Recomendado: combine com <code>spend &gt; X</code> p/ exigir gasto mínimo antes do disparo
                  (evita pausa com poucos cliques/impressões).
                </p>

                {/* Janela horária BRT opcional */}
                <div className="mt-2 pt-2 border-t border-fuchsia-500/20 space-y-2">
                  <Label className="text-xs text-fuchsia-700 dark:text-fuchsia-300 font-semibold">
                    🕐 Janela horária BRT (opcional)
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Se preenchidos, a regra só dispara entre <b>hora início</b> e <b>hora fim</b> BRT.
                    Deixe ambos vazios (ou 0/0) para rodar 24h.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-[11px] text-muted-foreground">Hora início (BRT)</Label>
                      <Controller
                        control={control}
                        name="trigger.hourStart"
                        render={({ field }) => (
                          <Select
                            value={field.value == null ? "none" : String(field.value)}
                            onValueChange={(v) => field.onChange(v === "none" ? undefined : Number(v))}
                          >
                            <SelectTrigger className="mt-1 h-9 text-sm tabular-nums"><SelectValue placeholder="—" /></SelectTrigger>
                            <SelectContent className="max-h-72">
                              <SelectItem value="none">— sem janela —</SelectItem>
                              {Array.from({ length: 24 }, (_, h) => (
                                <SelectItem key={h} value={String(h)}>
                                  {String(h).padStart(2, "0")}h00 (BRT)
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </div>
                    <div>
                      <Label className="text-[11px] text-muted-foreground">Hora fim (BRT)</Label>
                      <Controller
                        control={control}
                        name="trigger.hourEnd"
                        render={({ field }) => (
                          <Select
                            value={field.value == null ? "none" : String(field.value)}
                            onValueChange={(v) => field.onChange(v === "none" ? undefined : Number(v))}
                          >
                            <SelectTrigger className="mt-1 h-9 text-sm tabular-nums"><SelectValue placeholder="—" /></SelectTrigger>
                            <SelectContent className="max-h-72">
                              <SelectItem value="none">— sem janela —</SelectItem>
                              {Array.from({ length: 24 }, (_, h) => (
                                <SelectItem key={h} value={String(h)}>
                                  {String(h).padStart(2, "0")}h00 (BRT)
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </div>
                  </div>
                  {values.trigger.hourStart != null && values.trigger.hourEnd != null && (
                    <p className="text-[11px] text-fuchsia-700 dark:text-fuchsia-300">
                      Ativa entre <b>{String(values.trigger.hourStart).padStart(2, "0")}h–{String(values.trigger.hourEnd).padStart(2, "0")}h</b> BRT.
                    </p>
                  )}
                </div>
              </div>
            )}





            {/* Teto Diário Padrão — para ABO sem CBO */}
            {(values.trigger.kind === "linear_pacing" ||
              values.trigger.kind === "daily_cap" ||
              values.trigger.kind === "acceleration_no_sale") && (
              <div className="space-y-2 rounded border border-amber-500/30 bg-amber-500/5 p-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-amber-600 dark:text-amber-400 font-semibold">
                    Teto Diário Padrão (R$) · para ABO
                  </Label>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    opcional
                  </span>
                </div>
                <Input
                  type="number"
                  min={0}
                  step={50}
                  placeholder="ex: 2500"
                  className="tabular-nums"
                  {...register("trigger.defaultDailyTargetBrl", { valueAsNumber: true })}
                />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Usado em campanhas <b>ABO</b> (sem orçamento de campanha no Meta). Se vazio e a
                  campanha não tem CBO, a regra <b>não dispara</b>. Pode ser sobrescrito por
                  campanha individualmente na tabela do dashboard.
                </p>
              </div>
            )}

            {/* 3 + 6) Período de cálculo + frequência de avaliação */}
            <div className="grid grid-cols-2 gap-3 rounded border border-border/60 bg-muted/20 p-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Período de cálculo</Label>
                <Controller
                  control={control}
                  name="trigger.window"
                  render={({ field }) => (
                    <Select value={field.value ?? "today"} onValueChange={field.onChange}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="last_15min">Últimos 15 min (rolling)</SelectItem>
                        <SelectItem value="last_30min">Últimos 30 min (rolling)</SelectItem>
                        <SelectItem value="last_60min">Últimos 60 min (rolling)</SelectItem>
                        <SelectItem value="today">Hoje</SelectItem>
                        <SelectItem value="yesterday">Ontem</SelectItem>
                        <SelectItem value="last_3d">Últimos 3 dias</SelectItem>
                        <SelectItem value="last_7d">Últimos 7 dias</SelectItem>
                        <SelectItem value="custom">Personalizado</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
                {(values.trigger.window === "last_15min" || values.trigger.window === "last_30min" || values.trigger.window === "last_60min") && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 leading-tight">
                    ⚠️ Meta entrega dados por hora. Janelas &lt;60min são aproximadas à última hora fechada.
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Avaliar a cada</Label>
                <Controller
                  control={control}
                  name="trigger.evalEveryMin"
                  render={({ field }) => (
                    <Select
                      value={String(field.value ?? 10)}
                      onValueChange={(v) => field.onChange(Number(v))}
                    >
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 min (tempo real)</SelectItem>
                        <SelectItem value="2">2 min</SelectItem>
                        <SelectItem value="3">3 min</SelectItem>
                        <SelectItem value="5">5 min</SelectItem>
                        <SelectItem value="10">10 min</SelectItem>
                        <SelectItem value="15">15 min</SelectItem>
                        <SelectItem value="30">30 min</SelectItem>
                        <SelectItem value="60">1 hora</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            {/* 5) Condições extras combináveis (AND) */}
            <div className="space-y-2 rounded border border-border/60 bg-muted/10 p-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Condições extras (AND)</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[11px]"
                  onClick={() => {
                    const cur = values.trigger.extraConditions ?? [];
                    setValue("trigger.extraConditions", [...cur, { metric: "sales", op: ">=", value: 1, unit: "abs" }], { shouldDirty: true });
                  }}
                >
                  + adicionar
                </Button>
              </div>
              {(values.trigger.extraConditions ?? []).length === 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Nenhuma condição extra. Use p/ stackar (ex: <code>sales &gt;= 1</code> AND <code>roi &gt; 1.2</code>).
                </p>
              )}
              {(values.trigger.extraConditions ?? []).map((c, idx) => {
                const isPctMetric = c.metric === "ctr"; // CTR é sempre %
                const isRatioMetric = c.metric === "roi" || c.metric === "roas"; // ratio puro (1.2x)
                const isCountMetric = c.metric === "sales" || c.metric === "ic"; // contagem inteira
                return (
                  <div key={idx} className="grid grid-cols-[1fr_60px_1fr_72px_24px] gap-1.5 items-center">
                    <Select
                      value={c.metric}
                      onValueChange={(v) => {
                        const next = [...(values.trigger.extraConditions ?? [])];
                        const metric = v as ExtraCondMetric;
                        // Auto-ajusta unit ao trocar métrica
                        const unit: ExtraCondUnit = metric === "ctr" ? "pct" : "abs";
                        next[idx] = { ...next[idx], metric, unit };
                        setValue("trigger.extraConditions", next, { shouldDirty: true });
                      }}
                    >
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(["spend", "sales", "ic", "roi", "roas", "cpa", "ctr", "cpc", "profit"] as const).map((m) => (
                          <SelectItem key={m} value={m}>{m === "ic" ? "ic (initiate checkout)" : m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={c.op}
                      onValueChange={(v) => {
                        const next = [...(values.trigger.extraConditions ?? [])];
                        next[idx] = { ...next[idx], op: v as any };
                        setValue("trigger.extraConditions", next, { shouldDirty: true });
                      }}
                    >
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {([">", ">=", "<", "<=", "="] as const).map((o) => (
                          <SelectItem key={o} value={o}>{o}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      step="any"
                      className="h-7 text-xs tabular-nums"
                      value={c.value}
                      onChange={(e) => {
                        const next = [...(values.trigger.extraConditions ?? [])];
                        next[idx] = { ...next[idx], value: Number(e.target.value) };
                        setValue("trigger.extraConditions", next, { shouldDirty: true });
                      }}
                    />
                    <Select
                      value={c.unit ?? "abs"}
                      disabled={isPctMetric || isCountMetric}
                      onValueChange={(v) => {
                        const next = [...(values.trigger.extraConditions ?? [])];
                        next[idx] = { ...next[idx], unit: v as ExtraCondUnit };
                        setValue("trigger.extraConditions", next, { shouldDirty: true });
                      }}
                    >
                      <SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {isCountMetric ? (
                          <SelectItem value="abs">nº</SelectItem>
                        ) : isPctMetric ? (
                          <SelectItem value="pct">%</SelectItem>
                        ) : isRatioMetric ? (
                          <>
                            <SelectItem value="abs">×</SelectItem>
                            <SelectItem value="pct">%</SelectItem>
                          </>
                        ) : (
                          <>
                            <SelectItem value="abs">R$</SelectItem>
                            <SelectItem value="pct">%</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => {
                        const next = (values.trigger.extraConditions ?? []).filter((_, i) => i !== idx);
                        setValue("trigger.extraConditions", next, { shouldDirty: true });
                      }}
                    >
                      <X className="size-3" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 4. AÇÃO */}
          <section className="space-y-3">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">4. Ação · o que fazer</Label>
            <Controller
              control={control}
              name="action.kind"
              render={({ field }) => (
                <RadioGroup value={field.value} onValueChange={field.onChange} className="space-y-2">
                  {[
                    ["pause", "Pausar campanha"],
                    ["reduce_budget", `Reduzir budget`],
                    ["increase_budget", `Aumentar budget (scale)`],
                    ["alert_only", "Apenas alertar"],
                    ["activate", "Ativar / Religar campanha"],
                  ].map(([val, label]) => (
                    <label
                      key={val}
                      className={cn(
                        "flex items-center gap-3 rounded border px-3 py-2 text-xs cursor-pointer transition-colors",
                        field.value === val ? "border-primary bg-primary/10" : "border-border hover:border-border/80"
                      )}
                    >
                      <RadioGroupItem value={val} />
                      <span>{label}</span>
                      {val === "reduce_budget" && (
                        <div className="ml-auto flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <Input
                            type="number"
                            min={1}
                            max={99}
                            className="h-7 w-16 text-xs tabular-nums"
                            disabled={field.value !== "reduce_budget"}
                            {...register("action.reducePct", { valueAsNumber: true })}
                          />
                          <span className="text-muted-foreground">%</span>
                        </div>
                      )}
                      {val === "increase_budget" && (
                        <div className="ml-auto flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <span className="text-muted-foreground">+</span>
                          <Input
                            type="number"
                            min={1}
                            max={1000}
                            className="h-7 w-16 text-xs tabular-nums"
                            disabled={field.value !== "increase_budget"}
                            {...register("action.increasePct", { valueAsNumber: true })}
                          />
                          <span className="text-muted-foreground">% (100 = 2×)</span>
                        </div>
                      )}
                    </label>
                  ))}
                </RadioGroup>
              )}
            />

            {/* Teto de budget diário (guard-rail p/ scale/reduce) */}
            {(values.action.kind === "increase_budget" || values.action.kind === "reduce_budget") && (
              <div className="flex items-center gap-3 rounded border border-emerald-500/30 bg-emerald-500/5 p-3">
                <Label className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1.5">
                  🛡️ Teto de budget (R$/dia)
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="size-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs">
                        Limite absoluto do daily_budget da campanha após ação.
                        Se ao aumentar/reduzir passaria desse valor, o motor <b>trava no teto</b>.
                        Vazio = sem teto (não recomendado para scale).
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </Label>
                <Input
                  type="number"
                  min={0}
                  step={50}
                  placeholder="ex: 2000"
                  className="h-8 w-28 text-xs tabular-nums"
                  {...register("action.maxDailyBudgetBrl", { valueAsNumber: true })}
                />
                <span className="text-[11px] text-muted-foreground">R$</span>
              </div>
            )}

            <div className="flex items-center gap-3">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                Cooldown
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="size-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs">
                      Tempo de "resfriamento" após o daemon agir — impede que a regra dispare repetidamente em sequência.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Label>
              <Input
                type="number"
                min={0}
                className="w-20 h-8 text-xs tabular-nums"
                {...register("action.cooldownMin", { valueAsNumber: true })}
              />
              <span className="text-xs text-muted-foreground">minutos</span>
            </div>

            <div className="flex items-center gap-3">
              <Controller
                control={control}
                name="action.autoResume"
                render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
              />
              <span className="text-xs">Religar automaticamente após cooldown se condições ok</span>
            </div>

            {/* 4) Limite de execuções diária */}
            <div className="flex items-center gap-3">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                Máx. disparos / dia
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="size-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs">
                      Após N disparos no dia, a regra para. <b>0</b> = sem limite. Evita "flapping" em regras agressivas.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Label>
              <Input
                type="number"
                min={0}
                className="w-20 h-8 text-xs tabular-nums"
                {...register("action.maxFiresPerDay", { valueAsNumber: true })}
              />
              <span className="text-xs text-muted-foreground">(0 = ∞)</span>
            </div>

            {/* 4b) Máx. disparos por CAMPANHA por dia */}
            <div className="flex items-center gap-3">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                Máx. disparos / campanha / dia
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="size-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs">
                      Limita quantas vezes esta regra pode disparar em <b>cada campanha individual</b> por dia BRT. Ex: <b>4</b> = a mesma campanha só duplica no máximo 4× por dia. Independente do "Máx. disparos / dia" (que é o total agregado da regra). <b>0</b> = sem limite.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Label>
              <Input
                type="number"
                min={0}
                className="w-20 h-8 text-xs tabular-nums"
                {...register("action.maxFiresPerCampaignPerDay", { valueAsNumber: true })}
              />
              <span className="text-xs text-muted-foreground">(0 = ∞)</span>
            </div>



            {/* 5) Hard lock por hora BRT — bloqueia religação por outras regras */}
            <div className="flex items-center gap-3">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                🔒 Travar religação até hora BRT
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="size-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs">
                      Hora BRT (0–23) até a qual <b>NENHUMA regra</b> pode religar a campanha pausada por esta regra — nem outra regra de smart re-enable. Útil para janelas tipo "3h pausa, só libera 9h". Vazio = sem lock.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Label>
              <Input
                type="number"
                min={0}
                max={23}
                placeholder="—"
                className="w-20 h-8 text-xs tabular-nums"
                {...register("action.hardStopUntilHourBRT", { valueAsNumber: true })}
              />
              <span className="text-xs text-muted-foreground">h BRT</span>
            </div>
          </section>

          {/* 5. NOTIFICAÇÃO */}
          <section className="space-y-3">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">5. Notificação</Label>
            <div className="flex items-center justify-between gap-3 rounded border border-border/60 bg-muted/20 p-3">
              <div className="flex items-center gap-3">
                <Controller
                  control={control}
                  name="notification.pushcut"
                  render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
                />
                <span className="text-xs">Notificar via Pushcut</span>
              </div>
              {values.notification.pushcut && (
                <Controller
                  control={control}
                  name="notification.severity"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">low</SelectItem>
                        <SelectItem value="medium">medium</SelectItem>
                        <SelectItem value="high">high</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              )}
            </div>
          </section>

          {/* 6. SIMULAÇÃO */}
          <section className="space-y-3">
            <div className="rounded border border-primary/30 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Beaker className="size-4 text-primary" />
                  <Label className="text-[11px] uppercase tracking-wider text-primary">Simulação retroativa</Label>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={simulating}
                  onClick={runSimulation}
                >
                  <Play className="size-3 mr-1.5" /> {simulating ? "Simulando…" : "Simular novamente"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Se essa regra estivesse ativa nas últimas 24h:</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded bg-background/60 p-2.5">
                  <div className="text-lg font-bold tabular-nums text-primary">{sim.fires}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">dispares</div>
                </div>
                <div className="rounded bg-background/60 p-2.5">
                  <div className="text-lg font-bold tabular-nums text-[hsl(var(--wr-positive))]">R$ {sim.saved}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">economia</div>
                </div>
                <div className="rounded bg-background/60 p-2.5">
                  <div className="text-lg font-bold tabular-nums text-[hsl(var(--wr-warning))]">{sim.falsePos}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">falsos +</div>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {sim.fires > 0
                  ? `Em campanhas: NDM-top-F3-001, NDM-top-F3-018, NDM-bttn-F1-022${sim.fires > 3 ? ", …" : ""}`
                  : "Nenhuma campanha disparou na simulação."}
              </p>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 z-10 flex items-center justify-between gap-2 px-5 py-3 border-t border-border/60 bg-background">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => handleSave(true)}>Salvar como rascunho</Button>
            <Button size="sm" onClick={() => handleSave(false)}>
              {isEditing ? "Salvar alterações" : "Criar regra (ativa)"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
