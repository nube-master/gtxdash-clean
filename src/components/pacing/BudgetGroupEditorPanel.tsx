import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type BudgetGroup,
  type BudgetGroupAction,
  type BudgetGroupCurrency,
  type RulePhase,
  type RuleSeverity,
  PROJECT_SLUGS,
  type ProjectSlug,
  ALL_ACCOUNTS,
  matchCampaignsForGroup,
  defaultBudgetGroup,
} from "./mockData";

interface Props {
  open: boolean;
  group: BudgetGroup | null; // null = create
  onClose: () => void;
  onSave: (g: BudgetGroup) => void;
}

const PHASES: RulePhase[] = ["F1", "F2", "F3"];

export function BudgetGroupEditorPanel({ open, group, onClose, onSave }: Props) {
  const [form, setForm] = useState<BudgetGroup>(defaultBudgetGroup());
  const [showMatchedList, setShowMatchedList] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(group ? { ...group } : defaultBudgetGroup());
      setShowMatchedList(false);
    }
  }, [open, group]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const matched = useMemo(
    () => matchCampaignsForGroup(form.matcher).filter((c) => c.status !== "paused"),
    [form.matcher]
  );

  const toggleProject = (p: ProjectSlug) => {
    setForm((f) => {
      const has = f.matcher.projects.includes(p);
      return {
        ...f,
        matcher: {
          ...f.matcher,
          projects: has
            ? f.matcher.projects.filter((x) => x !== p)
            : [...f.matcher.projects, p],
        },
      };
    });
  };

  const togglePhase = (p: RulePhase) => {
    setForm((f) => {
      const has = f.matcher.phases.includes(p);
      return {
        ...f,
        matcher: {
          ...f.matcher,
          phases: has ? f.matcher.phases.filter((x) => x !== p) : [...f.matcher.phases, p],
        },
      };
    });
  };

  const handleSave = () => {
    const toSave: BudgetGroup = {
      ...form,
      id: form.id || `bg-${Date.now()}`,
      name: form.name.trim() || "Sem nome",
    };
    onSave(toSave);
  };

  if (!open) return null;

  return createPortal(
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm animate-in fade-in"
        onClick={onClose}
      />
      {/* Panel */}
      <aside
        className="fixed right-0 top-0 z-50 h-full w-full max-w-[540px] bg-background border-l border-border shadow-2xl flex flex-col animate-in slide-in-from-right"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/60">
          <h2 className="text-sm font-bold uppercase tracking-wider">
            {group ? `Editar: ${group.name}` : "Criar novo grupo"}
          </h2>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {/* NOME */}
          <section className="space-y-2">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              1 · Nome
            </Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="ex: F3 NDM Escala"
              className="h-9 text-sm"
            />
          </section>

          {/* MATCHER */}
          <section className="space-y-3">
            <div>
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                2 · Matcher — quais campanhas pertencem ao grupo
              </Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Todos os filtros são opcionais. Combinam com AND.
              </p>
            </div>

            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Nome contém</Label>
              <Input
                value={form.matcher.nameContains}
                onChange={(e) =>
                  setForm({ ...form, matcher: { ...form.matcher, nameContains: e.target.value } })
                }
                placeholder="ex: F3, 1-250-1"
                className="h-8 text-xs mt-1"
              />
            </div>

            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Projeto</Label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {PROJECT_SLUGS.map((p) => {
                  const active = form.matcher.projects.includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => toggleProject(p)}
                      className={cn(
                        "px-2 py-1 rounded text-[11px] font-medium uppercase tracking-wider border transition-colors",
                        active
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted/40 text-muted-foreground border-border/60 hover:bg-muted"
                      )}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[10px] uppercase text-muted-foreground">Conta</Label>
                <Select
                  value={form.matcher.account}
                  onValueChange={(v) =>
                    setForm({ ...form, matcher: { ...form.matcher, account: v } })
                  }
                >
                  <SelectTrigger className="h-8 text-xs mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {ALL_ACCOUNTS.map((a) => (
                      <SelectItem key={a} value={a}>
                        {a}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] uppercase text-muted-foreground">Fase</Label>
                <div className="flex gap-1.5 mt-1">
                  {PHASES.map((p) => {
                    const active = form.matcher.phases.includes(p);
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => togglePhase(p)}
                        className={cn(
                          "flex-1 h-8 rounded text-[11px] font-medium uppercase border transition-colors",
                          active
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-muted/40 text-muted-foreground border-border/60 hover:bg-muted"
                        )}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Feedback live */}
            <div className="rounded border border-border/60 bg-muted/30 px-3 py-2 text-xs">
              🎯 Este grupo vai conter{" "}
              <span className="font-bold tabular-nums">{matched.length}</span>{" "}
              {matched.length === 1 ? "campanha ativa" : "campanhas ativas"}
              {matched.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowMatchedList((v) => !v)}
                  className="ml-2 text-primary hover:underline text-[11px]"
                >
                  {showMatchedList ? "ocultar ▴" : "ver lista ▾"}
                </button>
              )}
              {showMatchedList && (
                <ul className="mt-2 space-y-0.5 max-h-32 overflow-y-auto">
                  {matched.map((c) => (
                    <li
                      key={c.id}
                      className="font-mono text-[11px] text-muted-foreground truncate"
                    >
                      · {c.name || "Campanha sem nome"}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* CAPS */}
          <section className="space-y-3">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              3 · Caps — limites de gasto do grupo
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[10px] uppercase text-muted-foreground">
                  Cap horário /h
                </Label>
                <Input
                  type="number"
                  value={form.capHourly}
                  onChange={(e) => setForm({ ...form, capHourly: Number(e.target.value) || 0 })}
                  className="h-8 text-xs mt-1 tabular-nums"
                />
              </div>
              <div>
                <Label className="text-[10px] uppercase text-muted-foreground">
                  Cap diário /dia
                </Label>
                <Input
                  type="number"
                  value={form.capDaily}
                  onChange={(e) => setForm({ ...form, capDaily: Number(e.target.value) || 0 })}
                  className="h-8 text-xs mt-1 tabular-nums"
                />
              </div>
            </div>
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Moeda</Label>
              <Select
                value={form.currency}
                onValueChange={(v) => setForm({ ...form, currency: v as BudgetGroupCurrency })}
              >
                <SelectTrigger className="h-8 text-xs mt-1 w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BRL">BRL</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </section>

          {/* AÇÃO */}
          <section className="space-y-3">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              4 · Ação quando atinge o cap
            </Label>
            <div className="space-y-2">
              {[
                { v: "pause_all", label: "Pausar todas do grupo" },
                {
                  v: "pause_overpacing",
                  label: "Pausar só as que estouraram o pacing individual",
                },
                { v: "alert_only", label: "Apenas alertar" },
              ].map((opt) => (
                <label
                  key={opt.v}
                  className="flex items-center gap-2 cursor-pointer text-xs"
                >
                  <input
                    type="radio"
                    name="action"
                    checked={form.action === (opt.v as BudgetGroupAction)}
                    onChange={() => setForm({ ...form, action: opt.v as BudgetGroupAction })}
                    className="accent-primary"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">
                Cooldown (minutos)
              </Label>
              <Input
                type="number"
                value={form.cooldownMin}
                onChange={(e) => setForm({ ...form, cooldownMin: Number(e.target.value) || 0 })}
                className="h-8 text-xs mt-1 w-32 tabular-nums"
              />
            </div>
          </section>

          {/* NOTIFICAÇÃO */}
          <section className="space-y-3">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              5 · Notificação
            </Label>
            <div className="flex items-center justify-between rounded border border-border/60 px-3 py-2">
              <div className="text-xs">Notificar via Pushcut</div>
              <Switch
                checked={form.pushcut}
                onCheckedChange={(v) => setForm({ ...form, pushcut: v })}
              />
            </div>
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Severity</Label>
              <Select
                value={form.severity}
                onValueChange={(v) => setForm({ ...form, severity: v as RuleSeverity })}
              >
                <SelectTrigger className="h-8 text-xs mt-1 w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">low</SelectItem>
                  <SelectItem value="medium">medium</SelectItem>
                  <SelectItem value="high">high</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border/60">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSave}>
            {group ? "Salvar alterações" : "Criar grupo (ativo)"}
          </Button>
        </div>
      </aside>
    </>,
    document.body
  );
}
